from django.db import models
from django.conf import settings
from geopy.geocoders import Nominatim
from geopy.distance import great_circle
from .utils import get_route_details, format_duration, format_distance, calculate_optimal_pickup_dropoff
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import requests
import logging
from django.db.models.signals import post_init
import json
from django.db import transaction

logger = logging.getLogger(__name__)

User = get_user_model()

# Signal handler to track model changes
def store_initial_values(sender, instance, **kwargs):
    """Store the initial values of a model to track changes"""
    instance._loaded_values = {}
    if not instance._state.adding:  # Only for existing instances
        for field in sender._meta.fields:
            instance._loaded_values[field.name] = getattr(instance, field.name)

# Create a decorator for easily applying the signal
def track_model_changes(cls):
    """Decorator to enable change tracking for a model"""
    post_init.connect(store_initial_values, sender=cls)
    return cls

class Ride(models.Model):
    STATUS_CHOICES = (
        ('SCHEDULED', 'Scheduled'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    )

    driver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='driver_rides'
    )
    start_location = models.CharField(max_length=255)
    end_location = models.CharField(max_length=255)
    start_latitude = models.FloatField()
    start_longitude = models.FloatField()
    end_latitude = models.FloatField()
    end_longitude = models.FloatField()
    departure_time = models.DateTimeField()
    available_seats = models.IntegerField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='SCHEDULED'
    )
    route_geometry = models.JSONField(null=True, blank=True)
    route_duration = models.IntegerField(null=True, blank=True)  # in seconds
    route_distance = models.FloatField(null=True, blank=True)  # in meters
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not all([self.start_latitude, self.start_longitude, self.end_latitude, self.end_longitude]):
            geolocator = Nominatim(user_agent="carpool_app")
            
            if not (self.start_latitude and self.start_longitude):
                start_location = geolocator.geocode(self.start_location)
                if start_location:
                    self.start_latitude = start_location.latitude
                    self.start_longitude = start_location.longitude
                else: 
                    logger.warning(f"Geocoding failed for start location: {self.start_location}")
            
            if not (self.end_latitude and self.end_longitude):
                end_location = geolocator.geocode(self.end_location)
                if end_location:
                    self.end_latitude = end_location.latitude
                    self.end_longitude = end_location.longitude
                else:
                    logger.warning(f"Geocoding failed for end location: {self.end_location}")

        # Calculate route details if coordinates are available
        if all([self.start_latitude, self.start_longitude, self.end_latitude, self.end_longitude]):
            start_coords = (self.start_longitude, self.start_latitude)
            end_coords = (self.end_longitude, self.end_latitude)
            logger.info(f"RIDE_SAVE: Attempting to get route details for Ride ID {self.id or 'NEW'}...")
            logger.info(f"RIDE_SAVE: Start Coords (lon, lat): {start_coords}")
            logger.info(f"RIDE_SAVE: End Coords (lon, lat): {end_coords}")
            
            route_details = get_route_details(start_coords, end_coords)
            
            # --- Add Detailed Logging --- 
            logger.debug(f"RIDE_SAVE: Raw route_details received: {route_details}") 
            # --- End Detailed Logging ---
            
            if route_details:
                logger.info(f"RIDE_SAVE: Successfully got route details for Ride ID {self.id or 'NEW'}.")
                
                # --- Add Detailed Logging --- 
                logger.debug(f"RIDE_SAVE: Raw route_details received: {route_details}") 
                # --- End Detailed Logging ---
                
                coordinates_list = route_details.get('geometry')
                logger.debug(f"RIDE_SAVE: Extracted coordinates list (type {type(coordinates_list)})")

                # JSONField handles serialization — do NOT json.dumps() here
                self.route_geometry = coordinates_list if coordinates_list else None

                self.route_duration = route_details.get('duration')
                self.route_distance = route_details.get('distance')
            else:
                logger.warning(f"RIDE_SAVE: Failed to get route details for Ride ID {self.id or 'NEW'}. Geometry will be null.")
                self.route_geometry = None
                self.route_duration = None
                self.route_distance = None
        else:
            logger.warning(f"RIDE_SAVE: Skipping route calculation for Ride ID {self.id or 'NEW'} due to missing coordinates.")
            self.route_geometry = None # Ensure geometry is null if coords missing
            self.route_duration = None
            self.route_distance = None

        # --- Add Detailed Logging --- 
        logger.info(f"RIDE_SAVE: About to call super().save() for Ride ID {self.id or 'NEW'}...")
        # --- End Detailed Logging ---
        
        try:
            super().save(*args, **kwargs)
            # --- Add Detailed Logging --- 
            logger.info(f"RIDE_SAVE: super().save() completed successfully for Ride ID {self.id or 'NEW'}.")
            # --- End Detailed Logging ---
        except Exception as e_save:
            # --- Add Detailed Logging --- 
            logger.error(f"RIDE_SAVE: Error during super().save() for Ride ID {self.id or 'NEW'}: {e_save}", exc_info=True)
            # --- End Detailed Logging ---
            raise # Re-raise the exception after logging

    def get_formatted_duration(self):
        if self.route_duration:
            return format_duration(self.route_duration)
        return "Duration not available"

    def get_formatted_distance(self):
        if self.route_distance:
            return format_distance(self.route_distance)
        return "Distance not available"

    def get_route_distance(self):
        if self.route_distance:
            return self.route_distance * 0.000621371  # Convert meters to miles
        return great_circle(
            (self.start_latitude, self.start_longitude),
            (self.end_latitude, self.end_longitude)
        ).miles

    def __str__(self):
        return f"Ride from {self.start_location} to {self.end_location} on {self.departure_time}"

@track_model_changes
class RideRequest(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ACCEPTED', 'Accepted'),
        ('REJECTED', 'Rejected'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled')
    ]

    rider = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ride_requests')
    ride = models.ForeignKey(Ride, on_delete=models.CASCADE, related_name='ride_requests')
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    pickup_latitude = models.FloatField()
    pickup_longitude = models.FloatField()
    dropoff_latitude = models.FloatField()
    dropoff_longitude = models.FloatField()
    departure_time = models.DateTimeField()
    seats_needed = models.IntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    distance = models.FloatField(null=True, blank=True, help_text="Distance between pickup and dropoff in kilometers")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    nearest_dropoff_point = models.JSONField(null=True, blank=True, help_text="Information about the nearest point on driver's route to rider's destination")
    optimal_pickup_point = models.JSONField(null=True, blank=True, help_text="Information about the optimal pickup point along driver's route")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Ride request from {self.rider.username} for {self.ride}"
        
    def save(self, *args, **kwargs):
        # Track if status is being changed to ACCEPTED
        status_changed_to_accepted = False
        
        # Check if this is a status change to ACCEPTED
        if not self._state.adding and self.pk:
            try:
                old_instance = RideRequest.objects.get(pk=self.pk)
                if old_instance.status != 'ACCEPTED' and self.status == 'ACCEPTED':
                    status_changed_to_accepted = True
                    logger.info(f"Status changing to ACCEPTED for ride request {self.pk}")
            except RideRequest.DoesNotExist:
                pass
        
        # Calculate distance if coordinates are available and distance is not set
        if not self.distance and self.pickup_latitude and self.pickup_longitude and self.dropoff_latitude and self.dropoff_longitude:
            from math import radians, sin, cos, asin, sqrt
            
            # Calculate great-circle distance
            def haversine(lat1, lon1, lat2, lon2):
                # Convert decimal degrees to radians
                lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
                
                # Haversine formula
                dlon = lon2 - lon1
                dlat = lat2 - lat1
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                c = 2 * asin(sqrt(a))
                r = 6371  # Radius of Earth in kilometers
                return c * r
                
            self.distance = haversine(self.pickup_latitude, self.pickup_longitude, self.dropoff_latitude, self.dropoff_longitude)
            logger.info(f"Calculated distance for ride request: {self.distance:.2f} km")
        
        # If we have a ride associated, try to calculate optimal pickup/dropoff points
        if self.ride:
            try:
                # Only proceed if ride has route geometry and both pickup and dropoff coordinates exist
                if (hasattr(self.ride, 'route_geometry') and self.ride.route_geometry and 
                    self.pickup_latitude and self.pickup_longitude and 
                    self.dropoff_latitude and self.dropoff_longitude):
                    
                    # Import here to avoid circular imports
                    from .utils import calculate_optimal_pickup_dropoff
                    
                    # Get route geometry
                    route_geometry = None
                    try:
                        # Geometry might be a JSON string that needs to be parsed
                        if isinstance(self.ride.route_geometry, str):
                            import json
                            route_geometry = json.loads(self.ride.route_geometry)
                        else:
                            route_geometry = self.ride.route_geometry
                    except Exception as e:
                        logger.error(f"Error parsing route geometry: {e}")
                        route_geometry = None
                    
                    if route_geometry:
                        logger.info(f"Calculating optimal points for ride request {self.id}")
                        
                        # Calculate optimal points
                        optimal_points_result = calculate_optimal_pickup_dropoff(
                            route_geometry,
                            self.pickup_latitude,
                            self.pickup_longitude,
                            self.dropoff_latitude,
                            self.dropoff_longitude
                        )
                        
                        if optimal_points_result:
                            logger.info(f"Optimal points calculated successfully for ride request {self.id}")
                            
                            # Format optimal pickup point consistently as a JSON serializable object
                            pickup_point = optimal_points_result['pickup']['point']
                            optimal_pickup_formatted = {
                                'lat': pickup_point[0],
                                'lng': pickup_point[1],
                                'distance': optimal_points_result['pickup']['distance'],
                                'method': optimal_points_result['pickup']['method']
                            }
                            
                            # Format nearest dropoff point consistently as a JSON serializable object
                            dropoff_point = optimal_points_result['dropoff']['point']
                            nearest_dropoff_formatted = {
                                'lat': dropoff_point[0],
                                'lng': dropoff_point[1],
                                'distance': optimal_points_result['dropoff']['distance'],
                                'method': optimal_points_result['dropoff']['method']
                            }
                            
                            # JSONField handles serialization — do NOT json.dumps() here
                            self.optimal_pickup_point = optimal_pickup_formatted
                            self.nearest_dropoff_point = nearest_dropoff_formatted
                            
                            logger.info(f"Set optimal_pickup_point: {self.optimal_pickup_point}")
                            logger.info(f"Set nearest_dropoff_point: {self.nearest_dropoff_point}")
                        else:
                            logger.warning(f"No optimal points found for ride request {self.id}")
                    else:
                        logger.warning(f"No valid route geometry found for ride {self.ride.id}")
                else:
                    logger.info(f"Skipping optimal points calculation. Missing required data.")

            except Exception as e:
                logger.error(f"Error calculating optimal points for ride request {self.id if not self._state.adding else 'new'}: {e}")
                # Handle exception: maybe set points to None or keep old values
                self.optimal_pickup_point = None
                self.nearest_dropoff_point = None

        # Continue with the normal save
        super().save(*args, **kwargs)
        
        # Create notifications when status changes to ACCEPTED
        if status_changed_to_accepted:
            self.create_acceptance_notifications()
    
    def create_acceptance_notifications(self):
        """Create notifications for both rider and driver when a ride is accepted"""
        try:
            # Use a transaction to ensure both notifications are created or none
            with transaction.atomic():
                logger.info(f"Creating acceptance notifications for ride request {self.id}")
                
                # Create notification for rider
                rider_notif = Notification.objects.create(
                    recipient=self.rider,
                    sender=self.ride.driver,
                    notification_type='REQUEST_ACCEPTED',
                    message=f"Your ride request from {self.pickup_location} to {self.dropoff_location} has been accepted!",
                    ride=self.ride,
                    ride_request=self
                )
                
                # Create notification for driver
                driver_notif = Notification.objects.create(
                    recipient=self.ride.driver,
                    sender=self.rider,
                    notification_type='RIDE_ACCEPTED',
                    message=f"A rider has joined your trip from {self.ride.start_location} to {self.ride.end_location}",
                    ride=self.ride,
                    ride_request=self
                )
                
                logger.info(f"Successfully created notifications: rider #{rider_notif.id}, driver #{driver_notif.id}")
        except Exception as e:
            logger.error(f"Error creating notifications for ride request {self.id}: {str(e)}")
            logger.exception("Detailed traceback:")
            # Attempt to retry notification creation once
            try:
                logger.info(f"Retrying notification creation for ride request {self.id}")
                Notification.objects.filter(ride_request=self).delete()  # Clean up any partial notifications
                
                Notification.objects.create(
                    recipient=self.rider,
                    sender=self.ride.driver,
                    notification_type='REQUEST_ACCEPTED',
                    message=f"Your ride request from {self.pickup_location} to {self.dropoff_location} has been accepted!",
                    ride=self.ride,
                    ride_request=self
                )
                
                Notification.objects.create(
                    recipient=self.ride.driver,
                    sender=self.rider,
                    notification_type='RIDE_ACCEPTED',
                    message=f"A rider has joined your trip from {self.ride.start_location} to {self.ride.end_location}",
                    ride=self.ride,
                    ride_request=self
                )
                
                logger.info(f"Retry successful: Created notifications for ride request {self.id}")
            except Exception as retry_e:
                logger.error(f"Retry failed - Error creating notifications on second attempt: {str(retry_e)}")

class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('RIDE_REQUEST', 'Ride Request'),
        ('REQUEST_ACCEPTED', 'Request Accepted'),
        ('REQUEST_REJECTED', 'Request Rejected'),
        ('RIDE_MATCH', 'Ride Match'),
        ('MATCH_PROPOSED', 'Match Proposed'),
        ('RIDE_ACCEPTED', 'Ride Accepted'),
        ('RIDE_REJECTED', 'Ride Rejected'),
        ('RIDE_CANCELLED', 'Ride Cancelled'),
        ('RIDE_COMPLETED', 'Ride Completed'),
        ('RIDE_PENDING', 'Ride Pending'),
    ]

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_notifications', null=True, blank=True)
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES)
    ride = models.ForeignKey('Ride', on_delete=models.CASCADE, null=True, blank=True)
    ride_request = models.ForeignKey('RideRequest', on_delete=models.CASCADE, null=True, blank=True)
    related_pending_request = models.ForeignKey('PendingRideRequest', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.notification_type} - {self.recipient.username}"

class PendingRideRequest(models.Model):
    """
    Model to store ride requests that couldn't be matched immediately.
    These will be checked periodically or when new rides are created.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('MATCH_PROPOSED', 'Match Proposed'),
        ('MATCHED', 'Matched'),
        ('REJECTED', 'Rejected'),
        ('EXPIRED', 'Expired'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    rider = models.ForeignKey(User, on_delete=models.CASCADE, related_name='pending_ride_requests')
    pickup_location = models.CharField(max_length=255)
    dropoff_location = models.CharField(max_length=255)
    pickup_latitude = models.FloatField()
    pickup_longitude = models.FloatField()
    dropoff_latitude = models.FloatField()
    dropoff_longitude = models.FloatField()
    departure_time = models.DateTimeField()
    seats_needed = models.IntegerField(default=1)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)
    
    # If a match is proposed, store the ride
    proposed_ride = models.ForeignKey(
        'Ride',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='proposed_matches'
    )
    
    # If a match is found later, create a RideRequest
    matched_ride_request = models.OneToOneField(
        'RideRequest', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='pending_request'
    )
    
    class Meta:
        ordering = ['departure_time']
        
    def __str__(self):
        return f"Pending request by {self.rider.username} at {self.departure_time}"
    
    @property
    def is_expired(self):
        """Check if the request has expired (30 min past departure time)"""
        return self.departure_time < timezone.now() - timezone.timedelta(minutes=30)
