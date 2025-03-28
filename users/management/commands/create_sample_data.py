from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from rides.models import Ride, RideRequest
from datetime import datetime, timedelta
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Creates sample data for testing the carpool system'

    def handle(self, *args, **kwargs):
        self.stdout.write('Creating sample data...')

        # Create sample drivers
        drivers = []
        driver_data = [
            {
                'username': 'john_driver',
                'email': 'john@example.com',
                'first_name': 'John',
                'last_name': 'Smith',
                'user_type': 'DRIVER',
                'phone_number': '540-555-0101',
                'vehicle_make': 'Toyota',
                'vehicle_model': 'Camry',
                'vehicle_year': 2020,
                'vehicle_color': 'Silver',
                'license_plate': 'VA123ABC',
                'max_passengers': 4
            },
            {
                'username': 'sarah_driver',
                'email': 'sarah@example.com',
                'first_name': 'Sarah',
                'last_name': 'Johnson',
                'user_type': 'DRIVER',
                'phone_number': '540-555-0102',
                'vehicle_make': 'Honda',
                'vehicle_model': 'CR-V',
                'vehicle_year': 2021,
                'vehicle_color': 'Blue',
                'license_plate': 'VA456DEF',
                'max_passengers': 6
            }
        ]

        for data in driver_data:
            driver, created = User.objects.get_or_create(
                username=data['username'],
                defaults={
                    'email': data['email'],
                    'first_name': data['first_name'],
                    'last_name': data['last_name'],
                    'user_type': data['user_type'],
                    'phone_number': data['phone_number'],
                    'vehicle_make': data['vehicle_make'],
                    'vehicle_model': data['vehicle_model'],
                    'vehicle_year': data['vehicle_year'],
                    'vehicle_color': data['vehicle_color'],
                    'license_plate': data['license_plate'],
                    'max_passengers': data['max_passengers']
                }
            )
            if created:
                driver.set_password('testpass123')
                driver.save()
                drivers.append(driver)
                self.stdout.write(f'Created driver: {driver.username}')

        # Create sample riders
        riders = []
        rider_data = [
            {
                'username': 'mike_rider',
                'email': 'mike@example.com',
                'first_name': 'Mike',
                'last_name': 'Wilson',
                'user_type': 'RIDER',
                'phone_number': '540-555-0201',
                'preferred_pickup_locations': ['VT Squires Student Center', 'Math Emporium']
            },
            {
                'username': 'lisa_rider',
                'email': 'lisa@example.com',
                'first_name': 'Lisa',
                'last_name': 'Brown',
                'user_type': 'RIDER',
                'phone_number': '540-555-0202',
                'preferred_pickup_locations': ['Downtown Blacksburg', 'University Mall']
            }
        ]

        for data in rider_data:
            rider, created = User.objects.get_or_create(
                username=data['username'],
                defaults={
                    'email': data['email'],
                    'first_name': data['first_name'],
                    'last_name': data['last_name'],
                    'user_type': data['user_type'],
                    'phone_number': data['phone_number'],
                    'preferred_pickup_locations': data['preferred_pickup_locations']
                }
            )
            if created:
                rider.set_password('testpass123')
                rider.save()
                riders.append(rider)
                self.stdout.write(f'Created rider: {rider.username}')

        # Create sample rides
        blacksburg_locations = [
            ('VT Squires Student Center', 37.2296, -80.4139),
            ('Downtown Blacksburg', 37.2296, -80.4137),
            ('Math Emporium', 37.2319, -80.4216),
            ('University Mall', 37.2344, -80.4172),
            ('Virginia Tech Airport', 37.2075, -80.4139)
        ]

        for driver in drivers:
            for _ in range(3):  # Create 3 rides per driver
                start_loc = random.choice(blacksburg_locations)
                end_loc = random.choice(blacksburg_locations)
                while end_loc == start_loc:
                    end_loc = random.choice(blacksburg_locations)

                departure_time = datetime.now() + timedelta(
                    days=random.randint(1, 14),
                    hours=random.randint(0, 23)
                )

                ride = Ride.objects.create(
                    driver=driver,
                    start_location=start_loc[0],
                    end_location=end_loc[0],
                    start_latitude=start_loc[1],
                    start_longitude=start_loc[2],
                    end_latitude=end_loc[1],
                    end_longitude=end_loc[2],
                    departure_time=departure_time,
                    available_seats=random.randint(1, driver.max_passengers),
                    price_per_seat=random.randint(5, 20)
                )
                self.stdout.write(f'Created ride: {ride}')

        # Create sample ride requests
        for rider in riders:
            available_rides = Ride.objects.filter(status='SCHEDULED')[:2]
            for ride in available_rides:
                pickup_loc = random.choice(blacksburg_locations)
                dropoff_loc = random.choice(blacksburg_locations)
                while dropoff_loc == pickup_loc:
                    dropoff_loc = random.choice(blacksburg_locations)

                request = RideRequest.objects.create(
                    ride=ride,
                    rider=rider,
                    pickup_location=pickup_loc[0],
                    dropoff_location=dropoff_loc[0],
                    pickup_latitude=pickup_loc[1],
                    pickup_longitude=pickup_loc[2],
                    dropoff_latitude=dropoff_loc[1],
                    dropoff_longitude=dropoff_loc[2],
                    seats_needed=random.randint(1, min(2, ride.available_seats))
                )
                self.stdout.write(f'Created ride request: {request}')

        self.stdout.write(self.style.SUCCESS('Successfully created sample data')) 