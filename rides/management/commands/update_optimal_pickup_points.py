from django.core.management.base import BaseCommand
from rides.models import RideRequest
from rides.services import calculate_optimal_pickup_point
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Updates existing RideRequest objects with optimal pickup points'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit the number of requests to process',
        )
        parser.add_argument(
            '--status',
            type=str,
            default=None,
            help='Filter by status (e.g., PENDING, ACCEPTED)',
        )

    def handle(self, *args, **options):
        limit = options['limit']
        status = options['status']
        
        # Build the query
        queryset = RideRequest.objects.filter(optimal_pickup_point__isnull=True)
        
        if status:
            queryset = queryset.filter(status=status.upper())
        
        # Apply limit if specified
        if limit:
            queryset = queryset[:limit]
        
        total_count = queryset.count()
        self.stdout.write(f"Found {total_count} ride requests without optimal pickup points")
        
        # Process each ride request
        success_count = 0
        error_count = 0
        
        for ride_request in queryset:
            try:
                self.stdout.write(f"Processing ride request {ride_request.id}")
                
                # Calculate the optimal pickup point
                optimal_pickup = calculate_optimal_pickup_point(ride_request.ride, ride_request)
                
                # Update the ride request
                ride_request.optimal_pickup_point = optimal_pickup
                ride_request.save(update_fields=['optimal_pickup_point'])
                
                success_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f"Added optimal pickup point to ride request {ride_request.id}: {optimal_pickup['address']}"
                ))
            except Exception as e:
                error_count += 1
                logger.error(f"Error updating ride request {ride_request.id}: {str(e)}")
                self.stdout.write(self.style.ERROR(
                    f"Failed to process ride request {ride_request.id}: {str(e)}"
                ))
        
        # Print summary
        self.stdout.write(self.style.SUCCESS(
            f"Completed: {success_count} successes, {error_count} errors out of {total_count} total"
        )) 