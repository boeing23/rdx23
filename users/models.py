from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

class User(AbstractUser):
    USER_TYPE_CHOICES = (
        ('DRIVER', 'Driver'),
        ('RIDER', 'Rider'),
    )

    user_type = models.CharField(max_length=6, choices=USER_TYPE_CHOICES)
    phone_number = models.CharField(max_length=15)
    rating = models.FloatField(
        default=5.0,
        validators=[MinValueValidator(1.0), MaxValueValidator(5.0)]
    )
    total_rides = models.IntegerField(default=0)
    is_verified = models.BooleanField(default=False)
    emergency_contact = models.CharField(max_length=100, blank=True)
    emergency_phone = models.CharField(max_length=15, blank=True)

    # Driver specific fields
    vehicle_make = models.CharField(max_length=50, blank=True)
    vehicle_model = models.CharField(max_length=50, blank=True)
    vehicle_year = models.IntegerField(null=True, blank=True)
    vehicle_color = models.CharField(max_length=30, blank=True)
    license_plate = models.CharField(max_length=15, blank=True)
    max_passengers = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(8)]
    )

    # Rider specific fields
    preferred_pickup_locations = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"{self.username} ({self.user_type})"

class Rating(models.Model):
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ratings_given')
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ratings_received')
    rating = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('from_user', 'to_user')

    def __str__(self):
        return f"Rating from {self.from_user} to {self.to_user}: {self.rating}"
