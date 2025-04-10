import logging
from django.core.management.base import BaseCommand
from rides.models import RideRequest
from rides.views import find_optimal_pickup, find_optimal_dropoff

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Populates optimal pickup and dropoff points for existing ride requests'

    def handle(self, *args, **options):
        self.stdout.write('Starting to populate optimal pickup and dropoff points...')
        
        # Get all ride requests that don't have optimal points
        ride_requests = RideRequest.objects.filter(
            optimal_pickup_point__isnull=True,
            nearest_dropoff_point__isnull=True
        )
        
        count = 0
        for ride_request in ride_requests:
            try:
                # Get the ride
                ride = ride_request.ride
                if not ride:
                    continue
                
                # Get coordinates
                driver_start = (ride.start_longitude, ride.start_latitude)
                driver_end = (ride.end_longitude, ride.end_latitude)
                rider_pickup = (ride_request.pickup_longitude, ride_request.pickup_latitude)
                rider_dropoff = (ride_request.dropoff_longitude, ride_request.dropoff_latitude)
                
                # Build a simple route for now
                driver_route = [(driver_start[1], driver_start[0]), (driver_end[1], driver_end[0])]
                
                # Calculate optimal pickup point
                optimal_pickup, pickup_dist, _ = find_optimal_pickup(
                    [(p[1], p[0]) for p in driver_route],  # Convert to (lat, lng) format
                    (rider_pickup[1], rider_pickup[0])
                )
                
                # Calculate optimal dropoff point
                optimal_dropoff, dropoff_dist, _ = find_optimal_dropoff(
                    [(p[1], p[0]) for p in driver_route],  # Convert to (lat, lng) format
                    (rider_pickup[1], rider_pickup[0]),
                    (rider_dropoff[1], rider_dropoff[0])
                )
                
                # Store the optimal points
                if optimal_pickup:
                    ride_request.optimal_pickup_point = {
                        'latitude': optimal_pickup[0],
                        'longitude': optimal_pickup[1],
                        'distance': pickup_dist
                    }
                
                if optimal_dropoff:
                    ride_request.nearest_dropoff_point = {
                        'latitude': optimal_dropoff[0],
                        'longitude': optimal_dropoff[1],
                        'distance': dropoff_dist
                    }
                
                ride_request.save()
                count += 1
                
                if count % 10 == 0:
                    self.stdout.write(f'Processed {count} ride requests...')
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Error processing ride request {ride_request.id}: {str(e)}'))
        
        self.stdout.write(self.style.SUCCESS(f'Successfully populated optimal points for {count} ride requests')) 