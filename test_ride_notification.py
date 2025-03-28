import os
import django
import sys

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Now import Django models
from rides.models import RideRequest, Ride, Notification
from rides.services import send_ride_match_notification, send_ride_accepted_notification
from django.contrib.auth import get_user_model
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

User = get_user_model()

def test_ride_match_notification():
    """Test the ride match notification functionality"""
    logger.info("Testing ride match notification")
    
    # Get a pending ride request
    pending_request = RideRequest.objects.filter(status='PENDING').first()
    
    if not pending_request:
        logger.info("No pending ride requests found. Checking for any ride request...")
        pending_request = RideRequest.objects.first()
        
    if not pending_request:
        logger.error("No ride requests found in the database.")
        return
    
    logger.info(f"Found ride request id={pending_request.id}, status={pending_request.status}")
    logger.info(f"Rider: {pending_request.rider.first_name} {pending_request.rider.last_name} ({pending_request.rider.email})")
    logger.info(f"Ride: {pending_request.ride}")
    
    if pending_request.ride and pending_request.ride.driver:
        logger.info(f"Driver: {pending_request.ride.driver.first_name} {pending_request.ride.driver.last_name} ({pending_request.ride.driver.email})")
    else:
        logger.error("Ride request doesn't have an associated ride with a driver")
        return
    
    # Test sending the notification
    try:
        logger.info("Sending ride match notification...")
        send_ride_match_notification(pending_request)
        logger.info("Ride match notification sent successfully")
    except Exception as e:
        logger.error(f"Failed to send ride match notification: {e}")
        logger.exception("Exception details:")

def test_ride_accept_notification():
    """Test the ride accept notification functionality"""
    logger.info("Testing ride accept notification")
    
    # Get a pending ride request
    pending_request = RideRequest.objects.filter(status='PENDING').first()
    
    if not pending_request:
        logger.info("No pending ride requests found. Checking for any ride request...")
        pending_request = RideRequest.objects.first()
        
    if not pending_request:
        logger.error("No ride requests found in the database.")
        return
    
    logger.info(f"Found ride request id={pending_request.id}, status={pending_request.status}")
    
    # Test sending the notification
    try:
        logger.info("Sending ride accepted notification...")
        send_ride_accepted_notification(pending_request)
        logger.info("Ride accepted notification sent successfully")
    except Exception as e:
        logger.error(f"Failed to send ride accepted notification: {e}")
        logger.exception("Exception details:")

if __name__ == "__main__":
    logger.info("Starting ride notification tests...")
    
    test_ride_match_notification()
    test_ride_accept_notification()
    
    logger.info("Ride notification tests completed") 