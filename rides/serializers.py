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
        fields = ('id', 'username', 'email', 'user_type')

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
    rider = serializers.SerializerMethodField()
    rider_id = serializers.PrimaryKeyRelatedField(
        source='rider',
        queryset=User.objects.all(),
        write_only=True,
        required=False
    )
    ride_details = serializers.SerializerMethodField()
    nearest_dropoff_info = serializers.SerializerMethodField()
    optimal_pickup_info = serializers.SerializerMethodField()
    driver_details = serializers.SerializerMethodField()
    
    class Meta:
        model = RideRequest
        fields = [
            'id', 'rider', 'rider_id', 'ride', 'ride_details', 'pickup_location', 'dropoff_location',
            'pickup_latitude', 'pickup_longitude', 'dropoff_latitude',
            'dropoff_longitude', 'departure_time', 'seats_needed',
            'status', 'created_at', 'updated_at', 'nearest_dropoff_point', 
            'nearest_dropoff_info', 'optimal_pickup_point', 'optimal_pickup_info',
            'driver_details'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'ride': {'required': False},
        }
    
    def get_rider(self, obj):
        user = obj.rider
        return {
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'phone_number': user.phone_number
        }
    
    def get_ride_details(self, obj):
        ride = obj.ride
        if not ride:
            return None
        
        driver = ride.driver
        return {
            'id': ride.id,
            'driver': {
                'id': driver.id,
                'username': driver.username,
                'first_name': driver.first_name,
                'last_name': driver.last_name,
                'email': driver.email,
                'phone_number': driver.phone_number,
                'vehicle_make': driver.vehicle_make,
                'vehicle_model': driver.vehicle_model,
                'vehicle_color': driver.vehicle_color,
                'license_plate': driver.license_plate
            },
            'start_location': ride.start_location,
            'end_location': ride.end_location,
            'departure_time': ride.departure_time,
            'seats_available': ride.seats_available,
            'route_distance': ride.route_distance,
            'route_duration': ride.route_duration
        }
    
    def get_nearest_dropoff_info(self, obj):
        """
        Safely extract nearest dropoff information from the nearest_dropoff_point field
        """
        try:
            if not obj.nearest_dropoff_point:
                return None
                
            # Try to parse if it's a string
            dropoff_data = None
            if isinstance(obj.nearest_dropoff_point, str):
                try:
                    dropoff_data = json.loads(obj.nearest_dropoff_point)
                except json.JSONDecodeError:
                    logger.warning(f"Could not decode nearest_dropoff_point JSON for ride request {obj.id}")
                    # Try to see if it's a tuple of coordinates as string
                    import re
                    coords = re.findall(r"[-+]?\d+\.\d+", obj.nearest_dropoff_point)
                    if len(coords) >= 2:
                        try:
                            lat, lng = float(coords[0]), float(coords[1])
                            dropoff_data = {'latitude': lat, 'longitude': lng}
                        except (ValueError, IndexError):
                            pass
            else:
                dropoff_data = obj.nearest_dropoff_point
                
            # Handle case where dropoff_data is None
            if not dropoff_data:
                return None
            
            # Handle tuple or list format
            if isinstance(dropoff_data, (list, tuple)) and len(dropoff_data) >= 2:
                try:
                    return {
                        'address': 'Location coordinates',
                        'latitude': float(dropoff_data[0]),
                        'longitude': float(dropoff_data[1]),
                        'distance_from_rider': None
                    }
                except (ValueError, TypeError):
                    # If conversion to float fails, return a safe default
                    return {
                        'address': 'Location coordinates (format error)',
                        'latitude': None,
                        'longitude': None,
                        'distance_from_rider': None
                    }
                
            # Handle dictionary format
            if isinstance(dropoff_data, dict):
                result = {
                    'address': dropoff_data.get('address', 'Unknown location'),
                    'latitude': None,
                    'longitude': None,
                    'distance_from_rider': None
                }
                
                # Try to extract coordinates from various possible formats
                if 'latitude' in dropoff_data and 'longitude' in dropoff_data:
                    try:
                        result['latitude'] = float(dropoff_data.get('latitude'))
                        result['longitude'] = float(dropoff_data.get('longitude'))
                    except (ValueError, TypeError):
                        pass
                elif 'lat' in dropoff_data and 'lng' in dropoff_data:
                    try:
                        result['latitude'] = float(dropoff_data.get('lat'))
                        result['longitude'] = float(dropoff_data.get('lng'))
                    except (ValueError, TypeError):
                        pass
                elif 'coordinates' in dropoff_data:
                    coords = dropoff_data.get('coordinates')
                    if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                        try:
                            result['latitude'] = float(coords[0])
                            result['longitude'] = float(coords[1])
                        except (ValueError, TypeError):
                            pass
                
                # Handle distance field if present
                if 'distance_from_rider' in dropoff_data:
                    try:
                        result['distance_from_rider'] = float(dropoff_data.get('distance_from_rider'))
                    except (ValueError, TypeError):
                        pass
                    
                return result
                
            # Default minimal response if we can't interpret the data
            return {
                'address': 'Data format not recognized',
                'latitude': None,
                'longitude': None,
                'distance_from_rider': None
            }
        except Exception as e:
            logger.error(f"Error extracting nearest dropoff info for ride {obj.id}: {str(e)}")
            # Return None instead of failing
            return None
    
    def get_optimal_pickup_info(self, obj):
        """
        Safely extract optimal pickup information from the optimal_pickup_point field
        """
        try:
            if not obj.optimal_pickup_point:
                return None
                
            # Try to parse if it's a string
            pickup_data = None
            if isinstance(obj.optimal_pickup_point, str):
                try:
                    pickup_data = json.loads(obj.optimal_pickup_point)
                except json.JSONDecodeError:
                    logger.warning(f"Could not decode optimal_pickup_point JSON for ride request {obj.id}")
                    # Try to see if it's a tuple of coordinates as string
                    import re
                    coords = re.findall(r"[-+]?\d+\.\d+", obj.optimal_pickup_point)
                    if len(coords) >= 2:
                        try:
                            lat, lng = float(coords[0]), float(coords[1])
                            pickup_data = {'latitude': lat, 'longitude': lng}
                        except (ValueError, IndexError):
                            pass
            else:
                pickup_data = obj.optimal_pickup_point
                
            # Handle case where pickup_data is None
            if not pickup_data:
                return None
            
            # Handle tuple or list format
            if isinstance(pickup_data, (list, tuple)) and len(pickup_data) >= 2:
                try:
                    return {
                        'address': 'Location coordinates',
                        'latitude': float(pickup_data[0]),
                        'longitude': float(pickup_data[1]),
                        'distance_from_rider': None
                    }
                except (ValueError, TypeError):
                    # If conversion to float fails, return a safe default
                    return {
                        'address': 'Location coordinates (format error)',
                        'latitude': None,
                        'longitude': None,
                        'distance_from_rider': None
                    }
                
            # Handle dictionary format
            if isinstance(pickup_data, dict):
                result = {
                    'address': pickup_data.get('address', 'Unknown location'),
                    'latitude': None,
                    'longitude': None,
                    'distance_from_rider': None
                }
                
                # Try to extract coordinates from various possible formats
                if 'latitude' in pickup_data and 'longitude' in pickup_data:
                    try:
                        result['latitude'] = float(pickup_data.get('latitude'))
                        result['longitude'] = float(pickup_data.get('longitude'))
                    except (ValueError, TypeError):
                        pass
                elif 'lat' in pickup_data and 'lng' in pickup_data:
                    try:
                        result['latitude'] = float(pickup_data.get('lat'))
                        result['longitude'] = float(pickup_data.get('lng'))
                    except (ValueError, TypeError):
                        pass
                elif 'coordinates' in pickup_data:
                    coords = pickup_data.get('coordinates')
                    if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                        try:
                            result['latitude'] = float(coords[0])
                            result['longitude'] = float(coords[1])
                        except (ValueError, TypeError):
                            pass
                
                # Handle distance field if present
                if 'distance_from_rider' in pickup_data:
                    try:
                        result['distance_from_rider'] = float(pickup_data.get('distance_from_rider'))
                    except (ValueError, TypeError):
                        pass
                    
                return result
                
            # Default minimal response if we can't interpret the data
            return {
                'address': 'Data format not recognized',
                'latitude': None,
                'longitude': None,
                'distance_from_rider': None
            }
        except Exception as e:
            logger.error(f"Error extracting optimal pickup info for ride {obj.id}: {str(e)}")
            # Return None instead of failing
            return None

    def get_driver_details(self, obj):
        if obj.ride and obj.ride.driver:
            driver = obj.ride.driver
            return {
                'id': driver.id,
                'username': driver.username,
                'first_name': driver.first_name,
                'last_name': driver.last_name,
                'email': driver.email,
                'phone_number': driver.phone_number,
                'vehicle_make': driver.vehicle_make,
                'vehicle_model': driver.vehicle_model,
                'vehicle_color': driver.vehicle_color,
                'license_plate': driver.license_plate
            }
        return None

    def validate(self, data):
        logger.info(f"Validating ride request data: {data}")
        
        # Check if the rider has enough seats
        if data['seats_needed'] <= 0:
            logger.error("Invalid seats_needed value")
            raise serializers.ValidationError("Number of seats needed must be greater than 0")

        # Check if departure time is in the future
        if data['departure_time'] <= timezone.now():
            logger.error(f"Invalid departure time: {data['departure_time']}")
            raise serializers.ValidationError("Departure time must be in the future")

        # Validate coordinates
        if not all([
            data.get('pickup_latitude'),
            data.get('pickup_longitude'),
            data.get('dropoff_latitude'),
            data.get('dropoff_longitude')
        ]):
            logger.error("Missing coordinate data")
            raise serializers.ValidationError("All coordinates must be provided")

        # Validate locations
        if not data.get('pickup_location') or not data.get('dropoff_location'):
            logger.error("Missing location data")
            raise serializers.ValidationError("Pickup and dropoff locations must be provided")

        return data

class RideDetailSerializer(RideSerializer):
    driver = serializers.SerializerMethodField()
    requests = RideRequestSerializer(many=True, read_only=True)

    class Meta(RideSerializer.Meta):
        fields = RideSerializer.Meta.fields + ('requests',)

    def get_driver(self, obj):
        from users.serializers import UserSerializer
        return UserSerializer(obj.driver).data 