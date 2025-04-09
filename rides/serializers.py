from rest_framework import serializers
from .models import Ride, RideRequest, Notification
from django.contrib.auth import get_user_model
import logging
from django.utils import timezone
import json

User = get_user_model()
logger = logging.getLogger(__name__)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'user_type', 'first_name', 'last_name', 
                 'phone_number', 'vehicle_make', 'vehicle_model', 'vehicle_color', 
                 'vehicle_year', 'license_plate')

class NotificationSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    sender_email = serializers.SerializerMethodField()
    sender_phone = serializers.SerializerMethodField()
    sender_vehicle = serializers.SerializerMethodField()
    ride_details = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ['id', 'recipient', 'sender', 'sender_email', 'sender_phone', 'sender_vehicle', 
                 'ride_details', 'message', 'ride', 'ride_request', 'notification_type', 'created_at', 'is_read']

    def get_sender(self, obj):
        if obj.sender:
            return {
                'id': obj.sender.id,
                'name': f"{obj.sender.first_name} {obj.sender.last_name}",
                'email': obj.sender.email,
                'phone': obj.sender.phone_number if hasattr(obj.sender, 'phone_number') else None
            }
        return None

    def get_sender_email(self, obj):
        if obj.sender:
            return obj.sender.email
        return None

    def get_sender_phone(self, obj):
        if obj.sender:
            return obj.sender.phone_number if hasattr(obj.sender, 'phone_number') else None
        return None

    def get_sender_vehicle(self, obj):
        if obj.sender and hasattr(obj.sender, 'vehicle_make'):
            return {
                'make': obj.sender.vehicle_make,
                'model': obj.sender.vehicle_model,
                'color': obj.sender.vehicle_color,
                'plate': obj.sender.license_plate
            }
        return None

    def get_ride_details(self, obj):
        if obj.ride:
            # Get nearest dropoff point if this is a ride match notification
            nearest_dropoff_info = None
            if obj.notification_type == 'RIDE_MATCH' and obj.ride_request and obj.ride_request.nearest_dropoff_point:
                try:
                    # Try to get the nearest dropoff point coordinates
                    dropoff_point = obj.ride_request.nearest_dropoff_point
                    
                    # Get a more readable address for the dropoff point
                    address = "Near destination"
                    try:
                        from geopy.geocoders import Nominatim
                        import json
                        
                        # Parse coordinates from different possible formats
                        if isinstance(dropoff_point, str):
                            try:
                                dropoff_point = json.loads(dropoff_point)
                            except:
                                # If can't parse as JSON, try to extract coordinates directly
                                import re
                                coords = re.findall(r"[-+]?\d*\.\d+|\d+", dropoff_point)
                                if len(coords) >= 2:
                                    lat, lng = float(coords[0]), float(coords[1])
                                    dropoff_point = [lat, lng]
                        
                        # Extract coordinates based on format
                        if isinstance(dropoff_point, list) or isinstance(dropoff_point, tuple):
                            if len(dropoff_point) >= 2:
                                lat, lng = dropoff_point[0], dropoff_point[1]
                        elif isinstance(dropoff_point, dict):
                            if 'coordinates' in dropoff_point:
                                coords = dropoff_point['coordinates']
                                if isinstance(coords, list) and len(coords) >= 2:
                                    lat, lng = coords[0], coords[1]
                            elif 'lat' in dropoff_point and 'lng' in dropoff_point:
                                lat, lng = dropoff_point['lat'], dropoff_point['lng']
                            elif 'latitude' in dropoff_point and 'longitude' in dropoff_point:
                                lat, lng = dropoff_point['latitude'], dropoff_point['longitude']
                        
                        # Get address using geocoding
                        geolocator = Nominatim(user_agent="chalbeyy")
                        location = geolocator.reverse((lat, lng))
                        if location and location.address:
                            address = location.address
                    except Exception as e:
                        logger.error(f"Error getting address for nearest dropoff: {str(e)}")
                    
                    nearest_dropoff_info = {
                        'coordinates': dropoff_point,
                        'address': address
                    }
                except Exception as e:
                    logger.error(f"Error processing nearest dropoff point: {str(e)}")
            
            # Format departure time in EDT timezone
            import pytz
            departure_time = obj.ride.departure_time
            est = pytz.timezone('America/New_York')
            departure_time_edt = departure_time.astimezone(est)
            formatted_time = departure_time_edt.strftime("%m/%d/%Y, %I:%M:%S %p EDT")
            
            return {
                'id': obj.ride.id,
                'start_location': obj.ride.start_location,
                'end_location': obj.ride.end_location,
                'departure_time': obj.ride.departure_time,
                'formatted_departure_time': formatted_time,
                'available_seats': obj.ride.available_seats,
                'nearest_dropoff_info': nearest_dropoff_info
            }
        return None

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        # Ensure ride_request is included even if it's None
        if 'ride_request' not in representation:
            representation['ride_request'] = instance.ride_request_id
        return representation

class RideSerializer(serializers.ModelSerializer):
    driver = serializers.PrimaryKeyRelatedField(read_only=True)
    distance = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = (
            'id', 'driver', 'start_location', 'end_location',
            'start_latitude', 'start_longitude', 'end_latitude',
            'end_longitude', 'departure_time', 'available_seats',
            'price_per_seat', 'status', 'created_at', 'updated_at',
            'distance'
        )
        read_only_fields = ('start_latitude', 'start_longitude',
                           'end_latitude', 'end_longitude', 'created_at',
                           'updated_at')
        extra_kwargs = {
            'price_per_seat': {'required': False, 'default': 0}
        }

    def get_distance(self, obj):
        return obj.get_route_distance()

    def validate(self, data):
        logger.info("Validating ride data: %s", data)
        
        if data['available_seats'] < 1:
            logger.warning("Invalid available seats: %s", data['available_seats'])
            raise serializers.ValidationError("Available seats must be at least 1")
            
        # If price_per_seat is provided, validate it's not negative
        if 'price_per_seat' in data and data['price_per_seat'] < 0:
            logger.warning("Invalid price per seat: %s", data['price_per_seat'])
            raise serializers.ValidationError("Price per seat cannot be negative")
        
        # Get the driver (current user) from the context
        driver = self.context['request'].user
        logger.info("Validating driver: %s", driver.username)
        logger.info("Driver vehicle info: make=%s, model=%s, year=%s, color=%s, plate=%s, max_passengers=%s",
                   driver.vehicle_make, driver.vehicle_model, driver.vehicle_year,
                   driver.vehicle_color, driver.license_plate, driver.max_passengers)
        
        if not all([driver.vehicle_make, driver.vehicle_model, driver.vehicle_year, 
                   driver.vehicle_color, driver.license_plate]):
            logger.warning("Missing vehicle information for driver: %s", driver.username)
            raise serializers.ValidationError(
                "Please complete your vehicle information in your profile before offering rides"
            )
        
        if data['available_seats'] > driver.max_passengers:
            logger.warning("Available seats (%s) exceeds max passengers (%s)",
                         data['available_seats'], driver.max_passengers)
            raise serializers.ValidationError(
                f"Available seats cannot exceed your vehicle's maximum capacity of {driver.max_passengers}"
            )
        
        return data

class RideRequestSerializer(serializers.ModelSerializer):
    ride = RideSerializer(read_only=True)
    rider = UserSerializer(read_only=True)
    
    # Add these fields to ensure they're included in the serialized data
    pickup_latitude = serializers.FloatField()
    pickup_longitude = serializers.FloatField()
    dropoff_latitude = serializers.FloatField()
    dropoff_longitude = serializers.FloatField()
    
    class Meta:
        model = RideRequest
        fields = '__all__'
        depth = 1
        
    def to_representation(self, instance):
        """
        Add additional fields to help with displaying the ride request.
        """
        data = super().to_representation(instance)
        
        # Ensure coordinate fields are included
        data['pickup_latitude'] = instance.pickup_latitude
        data['pickup_longitude'] = instance.pickup_longitude
        data['dropoff_latitude'] = instance.dropoff_latitude
        data['dropoff_longitude'] = instance.dropoff_longitude
        
        # Add display names for origin and destination
        try:
            data['origin_display_name'] = instance.pickup_location
        except:
            data['origin_display_name'] = "Unknown Origin"
            
        try:
            data['destination_display_name'] = instance.dropoff_location
        except:
            data['destination_display_name'] = "Unknown Destination"
        
        # Add driver information if available
        if instance.ride and instance.ride.driver:
            driver = instance.ride.driver
            data['driver_name'] = f"{driver.first_name} {driver.last_name}".strip()
            data['driver_id'] = driver.id
            data['driver_email'] = driver.email
            data['driver_phone'] = getattr(driver, 'phone_number', None)
            data['vehicle_make'] = getattr(driver, 'vehicle_make', None)
            data['vehicle_model'] = getattr(driver, 'vehicle_model', None)
            data['vehicle_color'] = getattr(driver, 'vehicle_color', None)
            data['vehicle_year'] = getattr(driver, 'vehicle_year', None)
            data['license_plate'] = getattr(driver, 'license_plate', None)
            
        return data

class RideDetailSerializer(RideSerializer):
    driver = serializers.SerializerMethodField()
    requests = RideRequestSerializer(many=True, read_only=True)

    class Meta(RideSerializer.Meta):
        fields = RideSerializer.Meta.fields + ('requests',)

    def get_driver(self, obj):
        from users.serializers import UserSerializer
        driver_data = UserSerializer(obj.driver).data
        # Add a full_name field to the driver data
        if obj.driver:
            driver_data['full_name'] = f"{obj.driver.first_name} {obj.driver.last_name}".strip()
        return driver_data 