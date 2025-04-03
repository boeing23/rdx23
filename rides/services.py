from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
import logging
import os
import json
import math
from geopy.distance import geodesic

logger = logging.getLogger(__name__)

def calculate_optimal_pickup_point(ride, ride_request):
    """
    Calculate the optimal pickup point between the driver's route and rider's location.
    
    Args:
        ride: The Ride object with driver's route information
        ride_request: The RideRequest object with rider's pickup location
        
    Returns:
        A dict containing the optimal pickup point coordinates and metadata
    """
    logger.info(f"Calculating optimal pickup point for ride {ride.id} and request {ride_request.id}")
    
    try:
        # Get route coordinates
        driver_start = (ride.start_latitude, ride.start_longitude)
        driver_end = (ride.end_latitude, ride.end_longitude)
        rider_pickup = (ride_request.pickup_latitude, ride_request.pickup_longitude)
        
        logger.info(f"Driver start: {driver_start}, Driver end: {driver_end}, Rider pickup: {rider_pickup}")
        
        # If ride has route geometry, use that for more precise calculation
        if hasattr(ride, 'route_geometry') and ride.route_geometry:
            try:
                # Try to extract route points from geometry
                if isinstance(ride.route_geometry, str):
                    geometry = json.loads(ride.route_geometry)
                else:
                    geometry = ride.route_geometry
                
                # Check if we have a valid LineString format
                if 'coordinates' in geometry:
                    route_points = geometry['coordinates']
                    
                    # Find the point on the route closest to the rider's pickup
                    closest_point = None
                    min_distance = float('inf')
                    
                    for point in route_points:
                        # Route points are [lng, lat], but we need [lat, lng] for distance calculation
                        route_point = (point[1], point[0])
                        distance = geodesic(route_point, rider_pickup).kilometers
                        
                        if distance < min_distance:
                            min_distance = distance
                            closest_point = route_point
                    
                    if closest_point:
                        # Get address for this point
                        try:
                            from geopy.geocoders import Nominatim
                            geolocator = Nominatim(user_agent="chalbeyy_app")
                            location = geolocator.reverse(closest_point)
                            address = location.address if location else "Optimal pickup point"
                        except Exception as e:
                            logger.error(f"Error getting address for optimal pickup: {str(e)}")
                            address = "Optimal pickup point"
                        
                        return {
                            'coordinates': {
                                'latitude': closest_point[0],
                                'longitude': closest_point[1]
                            },
                            'address': address,
                            'distance_from_rider_km': min_distance
                        }
            except Exception as e:
                logger.error(f"Error processing route geometry: {str(e)}")
                # Fall back to simple calculation below
        
        # Simple algorithm: Choose the closer of start or end points to rider
        dist_to_start = geodesic(driver_start, rider_pickup).kilometers
        dist_to_end = geodesic(driver_end, rider_pickup).kilometers
        
        logger.info(f"Distance to start: {dist_to_start}km, Distance to end: {dist_to_end}km")
        
        # If start is closer, use that as pickup; otherwise use end
        if dist_to_start <= dist_to_end:
            closest_point = driver_start
            point_name = ride.start_location
            distance = dist_to_start
        else:
            closest_point = driver_end
            point_name = ride.end_location
            distance = dist_to_end
        
        return {
            'coordinates': {
                'latitude': closest_point[0],
                'longitude': closest_point[1]
            },
            'address': point_name or "Suggested pickup location",
            'distance_from_rider_km': distance
        }
        
    except Exception as e:
        logger.error(f"Error calculating optimal pickup point: {str(e)}")
        return {
            'coordinates': {
                'latitude': ride_request.pickup_latitude,
                'longitude': ride_request.pickup_longitude
            },
            'address': ride_request.pickup_location,
            'error': str(e)
        }

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