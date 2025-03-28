import os
import django
import sys

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'carpool_project.settings')
django.setup()

# Now import Django models
from rides.models import RideRequest
from rides.services import send_ride_notification_email
from django.core.mail import send_mail
from django.conf import settings
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_direct_email():
    """Test sending an email directly with hardcoded values"""
    logger.info("Testing direct email with hardcoded values")
    
    try:
        result = send_mail(
            subject="RideX Test Email",
            message="This is a test email from RideX using direct send_mail.",
            from_email="ridex2429@gmail.com",
            recipient_list=["ridex2429@gmail.com"],
            fail_silently=False,
        )
        logger.info(f"Email sent successfully: {result}")
    except Exception as e:
        logger.error(f"Failed to send direct email: {e}")
        logger.exception("Exception details:")

def test_notification_service():
    """Test the notification service function"""
    logger.info("Testing notification service")
    
    try:
        result = send_ride_notification_email(
            recipient_email="ridex2429@gmail.com",
            subject="RideX Notification Service Test",
            message="This is a test email from the RideX notification service.",
            html_message="<h1>RideX Test</h1><p>This is a test of the HTML email.</p>"
        )
        logger.info(f"Notification service email result: {result}")
    except Exception as e:
        logger.error(f"Failed to send notification service email: {e}")
        logger.exception("Exception details:")

if __name__ == "__main__":
    logger.info("Starting email tests...")
    logger.info(f"Email settings: HOST={settings.EMAIL_HOST}, PORT={settings.EMAIL_PORT}")
    logger.info(f"Email settings: TLS={settings.EMAIL_USE_TLS}, SSL={settings.EMAIL_USE_SSL}")
    logger.info(f"Email user: {settings.EMAIL_HOST_USER}")
    
    test_direct_email()
    test_notification_service()
    
    logger.info("Email tests completed") 