import os
import django
import random
from datetime import timedelta

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Import models
from rides.models import Ride
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

def create_sample_ride():
    """Create a sample ride to test the application"""
    print("Creating sample ride...\n")
    
    # First check if we have a user
    user = None
    if User.objects.count() > 0:
        # Get any existing user
        user = User.objects.first()
        print(f"Using existing user: {user.username} (ID: {user.id})")
    else:
        # Create a test user
        username = f"testdriver_{random.randint(1000, 9999)}"
        email = f"{username}@example.com"
        password = "testpassword123"
        
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name="Test",
            last_name="Driver",
            is_active=True,
            user_type="DRIVER"
        )
        
        # Add driver fields if the model supports them
        if hasattr(user, 'phone_number'):
            user.phone_number = "555-123-4567"
        
        if hasattr(user, 'vehicle_make'):
            user.vehicle_make = "Toyota"
            user.vehicle_model = "Camry"
            user.vehicle_year = 2020
            user.vehicle_color = "Silver"
            user.license_plate = "TEST123"
            user.max_passengers = 4
        
        user.save()
        print(f"Created new test user: {user.username} (ID: {user.id})")
    
    # Create a ride
    departure_time = timezone.now() + timedelta(days=1)  # Tomorrow
    
    ride = Ride.objects.create(
        driver=user,
        start_location="Blacksburg, VA",
        end_location="Roanoke, VA",
        start_latitude=37.2296,
        start_longitude=-80.4139,
        end_latitude=37.2710,
        end_longitude=-79.9414,
        departure_time=departure_time,
        available_seats=3,
        price_per_seat=10.00,
        status="SCHEDULED"
    )
    
    print(f"\nCreated ride #{ride.id} from {ride.start_location} to {ride.end_location}")
    print(f"Departure: {ride.departure_time}")
    print(f"Available seats: {ride.available_seats}")
    print(f"Price per seat: ${ride.price_per_seat}")
    
    # Calculate route details
    ride.save()  # This will trigger the save method which updates route details
    
    print("\nSample ride creation completed.")
    return ride

if __name__ == "__main__":
    create_sample_ride() 