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
from datetime import datetime, timedelta
from django.utils import timezone

logger = logging.getLogger(__name__)

def find_suitable_rides(rides, ride_request_data):
    """
    Find suitable rides for a ride request based on route overlap, time proximity, and seat availability.
    
    Parameters:
    rides (QuerySet): Available rides to search through
    ride_request_data (dict): Data from the ride request
    
    Returns:
    list: List of suitable rides with matching details
    """
    try:
        # Extract necessary data from ride request
        rider_pickup = ride_request_data.get('pickup_location_coordinates')
        rider_dropoff = ride_request_data.get('dropoff_location_coordinates')
        rider_departure_time = ride_request_data.get('departure_time')
        seats_needed = ride_request_data.get('seats', 1)
        
        logger.info(f"Finding suitable rides for request from {ride_request_data.get('pickup_location')} " +
                    f"to {ride_request_data.get('dropoff_location')}")
        logger.info(f"Rider coordinates: Pickup {rider_pickup}, Dropoff {rider_dropoff}")
        
        # Validate rider coordinates
        if not rider_pickup or not rider_dropoff:
            logger.error("Missing rider coordinates in find_suitable_rides")
            return []
            
        # Convert rider_departure_time to datetime if it's a string
        if isinstance(rider_departure_time, str):
            try:
                rider_departure_time = datetime.fromisoformat(rider_departure_time.replace('Z', '+00:00'))
            except ValueError:
                logger.error(f"Invalid departure time format: {rider_departure_time}")
                return []
        
        # Use lower overlap threshold for better inclusivity
        MIN_OVERLAP_THRESHOLD = 25.0  # Lowered to 25% for better matching
        MIN_MATCHING_SCORE = 50.0     # Lowered to 50% for better matching
        
        suitable_rides = []
        
        for ride in rides:
            # Skip rides with insufficient available seats
            if ride.available_seats < seats_needed:
                logger.debug(f"Skipping ride {ride.id}: insufficient seats ({ride.available_seats} available, {seats_needed} needed)")
                continue
            
            # Get driver's coordinates
            driver_start = (ride.start_longitude, ride.start_latitude)
            driver_end = (ride.end_longitude, ride.end_latitude)
            
            # Validate driver coordinates
            if not all([driver_start[0], driver_start[1], driver_end[0], driver_end[1]]):
                logger.warning(f"Skipping ride {ride.id}: missing coordinates")
                continue
                
            # Calculate route overlap (a simple method to start with)
            overlap_percentage = calculate_route_overlap(
                driver_start, driver_end, rider_pickup, rider_dropoff
            )
            
            # If overlap is below threshold, skip this ride
            if overlap_percentage < MIN_OVERLAP_THRESHOLD:
                logger.debug(f"Skipping ride {ride.id}: low overlap ({overlap_percentage:.2f}%)")
                continue
                
            # Calculate time difference in minutes
            time_diff = abs((ride.departure_time - rider_departure_time).total_seconds() / 60)
            
            # Calculate matching score
            matching_score = calculate_matching_score(
                overlap_percentage, time_diff, ride.available_seats, seats_needed
            )
            
            # If matching score is below threshold, skip this ride
            if matching_score < MIN_MATCHING_SCORE:
                logger.debug(f"Skipping ride {ride.id}: low matching score ({matching_score:.2f})")
                continue
                
            # Calculate pickup and dropoff points
            nearest_dropoff = find_nearest_dropoff(driver_start, driver_end, rider_dropoff)
            optimal_pickup = find_optimal_pickup(driver_start, driver_end, rider_pickup)
            
            # This ride is suitable, add it to results
            suitable_ride = {
                'ride': ride,
                'overlap_percentage': overlap_percentage,
                'matching_score': matching_score,
                'time_diff_minutes': time_diff,
                'nearest_dropoff_point': nearest_dropoff,
                'optimal_pickup_point': optimal_pickup
            }
            
            suitable_rides.append(suitable_ride)
            logger.info(f"Found suitable ride {ride.id} with overlap {overlap_percentage:.2f}% " +
                        f"and matching score {matching_score:.2f}")
        
        # Sort suitable rides by matching score (highest first)
        suitable_rides.sort(key=lambda r: r['matching_score'], reverse=True)
        
        return suitable_rides
        
    except Exception as e:
        logger.error(f"Error finding suitable rides: {str(e)}")
        logger.exception("Full exception details:")
        return []

def calculate_route_overlap(driver_start, driver_end, rider_pickup, rider_dropoff):
    """
    Calculate a simple route overlap percentage between driver and rider routes.
    
    For simplicity, we'll use a basic calculation that checks:
    1. Direction similarity (how parallel are the routes)
    2. Distance between routes
    3. Shared destination proximity
    
    Returns: overlap percentage (0-100)
    """
    try:
        # Convert to latitude, longitude format
        driver_start_lat_lng = (driver_start[1], driver_start[0])
        driver_end_lat_lng = (driver_end[1], driver_end[0])
        rider_pickup_lat_lng = (rider_pickup[1], rider_pickup[0])
        rider_dropoff_lat_lng = (rider_dropoff[1], rider_dropoff[0])
        
        # Calculate direction vectors
        driver_direction = (
            driver_end_lat_lng[0] - driver_start_lat_lng[0],
            driver_end_lat_lng[1] - driver_start_lat_lng[1]
        )
        
        rider_direction = (
            rider_dropoff_lat_lng[0] - rider_pickup_lat_lng[0],
            rider_dropoff_lat_lng[1] - rider_pickup_lat_lng[1]
        )
        
        # Calculate direction similarity using dot product
        driver_magnitude = math.sqrt(driver_direction[0]**2 + driver_direction[1]**2)
        rider_magnitude = math.sqrt(rider_direction[0]**2 + rider_direction[1]**2)
        
        if driver_magnitude > 0 and rider_magnitude > 0:
            dot_product = (driver_direction[0] * rider_direction[0] + 
                          driver_direction[1] * rider_direction[1])
            
            # Calculate cosine similarity, which ranges from -1 to 1
            # where 1 is same direction, 0 is perpendicular, -1 is opposite
            cosine_similarity = dot_product / (driver_magnitude * rider_magnitude)
            
            # Convert to range 0-100%
            direction_score = (cosine_similarity + 1) * 50  # Converts -1...1 to 0...100
        else:
            direction_score = 0
        
        # Calculate distance between endpoints
        # How close is rider destination to driver destination?
        destination_distance = calculate_distance(driver_end_lat_lng, rider_dropoff_lat_lng)
        
        # Normalize destination distance (0-25km)
        MAX_DEST_DISTANCE = 5  # km
        destination_score = max(0, 100 - (destination_distance * 100 / MAX_DEST_DISTANCE))
        
        # Calculate a score for general route alignment
        # Is the pickup point somewhat on the way to the driver's destination?
        driver_trip_distance = calculate_distance(driver_start_lat_lng, driver_end_lat_lng)
        
        # Distance from driver's start to rider's pickup
        pickup_distance = calculate_distance(driver_start_lat_lng, rider_pickup_lat_lng)
        
        # Distance from rider's pickup to driver's end
        remaining_distance = calculate_distance(rider_pickup_lat_lng, driver_end_lat_lng)
        
        # If going to pickup adds less than 30% to the trip
        detour_factor = (pickup_distance + remaining_distance) / (driver_trip_distance + 0.001)
        detour_score = max(0, 100 - (detour_factor - 1) * 200)
        
        # Combined score - weighted average
        DIRECTION_WEIGHT = 0.3
        DESTINATION_WEIGHT = 0.3
        DETOUR_WEIGHT = 0.4
        
        overlap_score = (
            DIRECTION_WEIGHT * direction_score +
            DESTINATION_WEIGHT * destination_score +
            DETOUR_WEIGHT * detour_score
        )
        
        # Ensure result is between 0-100
        final_score = max(0, min(100, overlap_score))
        
        logger.debug(f"Route overlap calculation: direction={direction_score:.1f}, " +
                   f"destination={destination_score:.1f}, detour={detour_score:.1f}, " +
                   f"final={final_score:.1f}")
        
        return final_score
        
    except Exception as e:
        logger.error(f"Error calculating route overlap: {str(e)}")
        return 0.0

def calculate_matching_score(overlap_percentage, time_diff, available_seats, seats_needed):
    """
    Calculate a matching score between driver and rider based on route overlap, 
    time difference, and seat availability.
    
    Parameters:
    overlap_percentage (float): Percentage of route overlap between driver and rider
    time_diff (int): Absolute time difference in minutes between driver and rider departure times
    available_seats (int): Number of available seats in the driver's vehicle
    seats_needed (int): Number of seats requested by the rider
    
    Returns:
    float: A matching score between 0 and 100, higher is better
    """
    try:
        logger.debug(f"Calculating matching score with: overlap={overlap_percentage:.2f}%, " +
                   f"time_diff={time_diff} mins, seats_available={available_seats}, " +
                   f"seats_needed={seats_needed}")
        
        # Constants for weighting factors
        OVERLAP_WEIGHT = 0.6  # Route overlap is the most important factor
        TIME_WEIGHT = 0.3     # Time difference is second most important
        SEAT_WEIGHT = 0.1     # Seat availability is least important but still matters
        
        # Calculate overlap score (0-100)
        # We directly use the overlap percentage which is already on a 0-100 scale
        overlap_score = overlap_percentage
        
        # Calculate time score (0-100)
        # Time difference of 0 minutes = 100 score
        # Time difference of 30+ minutes = 0 score
        # Linear scale in between
        MAX_TIME_DIFF = 30  # minutes
        time_score = max(0, 100 - (time_diff * 100 / MAX_TIME_DIFF))
        
        # Calculate seat score (0-100)
        # If rider's seat needs can be met, score is 100
        # Otherwise, score is 0
        seat_score = 100 if available_seats >= seats_needed else 0
        
        # Calculate weighted score
        weighted_score = (
            OVERLAP_WEIGHT * overlap_score +
            TIME_WEIGHT * time_score +
            SEAT_WEIGHT * seat_score
        )
        
        # Ensure score is between 0 and 100
        final_score = max(0, min(100, weighted_score))
        
        # Apply bonuses for perfect matches
        # Perfect time match (within 5 minutes)
        if time_diff <= 5:
            final_score += 5
            logger.debug("Bonus: Near-perfect time match (+5 points)")
            
        # Very high route overlap (over 70%)
        if overlap_percentage >= 70:
            final_score += 5
            logger.debug("Bonus: Excellent route overlap (+5 points)")
            
        # Cap the final score at 100
        final_score = min(100, final_score)
        
        logger.debug(f"Scoring components: Overlap={overlap_score:.2f}, " +
                   f"Time={time_score:.2f}, Seat={seat_score:.2f}")
        logger.debug(f"Final matching score: {final_score:.2f}")
        
        return final_score
        
    except Exception as e:
        logger.error(f"Error calculating matching score: {str(e)}")
        return 0.0

def find_nearest_dropoff(driver_start, driver_end, rider_dropoff):
    """Find the nearest point on driver's route to rider's dropoff location"""
    # For simplicity, we'll just return the driver's end point as the nearest dropoff
    # A more sophisticated implementation would find the closest point on the driver's
    # route to the rider's requested dropoff
    return driver_end

def find_optimal_pickup(driver_start, driver_end, rider_pickup):
    """Find the optimal pickup point along driver's route for the rider"""
    # For simplicity, we'll just return the rider's pickup point
    # A more sophisticated implementation would find the closest point on the driver's
    # route to the rider's requested pickup
    return rider_pickup

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