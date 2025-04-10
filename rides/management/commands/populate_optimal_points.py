import json
from django.core.management.base import BaseCommand
from rides.models import RideRequest
from django.db import transaction

class Command(BaseCommand):
    help = 'Populates optimal pickup and nearest dropoff points for all ride requests'

    def handle(self, *args, **options):
        self.stdout.write('Starting to populate optimal pickup and dropoff points...')
        
        # Get all ride requests
        try:
            ride_requests = RideRequest.objects.all()
            self.stdout.write(f'Found {ride_requests.count()} ride requests')
            
            updated_count = 0
            
            with transaction.atomic():
                for ride_request in ride_requests:
                    if not ride_request.optimal_pickup_point or not ride_request.nearest_dropoff_point:
                        # Create test data - use the original pickup/dropoff points with a slight offset
                        optimal_pickup_point = {
                            'latitude': ride_request.pickup_latitude + 0.001,  # Slight offset
                            'longitude': ride_request.pickup_longitude + 0.001
                        }
                        
                        nearest_dropoff_point = {
                            'latitude': ride_request.dropoff_latitude - 0.001,  # Slight offset
                            'longitude': ride_request.dropoff_longitude - 0.001
                        }
                        
                        # Update the ride request
                        ride_request.optimal_pickup_point = json.dumps(optimal_pickup_point)
                        ride_request.nearest_dropoff_point = json.dumps(nearest_dropoff_point)
                        ride_request.save()
                        
                        updated_count += 1
            
            self.stdout.write(self.style.SUCCESS(f'Successfully updated {updated_count} ride requests'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}')) 