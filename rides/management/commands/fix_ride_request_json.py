from django.core.management.base import BaseCommand
from rides.models import RideRequest
import json
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Fix ride requests with invalid JSON fields'

    def handle(self, *args, **options):
        self.stdout.write('Fixing ride requests with invalid JSON fields...')
        
        # Get all ride requests
        ride_requests = RideRequest.objects.all()
        self.stdout.write(f'Found {ride_requests.count()} ride requests')
        
        fixed_count = 0
        
        for ride_request in ride_requests:
            try:
                # Check nearest_dropoff_point
                updated = False
                
                if ride_request.nearest_dropoff_point is not None:
                    if isinstance(ride_request.nearest_dropoff_point, str):
                        try:
                            # Try to parse
                            json.loads(ride_request.nearest_dropoff_point)
                        except json.JSONDecodeError:
                            # Fix invalid JSON
                            self.stdout.write(f'  Fixing invalid nearest_dropoff_point JSON for ride request {ride_request.id}')
                            ride_request.nearest_dropoff_point = {}
                            updated = True
                    elif not isinstance(ride_request.nearest_dropoff_point, (dict, list)):
                        self.stdout.write(f'  Fixing invalid nearest_dropoff_point format for ride request {ride_request.id}')
                        ride_request.nearest_dropoff_point = {}
                        updated = True
                
                # Check optimal_pickup_point
                if ride_request.optimal_pickup_point is not None:
                    if isinstance(ride_request.optimal_pickup_point, str):
                        try:
                            # Try to parse
                            json.loads(ride_request.optimal_pickup_point)
                        except json.JSONDecodeError:
                            # Fix invalid JSON
                            self.stdout.write(f'  Fixing invalid optimal_pickup_point JSON for ride request {ride_request.id}')
                            ride_request.optimal_pickup_point = {}
                            updated = True
                    elif not isinstance(ride_request.optimal_pickup_point, (dict, list)):
                        self.stdout.write(f'  Fixing invalid optimal_pickup_point format for ride request {ride_request.id}')
                        ride_request.optimal_pickup_point = {}
                        updated = True
                
                # Save if updated
                if updated:
                    ride_request.save(update_fields=['nearest_dropoff_point', 'optimal_pickup_point'])
                    fixed_count += 1
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error fixing ride request {ride_request.id}: {str(e)}'))
        
        self.stdout.write(self.style.SUCCESS(f'Fixed {fixed_count} ride requests')) 