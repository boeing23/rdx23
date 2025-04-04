from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
import logging
import os
import json
import math
from geopy.distance import geodesic, great_circle
from geopy.geocoders import Nominatim
from .models import RideRequest, Notification
from django.db import transaction
from datetime import datetime, timedelta
from django.utils import timezone
import pytz

logger = logging.getLogger(__name__)

def find_suitable_rides(rides, ride_request_data):
    """
    A simplified and more lenient version of finding suitable rides based on location proximity.
    
    Parameters:
    rides: QuerySet of available rides
    ride_request_data: Dict containing the ride request information
    
    Returns:
    list: List of suitable rides with matching details
    """
    try:
        logger.info(f"Finding suitable rides with data: {ride_request_data}")
        
        # Extract coordinates
        pickup_coords = ride_request_data.get('pickup_location_coordinates')
        dropoff_coords = ride_request_data.get('dropoff_location_coordinates')
        
        # Handle different possible formats for coordinates
        if isinstance(pickup_coords, str):
            try:
                pickup_coords = json.loads(pickup_coords)
            except:
                logger.error(f"Could not parse pickup_coords: {pickup_coords}")
                return []
                
        if isinstance(dropoff_coords, str):
            try:
                dropoff_coords = json.loads(dropoff_coords)
            except:
                logger.error(f"Could not parse dropoff_coords: {dropoff_coords}")
                return []
        
        logger.info(f"Using coordinates: pickup={pickup_coords}, dropoff={dropoff_coords}")
        
        # Extract departure time
        departure_time = ride_request_data.get('departure_time')
        if isinstance(departure_time, str):
            try:
                departure_time = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
            except Exception as e:
                logger.error(f"Error parsing departure time: {str(e)}")
                departure_time = timezone.now()
        elif not departure_time:
            departure_time = timezone.now()
            
        logger.info(f"Using departure time: {departure_time}")
        
        # Extract seats needed
        seats_needed = int(ride_request_data.get('seats_needed', 1))
        logger.info(f"Seats needed: {seats_needed}")
        
        # Set very lenient thresholds for matching
        MAX_TIME_DIFFERENCE = 120  # 2 hours in minutes
        MIN_OVERLAP_SCORE = 20.0   # Very low overlap requirement
        
        suitable_rides = []
        
        for ride in rides:
            try:
                # Skip rides without enough seats
                if ride.available_seats < seats_needed:
                    logger.info(f"Ride {ride.id} skipped: Not enough seats ({ride.available_seats} < {seats_needed})")
                    continue
                
                # Get driver route coordinates
                driver_start = None
                driver_end = None
                
                # Try to get coordinates from different possible attributes
                if hasattr(ride, 'start_location_coordinates'):
                    driver_start = ride.start_location_coordinates
                elif hasattr(ride, 'start_coordinates'):
                    driver_start = ride.start_coordinates
                else:
                    # Create coordinates from lat/lng
                    driver_start = (getattr(ride, 'start_longitude', 0), getattr(ride, 'start_latitude', 0))
                
                if hasattr(ride, 'end_location_coordinates'):
                    driver_end = ride.end_location_coordinates
                elif hasattr(ride, 'end_coordinates'):
                    driver_end = ride.end_coordinates
                else:
                    # Create coordinates from lat/lng
                    driver_end = (getattr(ride, 'end_longitude', 0), getattr(ride, 'end_latitude', 0))
                
                # Make sure coordinates are valid
                if not driver_start or not driver_end:
                    logger.warning(f"Ride {ride.id} skipped: Missing coordinates")
                    continue
                
                # Try to convert string coordinates if needed
                if isinstance(driver_start, str):
                    try:
                        driver_start = json.loads(driver_start)
                    except:
                        logger.warning(f"Could not parse driver_start: {driver_start}")
                        continue
                        
                if isinstance(driver_end, str):
                    try:
                        driver_end = json.loads(driver_end)
                    except:
                        logger.warning(f"Could not parse driver_end: {driver_end}")
                        continue
                
                logger.info(f"Checking ride {ride.id} with route: {driver_start} -> {driver_end}")
                
                # Calculate overlap score
                overlap_score = calculate_overlap(driver_start, driver_end, pickup_coords, dropoff_coords)
                logger.info(f"Ride {ride.id} overlap score: {overlap_score:.2f}%")
                
                # Calculate time difference in minutes
                time_diff = abs((ride.departure_time - departure_time).total_seconds() / 60)
                logger.info(f"Ride {ride.id} time difference: {time_diff:.1f} minutes")
                
                # Calculate a simple matching score
                # 60% weight for route overlap, 40% weight for time proximity
                time_score = max(0, 100 - (time_diff / MAX_TIME_DIFFERENCE) * 100)
                matching_score = 0.6 * overlap_score + 0.4 * time_score
                logger.info(f"Ride {ride.id} matching score: {matching_score:.2f}")
                
                # Skip rides with too low overlap
                if overlap_score < MIN_OVERLAP_SCORE:
                    logger.info(f"Ride {ride.id} skipped: Overlap too low ({overlap_score:.2f}% < {MIN_OVERLAP_SCORE}%)")
                    continue
                
                # Skip rides too far in time
                if time_diff > MAX_TIME_DIFFERENCE:
                    logger.info(f"Ride {ride.id} skipped: Time difference too large ({time_diff:.1f}min > {MAX_TIME_DIFFERENCE}min)")
                    continue
                
                # Add to suitable rides
                suitable_rides.append({
                    'ride': ride,
                    'overlap_percentage': overlap_score,
                    'matching_score': matching_score,
                    'time_diff_minutes': time_diff
                })
                logger.info(f"Ride {ride.id} added to suitable rides")
                
            except Exception as e:
                logger.error(f"Error processing ride {ride.id}: {str(e)}")
                continue
        
        # Sort by matching score (highest first)
        suitable_rides.sort(key=lambda r: r['matching_score'], reverse=True)
        
        logger.info(f"Found {len(suitable_rides)} suitable rides")
        return suitable_rides
        
    except Exception as e:
        logger.error(f"Error in find_suitable_rides: {str(e)}")
        logger.exception("Full exception details:")
        return []

def calculate_overlap(driver_start, driver_end, rider_pickup, rider_dropoff):
    """
    Calculate a simplified overlap score based on distance between key points.
    
    Parameters:
    driver_start (tuple): Driver's starting coordinates (longitude, latitude)
    driver_end (tuple): Driver's destination coordinates (longitude, latitude)
    rider_pickup (tuple): Rider's pickup coordinates (longitude, latitude)
    rider_dropoff (tuple): Rider's dropoff coordinates (longitude, latitude)
    
    Returns:
    float: Overlap percentage between 0 and 100
    """
    try:
        # Calculate distances between key points
        pickup_to_driver_start = calculate_distance(rider_pickup, driver_start)
        pickup_to_driver_end = calculate_distance(rider_pickup, driver_end)
        dropoff_to_driver_start = calculate_distance(rider_dropoff, driver_start)
        dropoff_to_driver_end = calculate_distance(rider_dropoff, driver_end)
        
        # Calculate driver's total route distance
        driver_route_distance = calculate_distance(driver_start, driver_end)
        
        # Calculate rider's total route distance
        rider_route_distance = calculate_distance(rider_pickup, rider_dropoff)
        
        # Calculate how close the pickup is to driver's route
        # (smaller is better)
        pickup_proximity = min(
            pickup_to_driver_start,
            pickup_to_driver_end
        )
        
        # Calculate how close the dropoff is to driver's route
        # (smaller is better)
        dropoff_proximity = min(
            dropoff_to_driver_start,
            dropoff_to_driver_end
        )
        
        # Check if the driver and rider are going in roughly the same direction
        # by comparing distances from pickup to both ends of driver's route
        same_direction = pickup_to_driver_start > pickup_to_driver_end
        
        # Calculate a directional factor
        if same_direction:
            direction_factor = 1.0
        else:
            direction_factor = 0.5  # Penalty for opposite direction
        
        # Max acceptable distance (in km) for pickup and dropoff from driver's route
        MAX_PICKUP_DISTANCE = 5.0
        MAX_DROPOFF_DISTANCE = 5.0
        
        # Calculate pickup and dropoff proximity scores (0-100)
        pickup_score = max(0, 100 - (pickup_proximity / MAX_PICKUP_DISTANCE) * 100)
        dropoff_score = max(0, 100 - (dropoff_proximity / MAX_DROPOFF_DISTANCE) * 100)
        
        # Calculate overall overlap percentage with direction factor
        overlap_percentage = (pickup_score * 0.4 + dropoff_score * 0.6) * direction_factor
        
        logger.info(f"Calculated overlap: {overlap_percentage:.2f}%")
        logger.info(f"Pickup proximity: {pickup_proximity:.2f} km, score: {pickup_score:.2f}")
        logger.info(f"Dropoff proximity: {dropoff_proximity:.2f} km, score: {dropoff_score:.2f}")
        logger.info(f"Same direction: {same_direction}, factor: {direction_factor}")
        
        return overlap_percentage
        
    except Exception as e:
        logger.error(f"Error calculating overlap: {str(e)}")
        return 0.0

def calculate_distance(point1, point2):
    """Calculate the distance between two points in kilometers."""
    try:
        # Convert to radians
        lon1, lat1 = map(float, point1)
        lon2, lat2 = map(float, point2)
        
        lon1_rad, lat1_rad = math.radians(lon1), math.radians(lat1)
        lon2_rad, lat2_rad = math.radians(lon2), math.radians(lat2)
        
        # Haversine formula
        dlon = lon2_rad - lon1_rad
        dlat = lat2_rad - lat1_rad
        a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        r = 6371  # Radius of Earth in kilometers
        return c * r
    except Exception as e:
        logger.error(f"Error calculating distance: {str(e)}")
        return float('inf')  # Return infinitely large distance on error

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

def send_ride_match_notification(recipient, ride_request, ride):
    """
    Create a notification for a ride match.
    
    Parameters:
    recipient: The user who will receive the notification
    ride_request: The ride request that was matched
    ride: The ride that matches the request
    """
    # Create the notification
    notification = Notification.objects.create(
        recipient=recipient,
        sender=ride.driver,
        message=f"We found a ride match from {ride.start_location} to {ride.end_location}!",
        ride=ride,
        ride_request=ride_request,
        notification_type='RIDE_MATCH'
    )
    return notification

def send_ride_accepted_notification(ride_request):
    """
    Create a notification when a ride request is accepted.
    
    Parameters:
    ride_request: The accepted ride request
    """
    # Create notification for the rider
    Notification.objects.create(
        recipient=ride_request.rider,
        sender=ride_request.ride.driver,
        message=f"Your ride request to {ride_request.ride.end_location} was accepted!",
        ride=ride_request.ride,
        ride_request=ride_request,
        notification_type='REQUEST_ACCEPTED'
    )
    
    # Create notification for the driver
    Notification.objects.create(
        recipient=ride_request.ride.driver,
        sender=ride_request.rider,
        message=f"New passenger for your ride to {ride_request.ride.end_location}",
        ride=ride_request.ride,
        ride_request=ride_request,
        notification_type='REQUEST_ACCEPTED'
    )

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