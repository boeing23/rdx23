from django.core.management.base import BaseCommand
from django.utils import timezone
from rides.views import mark_past_rides_complete, mark_expired_pending_requests
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Process ride statuses - mark completed rides and expired pending requests'

    def handle(self, *args, **options):
        logger.info(f"Running process_ride_statuses at {timezone.now()}")
        
        try:
            # Mark past rides as complete
            logger.info("Running mark_past_rides_complete...")
            mark_past_rides_complete()
            
            # Mark expired pending requests
            logger.info("Running mark_expired_pending_requests...")
            mark_expired_pending_requests()
            
            logger.info("Completed process_ride_statuses successfully")
            self.stdout.write(self.style.SUCCESS('Successfully processed ride statuses'))
        
        except Exception as e:
            logger.error(f"Error in process_ride_statuses: {str(e)}")
            logger.exception("Full exception details:")
            self.stdout.write(self.style.ERROR(f'Error processing ride statuses: {str(e)}')) 