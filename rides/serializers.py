from rest_framework import serializers
from .models import Ride, RideRequest, Notification
from django.contrib.auth import get_user_model
import logging
from django.utils import timezone
import json

User = get_user_model()
logger = logging.getLogger(__name__)

def get_display_name_from_coordinates(lat, lng):
    """
    Returns a display name for a location based on coordinates.
    If coordinates are not valid, returns a placeholder.
    
    In a production environment, this could be integrated with a 
    geocoding service like Google Maps, Mapbox, or OpenStreetMap.
    """
    if lat is None or lng is None:
        return "Location not specified"
    
    try:
        # In a real implementation, you would make an API call to a geocoding service
        # For now, we'll return the coordinates formatted nicely
        return f"({lat:.6f}, {lng:.6f})"
    except Exception as e:
        print(f"Error getting display name from coordinates: {e}")
        return f"({lat}, {lng})"

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
    pickup_latitude = serializers.SerializerMethodField()
    pickup_longitude = serializers.SerializerMethodField()
    dropoff_latitude = serializers.SerializerMethodField()
    dropoff_longitude = serializers.SerializerMethodField()
    rider_details = serializers.SerializerMethodField()
    
    class Meta:
        model = RideRequest
        fields = [
            'id', 'ride', 'rider', 'pickup_location', 'dropoff_location', 
            'seats_needed', 'status', 'created_at', 'updated_at',
            'pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 
            'dropoff_longitude', 'rider_details'
        ]
    
    def get_pickup_latitude(self, obj):
        try:
            return float(obj.pickup_location.split(',')[0])
        except (AttributeError, IndexError, ValueError):
            return None
    
    def get_pickup_longitude(self, obj):
        try:
            return float(obj.pickup_location.split(',')[1])
        except (AttributeError, IndexError, ValueError):
            return None
    
    def get_dropoff_latitude(self, obj):
        try:
            return float(obj.dropoff_location.split(',')[0])
        except (AttributeError, IndexError, ValueError):
            return None
    
    def get_dropoff_longitude(self, obj):
        try:
            return float(obj.dropoff_location.split(',')[1])
        except (AttributeError, IndexError, ValueError):
            return None
    
    def get_rider_details(self, obj):
        if not obj.rider:
            return None
        
        user = obj.rider
        rider_data = {
            'id': user.id,
            'full_name': f"{user.first_name} {user.last_name}".strip() or "Anonymous User",
            'email': user.email or "Not provided",
            'phone_number': getattr(user, 'phone_number', None) or "Not provided"
        }
        
        # Get the rider profile if available
        try:
            if hasattr(user, 'riderprofile'):
                profile = user.riderprofile
                rider_data['profile_id'] = profile.id
                rider_data['preferred_contact'] = getattr(profile, 'preferred_contact', None)
                rider_data['profile_picture'] = profile.profile_picture.url if hasattr(profile, 'profile_picture') and profile.profile_picture else None
        except Exception as e:
            print(f"Error getting rider profile: {e}")
        
        return rider_data
        
    def to_representation(self, instance):
        representation = super().to_representation(instance)
        
        # Add display names for locations if available
        representation['pickup_display_name'] = get_display_name_from_coordinates(representation.get('pickup_latitude'), representation.get('pickup_longitude'))
        representation['dropoff_display_name'] = get_display_name_from_coordinates(representation.get('dropoff_latitude'), representation.get('dropoff_longitude'))
        
        # If ride is included, add driver information
        if instance.ride:
            try:
                driver = instance.ride.driver
                if driver:
                    representation['driver'] = {
                        'id': driver.id,
                        'full_name': f"{driver.first_name} {driver.last_name}".strip() or "Anonymous Driver",
                        'email': driver.email or "Not provided",
                        'phone_number': getattr(driver, 'phone_number', None) or "Not provided"
                    }
                    
                    # Add vehicle information if available
                    if hasattr(driver, 'driverprofile') and driver.driverprofile:
                        vehicle = driver.driverprofile.vehicle
                        if vehicle:
                            representation['vehicle'] = {
                                'make': vehicle.make,
                                'model': vehicle.model,
                                'color': vehicle.color,
                                'license_plate': vehicle.license_plate
                            }
            except Exception as e:
                print(f"Error adding driver information: {e}")
                
        return representation

class RideDetailSerializer(RideSerializer):
    driver_info = serializers.SerializerMethodField()
    ride_requests = RideRequestSerializer(many=True, read_only=True, source='riderequest_set')
    
    class Meta:
        model = Ride
        fields = RideSerializer.Meta.fields + ('driver_info', 'ride_requests')
    
    def get_driver_info(self, obj):
        driver = obj.driver
        if not driver:
            return None
        
        driver_data = {
            'id': driver.id,
            'full_name': f"{driver.first_name} {driver.last_name}".strip() or "Anonymous Driver",
            'email': driver.email or "Not provided",
            'phone_number': getattr(driver, 'phone_number', None) or "Not provided"
        }
        
        # Get the driver profile if available
        try:
            if hasattr(driver, 'driverprofile'):
                profile = driver.driverprofile
                driver_data['profile_id'] = profile.id
                driver_data['preferred_contact'] = getattr(profile, 'preferred_contact', None)
                
                # Add vehicle information if available
                if profile.vehicle:
                    vehicle = profile.vehicle
                    driver_data['vehicle'] = {
                        'make': vehicle.make,
                        'model': vehicle.model,
                        'color': vehicle.color,
                        'license_plate': vehicle.license_plate
                    }
        except Exception as e:
            print(f"Error getting driver profile: {e}")
        
        return driver_data 