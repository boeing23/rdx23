from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
import logging
import os

logger = logging.getLogger(__name__)

def send_ride_notification_email(recipient_email, subject, message, html_message=None):
    """
    Generic function to send email notifications
    """
    try:
        logger.info(f"Attempting to send email to {recipient_email}")
        logger.info(f"Email settings: HOST={settings.EMAIL_HOST}, PORT={settings.EMAIL_PORT}, TLS={settings.EMAIL_USE_TLS}, SSL={settings.EMAIL_USE_SSL}")
        logger.info(f"Subject: {subject}")
        logger.info(f"From: {settings.DEFAULT_FROM_EMAIL}")
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            html_message=html_message,
            fail_silently=False,
        )
        logger.info(f"Successfully sent email to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {str(e)}")
        logger.exception("Email sending exception details:")
        return False

def send_ride_match_notification(ride_request, notify_driver=True):
    """
    Send notification when a ride request is matched with a driver
    """
    driver = ride_request.ride.driver
    
    # Get vehicle info directly from driver model fields
    vehicle_make = getattr(driver, 'vehicle_make', '')
    vehicle_model = getattr(driver, 'vehicle_model', '')
    vehicle_year = getattr(driver, 'vehicle_year', '')
    vehicle_color = getattr(driver, 'vehicle_color', '')
    license_plate = getattr(driver, 'license_plate', '')
    
    # Format vehicle info
    vehicle_parts = []
    if vehicle_year:
        vehicle_parts.append(str(vehicle_year))
    if vehicle_make:
        vehicle_parts.append(vehicle_make)
    if vehicle_model:
        vehicle_parts.append(vehicle_model)
    
    # Add color in parentheses if available
    vehicle_info = " ".join(vehicle_parts)
    if vehicle_color and vehicle_info:
        vehicle_info += f" ({vehicle_color})"
    
    # Use fallback if no vehicle info is available
    if not vehicle_info.strip():
        vehicle_info = "Not provided"
    
    # Send notification to rider
    rider_subject = "ChalBeyy: Your Ride Request Has Been Matched!"
    rider_message = f"""
    Hello {ride_request.rider.first_name},

    Great news! Your ride request has been matched with a driver.

    Ride Details:
    - From: {ride_request.pickup_location}
    - To: {ride_request.dropoff_location}
    - Departure Time: {ride_request.departure_time}
    - Driver: {driver.first_name} {driver.last_name}
    - Vehicle: {vehicle_info}
    - License Plate: {license_plate or "Not provided"}
    - Driver's Phone: {driver.phone_number if hasattr(driver, 'phone_number') else "Not provided"}

    Please log in to your ChalBeyy account to accept the ride.

    Best regards,
    The ChalBeyy Team
    """

    # Create email template directory if it doesn't exist
    os.makedirs('rides/templates/rides/email', exist_ok=True)
    
    try:
        rider_html = render_to_string('rides/email/notification.html', {
            'subject': rider_subject,
            'message': rider_message.replace('\n', '<br>'),
        })
    except Exception as e:
        logger.error(f"Failed to render email template: {str(e)}")
        rider_html = None

    # Send email to rider
    send_ride_notification_email(
        ride_request.rider.email,
        rider_subject,
        rider_message,
        rider_html
    )

    # Only send notification to driver if requested
    if notify_driver:
        # Send notification to driver
        driver_subject = "ChalBeyy: New Ride Match Available!"
        driver_message = f"""
        Hello {driver.first_name},

        A new ride request has been matched with your route.

        Ride Details:
        - From: {ride_request.pickup_location}
        - To: {ride_request.dropoff_location}
        - Departure Time: {ride_request.departure_time}
        - Rider: {ride_request.rider.first_name} {ride_request.rider.last_name}
        - Seats Needed: {ride_request.seats_needed}
        - Rider's Phone: {ride_request.rider.phone_number if hasattr(ride_request.rider, 'phone_number') else "Not provided"}

        The rider will be notified and can accept the match.

        Best regards,
        The ChalBeyy Team
        """

        try:
            driver_html = render_to_string('rides/email/notification.html', {
                'subject': driver_subject,
                'message': driver_message.replace('\n', '<br>'),
            })
        except Exception as e:
            logger.error(f"Failed to render email template: {str(e)}")
            driver_html = None

        send_ride_notification_email(
            driver.email,
            driver_subject,
            driver_message,
            driver_html
        )

def send_ride_accepted_notification(ride_request):
    """
    Send notification when a ride request is accepted by the rider
    """
    driver = ride_request.ride.driver
    
    # Get email addresses and log them
    rider_email = getattr(ride_request.rider, 'email', 'No email')
    driver_email = getattr(driver, 'email', 'No email')
    
    logger.info(f"Sending ride accepted notification to rider: {rider_email}")
    logger.info(f"Sending ride accepted notification to driver: {driver_email}")
    
    # Get vehicle info directly from driver model fields
    vehicle_make = getattr(driver, 'vehicle_make', '')
    vehicle_model = getattr(driver, 'vehicle_model', '')
    vehicle_year = getattr(driver, 'vehicle_year', '')
    vehicle_color = getattr(driver, 'vehicle_color', '')
    license_plate = getattr(driver, 'license_plate', '')
    
    # Format vehicle info
    vehicle_parts = []
    if vehicle_year:
        vehicle_parts.append(str(vehicle_year))
    if vehicle_make:
        vehicle_parts.append(vehicle_make)
    if vehicle_model:
        vehicle_parts.append(vehicle_model)
    
    # Add color in parentheses if available
    vehicle_info = " ".join(vehicle_parts)
    if vehicle_color and vehicle_info:
        vehicle_info += f" ({vehicle_color})"
    
    # Use fallback if no vehicle info is available
    if not vehicle_info.strip():
        vehicle_info = "Not provided"
    
    # Send notification to rider
    rider_subject = "ChalBeyy: Your Ride Request Has Been Accepted!"
    rider_message = f"""
    Hello {ride_request.rider.first_name},

    Your ride request has been accepted! Here are your ride details:

    Ride Details:
    - From: {ride_request.pickup_location}
    - To: {ride_request.dropoff_location}
    - Departure Time: {ride_request.departure_time}
    - Driver: {driver.first_name} {driver.last_name}
    - Vehicle: {vehicle_info}
    - License Plate: {license_plate or "Not provided"}
    - Driver's Phone: {driver.phone_number if hasattr(driver, 'phone_number') else "Not provided"}

    Please arrive at the pickup location on time. If you need to contact your driver, you can use the phone number provided above.

    Best regards,
    The ChalBeyy Team
    """

    # Send notification to driver
    driver_subject = "ChalBeyy: Ride Request Accepted!"
    driver_message = f"""
    Hello {driver.first_name},

    The rider has accepted your ride offer. Here are the details:

    Ride Details:
    - From: {ride_request.pickup_location}
    - To: {ride_request.dropoff_location}
    - Departure Time: {ride_request.departure_time}
    - Rider: {ride_request.rider.first_name} {ride_request.rider.last_name}
    - Seats Needed: {ride_request.seats_needed}
    - Rider's Phone: {ride_request.rider.phone_number if hasattr(ride_request.rider, 'phone_number') else "Not provided"}

    Please arrive at the pickup location on time. If you need to contact the rider, you can use the phone number provided above.

    Best regards,
    The ChalBeyy Team
    """

    rider_html = None
    driver_html = None
    try:
        rider_html = render_to_string('rides/email/notification.html', {
            'subject': rider_subject,
            'message': rider_message.replace('\n', '<br>'),
        })
        driver_html = render_to_string('rides/email/notification.html', {
            'subject': driver_subject,
            'message': driver_message.replace('\n', '<br>'),
        })
    except Exception as e:
        logger.error(f"Failed to render email template: {str(e)}")
    
    # Send emails to both rider and driver
    rider_email_sent = False
    driver_email_sent = False
    
    if rider_email and rider_email != 'No email':
        rider_email_sent = send_ride_notification_email(
            rider_email,
            rider_subject,
            rider_message,
            rider_html
        )
    else:
        logger.error(f"Missing rider email for ride request {ride_request.id}")
    
    if driver_email and driver_email != 'No email':
        driver_email_sent = send_ride_notification_email(
            driver_email,
            driver_subject,
            driver_message,
            driver_html
        )
    else:
        logger.error(f"Missing driver email for ride request {ride_request.id}")
    
    return rider_email_sent and driver_email_sent 