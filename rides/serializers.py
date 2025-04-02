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
    ride_details = serializers.SerializerMethodField()
    nearest_dropoff_info = serializers.SerializerMethodField()
    
    class Meta:
        model = RideRequest
        fields = [
            'id', 'rider', 'ride', 'ride_details', 'pickup_location', 'dropoff_location',
            'pickup_latitude', 'pickup_longitude', 'dropoff_latitude',
            'dropoff_longitude', 'departure_time', 'seats_needed',
            'status', 'created_at', 'updated_at', 'nearest_dropoff_point', 'nearest_dropoff_info'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'ride': {'required': False}  # Make ride field optional during creation
        }

    def get_rider(self, obj):
        """
        Get rider details including contact information
        """
        if not obj.rider:
            return None
            
        # Log for debugging
        logger.info(f"Serializing rider {obj.rider.username} for ride request {obj.id}")
        logger.info(f"Rider has phone_number attribute: {hasattr(obj.rider, 'phone_number')}")
        phone = getattr(obj.rider, 'phone_number', None)
        logger.info(f"Rider phone_number value: {phone}")
        
        return {
            'id': obj.rider.id,
            'username': obj.rider.username,
            'first_name': obj.rider.first_name,
            'last_name': obj.rider.last_name,
            'email': obj.rider.email,
            'phone_number': phone
        }
    
    def get_ride_details(self, obj):
        """
        Get ride details including driver information
        """
        if not obj.ride:
            return None
            
        # Initialize driver information
        driver_info = None
        
        # Get driver details if available
        if obj.ride.driver:
            driver = obj.ride.driver
            logger.info(f"Serializing driver {driver.username} for ride request {obj.id}")
            logger.info(f"Driver has phone_number attribute: {hasattr(driver, 'phone_number')}")
            phone = getattr(driver, 'phone_number', None)
            logger.info(f"Driver phone_number value: {phone}")
            
            driver_info = {
                'id': driver.id,
                'username': driver.username,
                'first_name': driver.first_name,
                'last_name': driver.last_name,
                'email': driver.email,
                'phone_number': phone,
                # Include vehicle information
                'vehicle_make': getattr(driver, 'vehicle_make', ''),
                'vehicle_model': getattr(driver, 'vehicle_model', ''),
                'vehicle_year': getattr(driver, 'vehicle_year', ''),
                'vehicle_color': getattr(driver, 'vehicle_color', ''),
                'license_plate': getattr(driver, 'license_plate', '')
            }
        
        return {
            'id': obj.ride.id,
            'start_location': obj.ride.start_location,
            'end_location': obj.ride.end_location,
            'departure_time': obj.ride.departure_time,
            'driver': driver_info
        }
    
    def get_nearest_dropoff_info(self, obj):
        """Format the nearest_dropoff_point data in a user-friendly way"""
        if not obj.nearest_dropoff_point:
            return None
        
        try:
            dropoff_point = obj.nearest_dropoff_point
            
            # Log the original data for debugging
            logger.info(f"Processing nearest_dropoff_point for ride request {obj.id}: {repr(dropoff_point)}")
            
            # Handle case where dropoff_point is already a JSON-parsed dict
            if isinstance(dropoff_point, dict):
                logger.info(f"nearest_dropoff_point is a dict: {dropoff_point}")
            # Handle case where dropoff_point is a string (JSON or otherwise)
            elif isinstance(dropoff_point, str):
                try:
                    dropoff_point = json.loads(dropoff_point)
                    logger.info(f"Parsed nearest_dropoff_point from JSON string: {dropoff_point}")
                except json.JSONDecodeError:
                    logger.error(f"Could not parse nearest_dropoff_point as JSON: {dropoff_point}")
                    return {
                        'coordinates': {'latitude': 0, 'longitude': 0},
                        'distance_to_destination': "Unknown",
                        'address': "Unknown location",
                        'message': "Dropoff information is not available."
                    }
            else:
                logger.error(f"Unexpected nearest_dropoff_point type: {type(dropoff_point)}")
                return None
            
            # Extract coordinates with fallbacks
            coordinates = dropoff_point.get('coordinates', [0, 0])
            
            # Handle different coordinate formats consistently
            if isinstance(coordinates, list) or isinstance(coordinates, tuple):
                # For list/tuple format, assume (lng, lat) format
                if len(coordinates) >= 2:
                    longitude, latitude = coordinates[0], coordinates[1]
                    logger.info(f"Extracted coordinates from list/tuple: lng={longitude}, lat={latitude}")
                else:
                    longitude, latitude = 0, 0
                    logger.warning(f"Incomplete coordinates list/tuple: {coordinates}")
            elif isinstance(coordinates, dict):
                # For dict format, check for various key combinations
                if 'longitude' in coordinates and 'latitude' in coordinates:
                    longitude = coordinates.get('longitude', 0)
                    latitude = coordinates.get('latitude', 0)
                    logger.info(f"Extracted coordinates from dict with lng/lat keys: lng={longitude}, lat={latitude}")
                elif 'lng' in coordinates and 'lat' in coordinates:
                    longitude = coordinates.get('lng', 0)
                    latitude = coordinates.get('lat', 0)
                    logger.info(f"Extracted coordinates from dict with lng/lat keys: lng={longitude}, lat={latitude}")
                elif 'lon' in coordinates and 'lat' in coordinates:
                    longitude = coordinates.get('lon', 0)
                    latitude = coordinates.get('lat', 0)
                    logger.info(f"Extracted coordinates from dict with lon/lat keys: lng={longitude}, lat={latitude}")
                elif 0 in coordinates and 1 in coordinates:
                    # Indexed dict like {0: lng, 1: lat}
                    longitude, latitude = coordinates[0], coordinates[1]
                    logger.info(f"Extracted coordinates from indexed dict: lng={longitude}, lat={latitude}")
                else:
                    longitude, latitude = 0, 0
                    logger.warning(f"Could not extract coordinates from dict: {coordinates}")
            else:
                longitude, latitude = 0, 0
                logger.error(f"Unexpected coordinates format: {coordinates}")
            
            # Validate coordinates
            if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                # Try swapping if they appear to be reversed
                if (-90 <= longitude <= 90 and -180 <= latitude <= 180):
                    logger.warning(f"Coordinates appear to be reversed. Swapping lat/lng values.")
                    longitude, latitude = latitude, longitude
                else:
                    logger.error(f"Invalid coordinate values outside normal ranges: lng={longitude}, lat={latitude}")
                    # Use fallback values
                    longitude, latitude = 0, 0
            
            # Get distance with fallbacks
            distance = dropoff_point.get('distance_to_destination', 0)
            unit = dropoff_point.get('unit', 'kilometers')
            
            # Get address with fallback
            address = dropoff_point.get('address', 'Unknown location')
            if not address or address == 'None':
                address = 'Location near your destination'
            
            # Format distance for display
            formatted_distance = f"{distance:.2f} {unit}" if isinstance(distance, (int, float)) else "Unknown distance"
            if isinstance(distance, (int, float)) and distance < 1:
                formatted_distance = f"{distance * 1000:.0f} meters"
            
            result = {
                'coordinates': {
                    'latitude': latitude,
                    'longitude': longitude
                },
                'distance_to_destination': formatted_distance,
                'address': address,
                'message': f"The driver can drop you off at {address}, which is {formatted_distance} from your destination."
            }
            
            logger.info(f"Formatted nearest_dropoff_info: {result}")
            return result
        except Exception as e:
            logger.error(f"Error formatting nearest_dropoff_info: {str(e)}")
            logger.exception("Exception details:")
            # Return minimal valid data rather than None
            return {
                'coordinates': {'latitude': 0, 'longitude': 0},
                'distance_to_destination': "Unknown",
                'address': "Near destination",
                'message': "The driver can drop you off near your destination."
            }

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