from rest_framework import serializers
from .models import Ride, RideRequest, Notification
from django.contrib.auth import get_user_model
import logging
from django.utils import timezone

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
            return {
                'id': obj.ride.id,
                'start_location': obj.ride.start_location,
                'end_location': obj.ride.end_location,
                'departure_time': obj.ride.departure_time,
                'available_seats': obj.ride.available_seats
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

    def get_distance(self, obj):
        return obj.get_route_distance()

    def validate(self, data):
        logger.info("Validating ride data: %s", data)
        
        if data['available_seats'] < 1:
            logger.warning("Invalid available seats: %s", data['available_seats'])
            raise serializers.ValidationError("Available seats must be at least 1")
            
        if data['price_per_seat'] < 0:
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
    ride = serializers.SerializerMethodField()

    class Meta:
        model = RideRequest
        fields = [
            'id', 'rider', 'ride', 'pickup_location', 'dropoff_location',
            'pickup_latitude', 'pickup_longitude', 'dropoff_latitude',
            'dropoff_longitude', 'seats_needed', 'status', 'departure_time'
        ]
        read_only_fields = ['id', 'status']

    def get_rider(self, obj):
        if obj.rider:
            return {
                'id': obj.rider.id,
                'username': obj.rider.username,
                'email': obj.rider.email,
                'phone_number': obj.rider.phone_number,
                'first_name': obj.rider.first_name,
                'last_name': obj.rider.last_name
            }
        return None

    def get_ride(self, obj):
        if obj.ride:
            return {
                'id': obj.ride.id,
                'driver': {
                    'id': obj.ride.driver.id,
                    'username': obj.ride.driver.username,
                    'email': obj.ride.driver.email,
                    'phone_number': obj.ride.driver.phone_number,
                    'first_name': obj.ride.driver.first_name,
                    'last_name': obj.ride.driver.last_name,
                    'vehicle_make': obj.ride.driver.vehicle_make,
                    'vehicle_model': obj.ride.driver.vehicle_model,
                    'vehicle_year': obj.ride.driver.vehicle_year,
                    'vehicle_color': obj.ride.driver.vehicle_color,
                    'license_plate': obj.ride.driver.license_plate,
                    'max_passengers': obj.ride.driver.max_passengers
                },
                'start_location': obj.ride.start_location,
                'end_location': obj.ride.end_location,
                'departure_time': obj.ride.departure_time,
                'available_seats': obj.ride.available_seats,
                'price_per_seat': obj.ride.price_per_seat,
                'status': obj.ride.status
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