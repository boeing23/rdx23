from django.db import models
from django.conf import settings
from geopy.geocoders import Nominatim
from geopy.distance import great_circle
from .utils import get_route_details, format_duration, format_distance
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone
import requests
import logging

logger = logging.getLogger(__name__)

User = get_user_model()

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
    price_per_seat = models.DecimalField(max_digits=6, decimal_places=2)
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
            
            if not (self.end_latitude and self.end_longitude):
                end_location = geolocator.geocode(self.end_location)
                if end_location:
                    self.end_latitude = end_location.latitude
                    self.end_longitude = end_location.longitude

        # Calculate route details if coordinates are available
        if all([self.start_latitude, self.start_longitude, self.end_latitude, self.end_longitude]):
            route_details = get_route_details(
                (self.start_longitude, self.start_latitude),
                (self.end_longitude, self.end_latitude)
            )
            if route_details:
                self.route_geometry = route_details['geometry']
                self.route_duration = route_details['duration']
                self.route_distance = route_details['distance']

        super().save(*args, **kwargs)

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    nearest_dropoff_point = models.JSONField(null=True, blank=True, help_text="Information about the nearest point on driver's route to rider's destination")
    optimal_pickup_point = models.JSONField(null=True, blank=True, help_text="Information about the optimal pickup point along driver's route")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Ride request from {self.rider.username} for {self.ride}"

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
