import os
import sys
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Import models
from rides.models import Ride, User
from django.utils import timezone

def test_ride_model():
    """Test function to verify the Ride model is working correctly"""
    print("Testing Ride model...\n")
    
    # Get number of rides
    ride_count = Ride.objects.count()
    print(f"Total rides in database: {ride_count}")
    
    # Get a sample ride
    sample_ride = Ride.objects.first()
    if sample_ride:
        print("\nSample Ride data:")
        print(f"ID: {sample_ride.id}")
        print(f"Driver: {sample_ride.driver}")
        print(f"Start location: {sample_ride.start_location}")
        print(f"End location: {sample_ride.end_location}")
        print(f"Departure time: {sample_ride.departure_time}")
        
        # Check for driver_name field
        try:
            driver_name = getattr(sample_ride, 'driver_name', None)
            print(f"driver_name field exists: {driver_name is not None}")
            print(f"driver_name value: {driver_name}")
        except Exception as e:
            print(f"driver_name field check error: {str(e)}")
        
        # Get distance
        distance = sample_ride.get_route_distance()
        print(f"Route distance: {distance:.2f} miles")
        
        # Get driver info 
        driver = sample_ride.driver
        print("\nDriver information:")
        print(f"ID: {driver.id}")
        print(f"Username: {driver.username}")
        print(f"Email: {driver.email}")
        try:
            print(f"First name: {driver.first_name}")
            print(f"Last name: {driver.last_name}")
            print(f"Phone: {driver.phone_number if hasattr(driver, 'phone_number') else 'Not available'}")
        except Exception as e:
            print(f"Error accessing driver fields: {str(e)}")
    else:
        print("No rides found in the database.")
    
    print("\nTest completed.")

if __name__ == "__main__":
    test_ride_model() 