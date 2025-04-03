from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
import logging
import os
import json
import math
from geopy.distance import geodesic
from geopy.geocoders import Nominatim
from .models import RideRequest
from django.db import transaction

logger = logging.getLogger(__name__)

def calculate_optimal_pickup_point(ride, ride_request):
    """
    Calculate the optimal pickup point for a ride request based on the driver's route
    and the rider's pickup location.
    
    Returns a properly formatted JSON object with address, coordinates and distance information.
    """
    try:
        logger.info(f"Calculating optimal pickup point for ride request {ride_request.id}")
        
        # Get the coordinates
        driver_start = (ride.start_latitude, ride.start_longitude)
        driver_end = (ride.end_latitude, ride.end_longitude)
        rider_pickup = (ride_request.pickup_latitude, ride_request.pickup_longitude)
        
        # If route geometry is available, use it for precise pickup point calculation
        if hasattr(ride, 'route_geometry') and ride.route_geometry:
            logger.info("Using route geometry for optimal pickup calculation")
            try:
                # Parse route geometry (line string of coordinates)
                route_points = json.loads(ride.route_geometry)
                
                # Find the closest point on the route to the rider's pickup
                closest_point = find_closest_point_on_route(route_points, rider_pickup)
                
                # Calculate distance from rider to this point
                distance = calculate_distance(rider_pickup, closest_point)
                
                # Get address for the point
                address = get_address_from_coordinates(closest_point[1], closest_point[0])
                
                return {
                    'latitude': closest_point[0],
                    'longitude': closest_point[1],
                    'address': address or "Optimal pickup point",
                    'distance_from_rider': distance
                }
            except Exception as e:
                logger.error(f"Error using route geometry: {str(e)}")
                # Fall back to simple calculation if route geometry fails
        
        # Simplified calculation - halfway point with bias toward rider's location
        # This is a fallback when route geometry isn't available
        logger.info("Using simplified nearest point calculation")
        
        # Calculate a weighted average biased toward the rider's location
        # (70% weight to rider location, 30% to driver's route)
        weighted_lat = (0.7 * rider_pickup[0]) + (0.15 * driver_start[0]) + (0.15 * driver_end[0])
        weighted_lng = (0.7 * rider_pickup[1]) + (0.15 * driver_start[1]) + (0.15 * driver_end[1])
        
        # Get address for this point
        address = get_address_from_coordinates(weighted_lng, weighted_lat)
        
        # Calculate distance from rider to this point
        distance = calculate_distance(rider_pickup, (weighted_lat, weighted_lng))
        
        return {
            'latitude': weighted_lat,
            'longitude': weighted_lng,
            'address': address or "Near your location",
            'distance_from_rider': distance
        }
    except Exception as e:
        logger.exception(f"Error calculating optimal pickup point: {str(e)}")
        return {
            'latitude': ride_request.pickup_latitude,
            'longitude': ride_request.pickup_longitude,
            'address': ride_request.pickup_location,
            'distance_from_rider': 0
        }

def find_closest_point_on_route(route_points, point):
    """Find the closest point on a route to a given point"""
    min_distance = float('inf')
    closest_point = None
    
    # Assuming route_points is a list of [longitude, latitude] pairs
    for route_point in route_points:
        # Convert to (latitude, longitude) for distance calculation
        route_coord = (route_point[1], route_point[0])
        distance = calculate_distance(point, route_coord)
        
        if distance < min_distance:
            min_distance = distance
            closest_point = route_coord
    
    return closest_point or point

def calculate_distance(point1, point2):
    """
    Calculate the Euclidean distance between two points.
    In a real-world app, you would use a proper distance calculation
    like Haversine formula for GPS coordinates.
    """
    from math import sqrt
    return sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def get_address_from_coordinates(longitude, latitude):
    """
    Get an address from coordinates using reverse geocoding
    """
    try:
        geolocator = Nominatim(user_agent="chalbeyy_app")
        location = geolocator.reverse((latitude, longitude), exactly_one=True)
        if location and location.address:
            # Limit address length to avoid excessively long strings
            address = location.address
            if len(address) > 200:
                address = address[:197] + "..."
            return address
        return None
    except Exception as e:
        logger.error(f"Error in reverse geocoding: {str(e)}")
        return None

def update_existing_ride_requests_with_optimal_pickup():
    """
    Update all existing ride requests that have status='ACCEPTED' and 
    don't have an optimal_pickup_point with calculated values.
    """
    with transaction.atomic():
        # Get all accepted ride requests without optimal pickup points
        ride_requests = RideRequest.objects.filter(
            status='ACCEPTED',
            optimal_pickup_point__isnull=True
        )
        
        logger.info(f"Found {ride_requests.count()} ride requests without optimal pickup points")
        
        success_count = 0
        error_count = 0
        
        for request in ride_requests:
            try:
                if not request.ride:
                    logger.warning(f"Ride request {request.id} has no associated ride, skipping")
                    continue
                    
                optimal_pickup = calculate_optimal_pickup_point(request.ride, request)
                request.optimal_pickup_point = optimal_pickup
                request.save(update_fields=['optimal_pickup_point'])
                success_count += 1
                
            except Exception as e:
                logger.error(f"Error updating ride request {request.id}: {str(e)}")
                error_count += 1
        
        logger.info(f"Completed: {success_count} successes, {error_count} errors out of {ride_requests.count()} total")
        return success_count, error_count, ride_requests.count()

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
    Send email notification for ride acceptance
    """
    # Mock implementation - in a real app, this would send emails
    logger.info(f"Would send email notification for ride request {ride_request.id}")
    return True 