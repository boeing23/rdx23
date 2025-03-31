from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q
from datetime import datetime, timedelta
from .models import Ride, RideRequest, Notification, PendingRideRequest
from .serializers import (
    RideSerializer,
    RideRequestSerializer,
    RideDetailSerializer,
    NotificationSerializer
)
from rest_framework.exceptions import PermissionDenied, ValidationError
import logging
from django.utils import timezone
import requests
from geopy.geocoders import Nominatim
from geopy.distance import great_circle
from .services import send_ride_match_notification, send_ride_accepted_notification
import math
import random

logger = logging.getLogger(__name__)

# Initialize geolocator
geolocator = Nominatim(user_agent="carpool_app")

# OpenRouteService API constants
ORS_API_KEY = "5b3ce3597851110001cf62482c1ae097a0b848ef81a1e5085aa27c1f"
OPENROUTE_BASE_URL = "https://api.openrouteservice.org/v2"

def get_coordinates(address):
    location = geolocator.geocode(address)
    if location:
        return location.longitude, location.latitude
    return None

def get_route_distance(start_coords, end_coords):
    """Calculate the driving distance between two points using OpenRouteService."""
    try:
        url = "https://api.openrouteservice.org/v2/directions/driving-car"
        params = {
            'api_key': ORS_API_KEY,
            'start': f"{start_coords[0]},{start_coords[1]}",
            'end': f"{end_coords[0]},{end_coords[1]}"
        }
        headers = {
            'Accept': 'application/geo+json;charset=UTF-8',
            'Content-Type': 'application/json'
        }
        
        response = requests.get(url, params=params, headers=headers)
        if response.status_code == 200:
            # Convert distance from meters to miles
            return response.json()['features'][0]['properties']['segments'][0]['distance'] * 0.000621371
        return None
    except Exception as e:
        logger.error(f"Error calculating route distance: {str(e)}")
        return None

def closest_point_on_segment(p1, p2, d):
    """
    Find the closest point on a line segment (p1, p2) to point d.
    
    Parameters:
    p1, p2: Endpoints of the line segment, each a (lat, lng) tuple
    d: Target point, a (lat, lng) tuple
    
    Returns:
    Closest point on the segment to d
    """
    # Vector from p1 to p2
    segment_vec = (p2[0] - p1[0], p2[1] - p1[1])
    # Vector from p1 to d
    vec_p1d = (d[0] - p1[0], d[1] - p1[1])
    # Compute projection scalar
    t = (vec_p1d[0] * segment_vec[0] + vec_p1d[1] * segment_vec[1]) / (segment_vec[0]**2 + segment_vec[1]**2 + 1e-8)
    t = max(0, min(1, t))  # Clamp to segment
    # Projection point
    closest = (p1[0] + t * segment_vec[0], p1[1] + t * segment_vec[1])
    return closest

def find_optimal_dropoff(driver_route, rider_pickup, rider_dropoff):
    """
    Find the optimal drop-off point for a rider along a driver's route.
    
    Parameters:
    driver_route: List of (lat, lng) coordinates representing the driver's route
    rider_pickup: (lat, lng) coordinate of the rider's pickup location
    rider_dropoff: (lat, lng) coordinate of the rider's destination
    
    Returns:
    Tuple of (optimal_dropoff_point, distance_to_destination, pickup_index)
    - optimal_dropoff_point: (lat, lng) coordinate of the optimal drop-off
    - distance_to_destination: Distance in km from drop-off to destination
    - pickup_index: Index in driver_route that's nearest to the pickup location
    """
    # Find the index on driver's route closest to pickup point
    min_pickup_dist = float('inf')
    pickup_index = 0
    
    for i, point in enumerate(driver_route):
        dist = great_circle(point, rider_pickup).kilometers
        if dist < min_pickup_dist:
            min_pickup_dist = dist
            pickup_index = i
    
    # Find the optimal drop-off point after the pickup point
    min_dist = float('inf')
    optimal_point = None
    
    # Only consider segments after the pickup point
    for i in range(pickup_index, len(driver_route) - 1):
        p1 = driver_route[i]
        p2 = driver_route[i + 1]
        closest = closest_point_on_segment(p1, p2, rider_dropoff)
        dist = great_circle(closest, rider_dropoff).kilometers
        if dist < min_dist:
            min_dist = dist
            optimal_point = closest
    
    if not optimal_point:
        # Fallback to final point if no optimal point found
        optimal_point = driver_route[-1]
        min_dist = great_circle(optimal_point, rider_dropoff).kilometers
    
    return optimal_point, min_dist, pickup_index

def calculate_route_overlap(driver_start, driver_end, rider_pickup, rider_dropoff):
    """
    Calculate the overlap between driver's route and rider's route using improved algorithm.
    
    Parameters:
    driver_start: (lng, lat) tuple for driver's starting point
    driver_end: (lng, lat) tuple for driver's destination
    rider_pickup: (lng, lat) tuple for rider's pickup point
    rider_dropoff: (lng, lat) tuple for rider's destination
    
    Returns:
    tuple of (overlap_percentage, nearest_dropoff_point)
    """
    try:
        # Log the input coordinates for debugging
        logger.info(f"Route overlap calculation:")
        logger.info(f"Driver: {driver_start} -> {driver_end}")
        logger.info(f"Rider: {rider_pickup} -> {rider_dropoff}")
        
        # Verify coordinate format - all should be (lng, lat)
        for coords in [driver_start, driver_end, rider_pickup, rider_dropoff]:
            if coords[0] > 90 or coords[0] < -90 or coords[1] > 180 or coords[1] < -180:
                logger.warning(f"Coordinates appear to be in (lat, lng) format instead of (lng, lat): {coords}")
        
        # Generate routes
        driver_route = generate_route(driver_start, driver_end, num_points=20)
        rider_route = generate_route(rider_pickup, rider_dropoff, num_points=20)
        
        # Coordinate system consistency: everything in lat, lng for calculations
        # Convert (lng, lat) to (lat, lng) for great_circle calculations
        driver_route_lat_lng = [(coord[1], coord[0]) for coord in driver_route]
        rider_route_lat_lng = [(coord[1], coord[0]) for coord in rider_route]
        rider_pickup_lat_lng = (rider_pickup[1], rider_pickup[0])  # Convert from (lng, lat) to (lat, lng)
        rider_dropoff_lat_lng = (rider_dropoff[1], rider_dropoff[0])  # Convert from (lng, lat) to (lat, lng)
        
        # Convert original coordinates to lat, lng format for vector calculations
        driver_start_lat_lng = (driver_start[1], driver_start[0])
        driver_end_lat_lng = (driver_end[1], driver_end[0])
        
        # Check if the rider's destination is within a reasonable distance from driver's route
        direct_distance_to_rider_dest = great_circle(driver_end_lat_lng, rider_dropoff_lat_lng).kilometers
        logger.info(f"Direct distance from driver's destination to rider's destination: {direct_distance_to_rider_dest:.2f}km")
        
        # Calculate if the rider's destination is "on the way" or requires a significant detour
        # We'll use the detour ratio: (distance to pickup + distance from pickup to drop-off) / (direct driver route)
        direct_driver_distance = great_circle(driver_start_lat_lng, driver_end_lat_lng).kilometers
        
        # Find optimal dropoff using the projection method
        optimal_dropoff, distance_to_dest, pickup_index = find_optimal_dropoff(
            driver_route_lat_lng,
            rider_pickup_lat_lng,
            rider_dropoff_lat_lng
        )
        
        # Calculate rider's total route distance
        rider_distance = 0
        for i in range(len(rider_route_lat_lng) - 1):
            rider_distance += great_circle(rider_route_lat_lng[i], rider_route_lat_lng[i+1]).kilometers
        
        # Ensure we have a valid rider distance
        if rider_distance <= 0:
            logger.warning("Rider distance calculated as zero or negative, using direct distance")
            rider_distance = great_circle(rider_pickup_lat_lng, rider_dropoff_lat_lng).kilometers
        
        # Estimate the driver's route distance
        driver_distance = 0
        for i in range(len(driver_route_lat_lng) - 1):
            driver_distance += great_circle(driver_route_lat_lng[i], driver_route_lat_lng[i+1]).kilometers
        
        # Calculate pickup and dropoff distances
        pickup_distance = great_circle(rider_pickup_lat_lng, driver_route_lat_lng[pickup_index]).kilometers
        dropoff_distance = distance_to_dest  # Already calculated
        
        # Log intermediate distance calculations
        logger.info(f"Route distances - Driver: {driver_distance:.2f}km, Rider: {rider_distance:.2f}km")
        logger.info(f"Pickup distance: {pickup_distance:.2f}km, Dropoff distance: {dropoff_distance:.2f}km")
        
        # Special case: Check if this is a case of shared start points but very different destinations
        # Consider the rider's relative travel direction compared to the driver
        is_shared_start_point = pickup_distance < 0.1  # Within 100 meters
        
        # Use different thresholds based on the ride scenario
        if is_shared_start_point:
            # For shared starting points, we're more lenient about drop-off distance
            # since it might be a case where driver can extend their trip
            MAX_PICKUP_DIST = 1.0  # km (about 10 city blocks)
            MAX_DROPOFF_DIST = 4.0  # km (more lenient for extending the route)
            
            # Calculate if driver's route can be reasonably extended to accommodate rider
            # by checking if rider's destination is in the general direction of the driver's route
            driver_direction = (driver_end_lat_lng[0] - driver_start_lat_lng[0], 
                               driver_end_lat_lng[1] - driver_start_lat_lng[1])
            rider_direction = (rider_dropoff_lat_lng[0] - rider_pickup_lat_lng[0],
                              rider_dropoff_lat_lng[1] - rider_pickup_lat_lng[1])
            
            # Normalize vectors
            driver_mag = math.sqrt(driver_direction[0]**2 + driver_direction[1]**2)
            rider_mag = math.sqrt(rider_direction[0]**2 + rider_direction[1]**2)
            
            # Additional logging for diagnosing the direction vectors
            logger.info(f"Driver direction vector: {driver_direction}, magnitude: {driver_mag:.2f}")
            logger.info(f"Rider direction vector: {rider_direction}, magnitude: {rider_mag:.2f}")
            
            if driver_mag > 0 and rider_mag > 0:
                # Normalize
                driver_dir_norm = (driver_direction[0]/driver_mag, driver_direction[1]/driver_mag)
                rider_dir_norm = (rider_direction[0]/rider_mag, rider_direction[1]/rider_mag)
                
                # Calculate cosine similarity (dot product of normalized vectors)
                cosine_sim = (driver_dir_norm[0] * rider_dir_norm[0] + driver_dir_norm[1] * rider_dir_norm[1])
                logger.info(f"Direction similarity (cosine): {cosine_sim:.4f}")
                
                # If the directions are similar enough (cos > 0.7, or angle < ~45 degrees)
                if cosine_sim > 0.7:
                    logger.info("Rider's destination is in a similar direction as driver's route - route extension possible")
                    # Give a bonus to the drop-off score
                    MAX_DROPOFF_DIST = 5.0  # Even more lenient
                    
                    # For cases where the driver's route is shorter than the rider's,
                    # consider a potential extension of the driver's route
                    if direct_driver_distance < rider_distance and direct_distance_to_rider_dest <= 5.0:
                        logger.info("Rider's route is longer but driver could potentially extend their route")
                        
                        # Improve the dropoff distance calculation
                        # Instead of using the existing end of driver's route, calculate as if
                        # the driver might extend their route to accommodate the rider
                        extension_dropoff_distance = min(dropoff_distance, direct_distance_to_rider_dest)
                        logger.info(f"Potential extension drop-off distance: {extension_dropoff_distance:.2f}km")
                        
                        # Use the better of the two distances
                        dropoff_distance = extension_dropoff_distance
        else:
            # Regular case - standard thresholds for typical ride-sharing
            MAX_PICKUP_DIST = 1.0  # km (about 10 city blocks)
            MAX_DROPOFF_DIST = 2.0  # km (about 20 city blocks)
            
        # Calculate proximity scores (0-100)
        pickup_score = max(0, 100 - (pickup_distance * 100 / MAX_PICKUP_DIST))
        dropoff_score = max(0, 100 - (dropoff_distance * 100 / MAX_DROPOFF_DIST))
        
        # Direction alignment - calculate dot product of route vectors
        # Ensure we use (lng, lat) format consistently for the vector calculations
        driver_vector = (driver_end[0] - driver_start[0], driver_end[1] - driver_start[1])
        rider_vector = (rider_dropoff[0] - rider_pickup[0], rider_dropoff[1] - rider_pickup[1])
        
        # Calculate magnitudes
        driver_mag = math.sqrt(driver_vector[0]**2 + driver_vector[1]**2)
        rider_mag = math.sqrt(rider_vector[0]**2 + rider_vector[1]**2)
        
        # Calculate normalized dot product (cosine similarity)
        if driver_mag > 0 and rider_mag > 0:
            dot_product = (driver_vector[0] * rider_vector[0] + driver_vector[1] * rider_vector[1])
            cosine_sim = dot_product / (driver_mag * rider_mag)
            # Convert to percentage (-1 to 1) -> (0 to 100)
            direction_score = (cosine_sim + 1) * 50
        else:
            direction_score = 0
        
        # Calculate detour factor
        # How much extra distance driver has to travel compared to their original route
        total_detour = pickup_distance + dropoff_distance
        detour_factor = total_detour / max(driver_distance, 0.1)  # Avoid division by zero
        
        # Adjust the detour calculation for shared-start scenarios
        if is_shared_start_point:
            # If they start from the same point, the "detour" is more about extending the trip
            # rather than deviating from the route
            detour_factor = dropoff_distance / max(direct_driver_distance, 0.1)
            logger.info(f"Adjusted detour factor for shared starting point: {detour_factor:.2f}")
        
        detour_score = max(0, 100 - (detour_factor * 100))
        
        # Combine scores with weights
        # For shared starting points, emphasize direction alignment more
        if is_shared_start_point:
            overlap_percentage = (
                0.4 * direction_score +  # Direction alignment is more important
                0.3 * pickup_score +     # Pickup proximity
                0.2 * dropoff_score +    # Dropoff proximity
                0.1 * detour_score       # Minimize detour
            )
        else:
            overlap_percentage = (
                0.3 * direction_score +  # Direction alignment
                0.3 * pickup_score +     # Pickup proximity
                0.3 * dropoff_score +    # Dropoff proximity
                0.1 * detour_score       # Minimize detour
            )
        
        # Ensure overlap_percentage is between 0 and 100
        overlap_percentage = max(0, min(100, overlap_percentage))
        
        logger.info(f"Scoring components: Direction={direction_score:.2f}%, " +
                   f"Pickup={pickup_score:.2f}%, " +
                   f"Dropoff={dropoff_score:.2f}%, " +
                   f"Detour={detour_score:.2f}%")
        logger.info(f"Final overlap score: {overlap_percentage:.2f}%")
        
        # Convert optimal_dropoff back to (lng, lat) format for storage
        if optimal_dropoff:
            # Convert from (lat, lng) back to (lng, lat) format
            optimal_dropoff_lng_lat = (optimal_dropoff[1], optimal_dropoff[0])
            nearest_dropoff_point = {
                'coordinates': optimal_dropoff_lng_lat,
                'distance_to_destination': distance_to_dest,
                'unit': 'kilometers',
                'address': get_address_from_coordinates(optimal_dropoff_lng_lat[0], optimal_dropoff_lng_lat[1])
            }
        else:
            nearest_dropoff_point = None
        
        return overlap_percentage, nearest_dropoff_point
        
    except Exception as e:
        logger.error(f"Error calculating route overlap: {str(e)}")
        logger.exception("Exception details:")
        return 0, None

def generate_route(start, end, num_points=20):
    """
    Generate a route between start and end points using the OpenRouteService API.
    Falls back to an enhanced interpolation method if the API call fails.
    
    Parameters:
    start: (lng, lat) tuple
    end: (lng, lat) tuple
    num_points: Number of points to generate along the route
    
    Returns:
    route: List of (lng, lat) coordinates
    """
    try:
        # Validate coordinates
        if start[0] is None or start[1] is None or end[0] is None or end[1] is None:
            logger.error(f"Invalid coordinates: start={start}, end={end}")
            raise ValueError("Invalid coordinates")
            
        # Validate coordinate format (lng should be -180 to 180, lat should be -90 to 90)
        for coords in [start, end]:
            lng, lat = coords
            if lat > 90 or lat < -90:
                logger.warning(f"Latitude value out of range: {lat}")
            if lng > 180 or lng < -180:
                logger.warning(f"Longitude value out of range: {lng}")
                
        # Try using OpenRouteService API first - first try directions API
        try:
            logger.info(f"Calling OpenRouteService directions API for route from {start} to {end}")
            
            # Use the directions API first (more accurate for driving routes)
            directions_url = f"{OPENROUTE_BASE_URL}/directions/driving-car"
            headers = {
                'Accept': 'application/json, application/geo+json',
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json; charset=utf-8'
            }
            
            body = {
                "coordinates": [[start[0], start[1]], [end[0], end[1]]],
                "format": "geojson"
            }
            
            response = requests.post(directions_url, json=body, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                # Extract coordinates from the route
                if 'features' in data and len(data['features']) > 0:
                    coordinates = data['features'][0]['geometry']['coordinates']
                    
                    # If too many points, sample them down to num_points
                    if len(coordinates) > num_points:
                        step = len(coordinates) // num_points
                        sampled_coordinates = [coordinates[i] for i in range(0, len(coordinates), step)]
                        # Always include the last point
                        if coordinates[-1] not in sampled_coordinates:
                            sampled_coordinates.append(coordinates[-1])
                        
                        logger.info(f"Successfully retrieved route from API with {len(sampled_coordinates)} points")
                        return sampled_coordinates
                    else:
                        logger.info(f"Successfully retrieved route from API with {len(coordinates)} points")
                        return coordinates
            else:
                logger.warning(f"OpenRouteService directions API failed with status {response.status_code}")
                logger.warning(f"API response: {response.text[:200]}...")
        
        except Exception as e:
            logger.error(f"Error using OpenRouteService directions API: {str(e)}")
        
        # If directions API fails, try the matrix API as fallback (less accurate but more reliable)
        try:
            logger.info(f"Calling OpenRouteService matrix API as fallback")
            
            matrix_url = f"{OPENROUTE_BASE_URL}/matrix/driving-car"
            headers = {
                'Accept': 'application/json',
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json; charset=utf-8'
            }
            
            # Create intermediate points along a straight line to get a better route approximation
            intermediate_points = []
            for i in range(1, 4):  # Create 3 intermediate points
                fraction = i / 4
                lng = start[0] + fraction * (end[0] - start[0])
                lat = start[1] + fraction * (end[1] - start[1])
                intermediate_points.append([lng, lat])
            
            # Combine all points into a single list
            all_points = [list(start)] + intermediate_points + [list(end)]
            
            body = {
                "locations": all_points,
                "metrics": ["distance", "duration"],
                "units": "km"
            }
            
            response = requests.post(matrix_url, json=body, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                # Just use the points we sent since we can't get the actual route
                logger.info(f"Successfully retrieved matrix data from API, using {len(all_points)} points")
                return all_points
            else:
                logger.warning(f"OpenRouteService matrix API also failed with status {response.status_code}")
                logger.warning(f"API response: {response.text[:200]}...")
        
        except Exception as e:
            logger.error(f"Error using OpenRouteService matrix API: {str(e)}")
        
        # If both API approaches fail, fall back to the heuristic method
        logger.warning("Both OpenRouteService APIs failed, using fallback method")
        
    except Exception as e:
        logger.error(f"Error in route generation: {str(e)}")
    
    # Fallback to enhanced interpolation method with slight randomization
    logger.info("Using fallback route generation method")
    
    # Base route is a straight line
    route = []
    direct_distance = math.sqrt((end[0] - start[0])**2 + (end[1] - start[1])**2)
    
    # No randomization for very short distances
    use_randomization = direct_distance > 0.01  # About 1km
    
    for i in range(num_points):
        fraction = i / (num_points - 1)
        
        # Base coordinates (straight line)
        lng = start[0] + fraction * (end[0] - start[0])
        lat = start[1] + fraction * (end[1] - start[1])
        
        # Add small random variation to simulate roads (only for middle points)
        if use_randomization and i > 0 and i < num_points - 1:
            # More randomization in the middle, less at the ends
            variation_factor = min(0.0003, direct_distance * 0.02) * math.sin(math.pi * fraction)
            lng += random.uniform(-variation_factor, variation_factor)
            lat += random.uniform(-variation_factor, variation_factor)
        
        route.append((lng, lat))
    
    logger.info(f"Generated fallback route with {len(route)} points")
    return route

def get_address_from_coordinates(longitude, latitude):
    """Get address from coordinates using reverse geocoding"""
    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                'format': 'json',
                'lat': latitude,
                'lon': longitude
            },
            headers={'User-Agent': 'ChalBe/1.0'}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get('display_name', 'Unknown location')
        return 'Unknown location'
    except Exception as e:
        logger.error(f"Error reverse geocoding: {str(e)}")
        return 'Unknown location'

def calculate_matching_score(overlap_percentage, time_diff, available_seats, seats_needed):
    """
    Calculate a comprehensive matching score based on multiple factors.
    
    Parameters:
    - overlap_percentage: Route overlap score (0-100)
    - time_diff: Time difference in minutes between departure times
    - available_seats: Number of available seats in the ride
    - seats_needed: Number of seats needed by the rider
    
    Returns:
    - matching_score: A score from 0-100 indicating match quality
    """
    # Route overlap is the most important factor
    overlap_score = overlap_percentage
    
    # Time difference - less penalty for small differences
    # 0 min diff = 100 points, 15 min diff = 50 points, 30 min diff = 0 points
    time_score = max(0, 100 - (time_diff * 100 / 30))
    
    # Seat efficiency - how efficiently we're using available seats
    # Perfect: rider needs exactly the available seats
    # Good: rider needs most but not all seats
    # OK: rider needs few of many available seats
    seat_ratio = seats_needed / max(1, available_seats)
    
    # Ideal seat ratio is 0.7-1.0 (using 70-100% of available seats)
    if 0.7 <= seat_ratio <= 1.0:
        seat_score = 100
    elif 0.4 <= seat_ratio < 0.7:
        seat_score = 80  # Still good utilization
    elif 0.0 < seat_ratio < 0.4:
        seat_score = 60  # Less efficient use of seats
    else:
        seat_score = 0   # Not possible (would be filtered out earlier)
    
    # Include extra points for perfect seat match (rider fills exactly all seats)
    if available_seats == seats_needed:
        seat_score = 100
    
    # Log the component scores for debugging
    logger.info(f"Matching score components - Overlap: {overlap_score:.2f}, Time: {time_score:.2f}, Seats: {seat_score:.2f}")
    
    # Weighted scoring with route overlap as the most important factor
    matching_score = (
        0.6 * overlap_score +  # Route overlap is most important
        0.3 * time_score +     # Time proximity is second most important
        0.1 * seat_score       # Seat efficiency is least important
    )
    
    # Round to 2 decimal places for readability
    matching_score = round(matching_score, 2)
    
    logger.info(f"Final matching score: {matching_score:.2f}")
    
    return matching_score

def find_suitable_rides(rides, ride_request_data):
    """
    Find suitable rides for a ride request with more relaxed matching criteria.
    """
    suitable_rides = []
    
    for ride in rides:
        # Basic compatibility checks
        if ride.available_seats < ride_request_data['seats_needed']:
            continue
        
        # Time compatibility (within 5 minutes)
        time_diff = abs((ride.departure_time - ride_request_data['departure_time']).total_seconds() / 60)
        if time_diff > 5:
            continue
        
        # Calculate route overlap using more simplified method
        driver_start = (ride.start_longitude, ride.start_latitude)
        driver_end = (ride.end_longitude, ride.end_latitude)
        rider_pickup = (ride_request_data['pickup_longitude'], ride_request_data['pickup_latitude'])
        rider_dropoff = (ride_request_data['dropoff_longitude'], ride_request_data['dropoff_latitude'])
        
        overlap_percentage, nearest_point = calculate_route_overlap(
            driver_start, driver_end, rider_pickup, rider_dropoff
        )
        
        # More lenient route matching criteria
        if overlap_percentage >= 60:
            matching_score = calculate_matching_score(
                overlap_percentage, 
                time_diff, 
                ride.available_seats,
                ride_request_data['seats_needed']
            )
            
            suitable_rides.append({
                'ride': ride,
                'overlap_percentage': overlap_percentage,
                'matching_score': matching_score,
                'time_diff': time_diff,
                'nearest_dropoff_point': nearest_point
            })
    
    # Sort rides by matching score (descending)
    suitable_rides.sort(key=lambda x: x['matching_score'], reverse=True)
    
    return suitable_rides

# Create your views here.

class IsDriverOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.driver == request.user

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.user_type == 'DRIVER'

class IsRiderOrDriver(permissions.BasePermission):
    def has_permission(self, request, view):
        logger.info(f"Checking permission for user: {request.user.username}")
        logger.info(f"User type: {request.user.user_type}")
        logger.info(f"Request method: {request.method}")
        logger.info(f"User authenticated: {request.user.is_authenticated}")
        
        if not request.user.is_authenticated:
            logger.warning(f"User {request.user.username} is not authenticated")
            return False
            
        # For POST requests, only allow riders
        if request.method == 'POST':
            is_rider = request.user.user_type == 'RIDER'
            logger.info(f"POST request - User is rider: {is_rider}")
            return is_rider
            
        # For other methods, allow both riders and drivers
        is_allowed = request.user.user_type in ['RIDER', 'DRIVER']
        logger.info(f"Non-POST request - User type allowed: {is_allowed}")
        return is_allowed

class RideViewSet(viewsets.ModelViewSet):
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'user_type') and user.user_type == 'driver':
            return Ride.objects.filter(driver=user)
        else:
            return Ride.objects.filter(status='SCHEDULED').exclude(driver=user)
            
    @action(detail=False, methods=['get'])
    def debug_ride_matching(self, request):
        """
        Debug endpoint to diagnose ride matching issues.
        Shows all rides, pending requests, and tests the matching algorithm.
        """
        try:
            logger.info(f"DEBUG MATCHING: Debug endpoint called by {request.user.username}")
            
            # Get all rides and pending requests
            all_rides = Ride.objects.all().order_by('-created_at')[:20]  # Limit to most recent 20
            all_pending_requests = PendingRideRequest.objects.filter(status='PENDING')
            
            # Collect data about each ride
            rides_data = []
            for ride in all_rides:
                ride_data = {
                    'id': ride.id,
                    'driver': f"{ride.driver.username} (ID: {ride.driver.id})",
                    'start': f"{ride.start_location} ({ride.start_latitude}, {ride.start_longitude})",
                    'end': f"{ride.end_location} ({ride.end_latitude}, {ride.end_longitude})",
                    'departure_time': ride.departure_time,
                    'available_seats': ride.available_seats,
                    'status': ride.status,
                    'created_at': ride.created_at,
                }
                rides_data.append(ride_data)
                
            # Collect data about each pending request
            pending_requests_data = []
            for pr in all_pending_requests:
                pr_data = {
                    'id': pr.id,
                    'rider': f"{pr.rider.username} (ID: {pr.rider.id})",
                    'pickup': f"{pr.pickup_location} ({pr.pickup_latitude}, {pr.pickup_longitude})",
                    'dropoff': f"{pr.dropoff_location} ({pr.dropoff_latitude}, {pr.dropoff_longitude})",
                    'departure_time': pr.departure_time,
                    'seats_needed': pr.seats_needed,
                    'status': pr.status,
                    'created_at': pr.created_at,
                }
                pending_requests_data.append(pr_data)
                
            # Test matching each request with each ride
            match_results = []
            
            for pr in all_pending_requests:
                for ride in all_rides.filter(status='SCHEDULED'):
                    # Skip if ride doesn't have enough seats
                    if ride.available_seats < pr.seats_needed:
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': False,
                            'reason': f"Not enough seats: {ride.available_seats} < {pr.seats_needed}"
                        }
                        match_results.append(result)
                        continue
                        
                    # Skip if departure times are too far apart
                    time_diff = abs((ride.departure_time - pr.departure_time).total_seconds() / 60)
                    if time_diff > 30:
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': False,
                            'reason': f"Time difference too large: {time_diff:.1f} minutes"
                        }
                        match_results.append(result)
                        continue
                        
                    # Skip if rider is the driver
                    if pr.rider == ride.driver:
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': False,
                            'reason': "Rider is the driver of this ride"
                        }
                        match_results.append(result)
                        continue
                    
                    # Get coordinates in correct format
                    driver_start = (ride.start_longitude, ride.start_latitude)
                    driver_end = (ride.end_longitude, ride.end_latitude)
                    rider_pickup = (pr.pickup_longitude, pr.pickup_latitude)
                    rider_dropoff = (pr.dropoff_longitude, pr.dropoff_latitude)
                    
                    # Check for missing coordinates
                    if (None in driver_start or None in driver_end or 
                        None in rider_pickup or None in rider_dropoff):
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': False,
                            'reason': "Missing coordinates"
                        }
                        match_results.append(result)
                        continue
                    
                    # Calculate route overlap
                    try:
                        overlap_percentage, nearest_point = calculate_route_overlap(
                            driver_start, driver_end, rider_pickup, rider_dropoff
                        )
                        
                        # Calculate matching score
                        matching_score = calculate_matching_score(
                            overlap_percentage, 
                            time_diff,
                            ride.available_seats,
                            pr.seats_needed
                        )
                        
                        # Determine if this is a match
                        MIN_OVERLAP_THRESHOLD = 35.0
                        is_match = overlap_percentage >= MIN_OVERLAP_THRESHOLD
                        
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': is_match,
                            'reason': f"Overlap: {overlap_percentage:.2f}%, Score: {matching_score:.2f}" +
                                     ('' if is_match else f" (below {MIN_OVERLAP_THRESHOLD}% threshold)"),
                            'overlap': overlap_percentage,
                            'score': matching_score,
                            'time_diff': time_diff
                        }
                        match_results.append(result)
                        
                    except Exception as e:
                        result = {
                            'request_id': pr.id,
                            'ride_id': ride.id,
                            'match': False,
                            'reason': f"Error calculating overlap: {str(e)}"
                        }
                        match_results.append(result)
            
            # Analyze database for existing matches
            existing_matches = RideRequest.objects.all().order_by('-created_at')[:20]  # Limit to most recent 20
            matches_data = []
            
            for match in existing_matches:
                match_data = {
                    'id': match.id,
                    'rider': f"{match.rider.username} (ID: {match.rider.id})",
                    'ride_id': match.ride.id if match.ride else None,
                    'status': match.status,
                    'created_at': match.created_at,
                    'pickup': f"{match.pickup_location} ({match.pickup_latitude}, {match.pickup_longitude})",
                    'dropoff': f"{match.dropoff_location} ({match.dropoff_latitude}, {match.dropoff_longitude})",
                }
                matches_data.append(match_data)
                
            # Check the check_pending_requests periodic task
            cron_jobs = []
            from django_crontab.models import CrontabJobLog
            try:
                # Check if django_crontab is installed and configured
                recent_cron_runs = CrontabJobLog.objects.filter(
                    command__contains="check_pending_requests"
                ).order_by('-start_time')[:5]
                
                for run in recent_cron_runs:
                    cron_jobs.append({
                        'start_time': run.start_time,
                        'end_time': run.end_time,
                        'success': run.success,
                        'message': run.message,
                    })
            except:
                cron_jobs.append({'status': 'Django-crontab not installed or no logs available'})
            
            # Summarize matches
            possible_matches = [r for r in match_results if r['match']]
            
            return Response({
                'debug_summary': {
                    'rides_count': all_rides.count(),
                    'pending_requests_count': all_pending_requests.count(),
                    'existing_matches_count': existing_matches.count(),
                    'possible_matches_found': len(possible_matches),
                    'timestamp': timezone.now(),
                    'called_by': request.user.username
                },
                'rides': rides_data,
                'pending_requests': pending_requests_data,
                'match_tests': match_results,
                'existing_matches': matches_data,
                'cron_job_status': cron_jobs
            })
        except Exception as e:
            logger.error(f"DEBUG MATCHING ERROR: {str(e)}")
            logger.exception("Full exception details:")
            return Response({
                'error': str(e),
                'timestamp': timezone.now()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RideDetailSerializer
        return RideSerializer

    def perform_create(self, serializer):
        ride = serializer.save(driver=self.request.user)
        
        # After creating a ride, check for pending ride requests that might match
        self.check_pending_requests(ride)
    
    def check_pending_requests(self, ride):
        """
        Check for pending ride requests that might match the new ride
        
        Parameters:
        - ride: The newly created ride object
        
        Side effects:
        - Creates RideRequest objects for matching pending requests
        - Updates PendingRideRequest status
        - Creates notifications for matched riders
        """
        logger.info(f"Checking pending requests for ride {ride.id}")
        
        # Get ride details
        driver_start = (ride.start_longitude, ride.start_latitude)
        driver_end = (ride.end_longitude, ride.end_latitude)
        
        # Get all pending requests
        pending_requests = PendingRideRequest.objects.filter(status='PENDING')
        logger.info(f"Found {pending_requests.count()} pending ride requests")
        
        # Track all matching riders with their dropoff distance
        matching_riders = []
        
        for pending_request in pending_requests:
            try:
                # Skip if ride doesn't have enough seats
                if ride.available_seats < pending_request.seats_needed:
                    logger.info(f"Pending request {pending_request.id}: Not enough seats ({ride.available_seats} < {pending_request.seats_needed})")
                    continue
                
                # Skip if time difference is too large (30 minutes)
                time_diff = abs((ride.departure_time - pending_request.departure_time).total_seconds() / 60)
                if time_diff > 30:
                    logger.info(f"Pending request {pending_request.id}: Time difference too large ({time_diff:.1f} minutes)")
                    continue
                
                # Get rider pickup and dropoff coordinates
                rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                
                # Log for debugging
                logger.info(f"Checking compatibility for pending request {pending_request.id}:")
                logger.info(f"Driver route: {driver_start} -> {driver_end}")
                logger.info(f"Rider request: {rider_pickup} -> {rider_dropoff}")
                
                # Validate coordinates
                if (None in driver_start or None in driver_end or 
                    None in rider_pickup or None in rider_dropoff):
                    logger.error(f"Pending request {pending_request.id}: Invalid coordinates")
                    continue
                
                # Calculate route overlap
                overlap_percentage, nearest_point = calculate_route_overlap(
                    driver_start, driver_end, rider_pickup, rider_dropoff
                )
                
                logger.info(f"Pending request {pending_request.id} route overlap: {overlap_percentage:.2f}%")
                
                # Calculate matching score
                matching_score = calculate_matching_score(
                    overlap_percentage,
                    time_diff,
                    ride.available_seats,
                    pending_request.seats_needed
                )
                logger.info(f"Pending request {pending_request.id} matching score: {matching_score:.2f}")
                
                # Use consistent threshold with find_suitable_rides (35%)
                MIN_OVERLAP_THRESHOLD = 35.0
                
                # If there's a good match, add to matching riders
                if overlap_percentage >= MIN_OVERLAP_THRESHOLD:
                    logger.info(f"Found match for pending request {pending_request.id} with ride {ride.id}")
                    
                    # Add to matching riders with score info
                    if nearest_point:
                        matching_riders.append({
                            'request': pending_request,
                            'overlap': overlap_percentage,
                            'matching_score': matching_score,
                            'distance_to_dest': nearest_point.get('distance_to_destination', float('inf')),
                            'nearest_point': nearest_point
                        })
                    else:
                        logger.warning(f"No nearest dropoff point found for request {pending_request.id}")
                else:
                    logger.info(f"Pending request {pending_request.id}: Overlap too low ({overlap_percentage:.2f}% < {MIN_OVERLAP_THRESHOLD}%)")
            except Exception as e:
                logger.error(f"Error processing pending request {pending_request.id}: {str(e)}")
                logger.exception("Exception details:")
                continue
        
        # Sort matching riders by matching score (descending)
        matching_riders.sort(key=lambda x: x['matching_score'], reverse=True)
        logger.info(f"Found {len(matching_riders)} matching riders")
        
        # Process the best matches first (up to ride's available seats)
        available_seats = ride.available_seats
        for match in matching_riders:
            if available_seats < match['request'].seats_needed:
                # Skip if not enough seats
                logger.info(f"Skipping match with request {match['request'].id}: Not enough remaining seats")
                continue
                
            pending_request = match['request']
            nearest_point = match['nearest_point']
            
            # Create a ride request
            try:
                ride_request = RideRequest.objects.create(
                    rider=pending_request.rider,
                    ride=ride,
                    pickup_location=pending_request.pickup_location,
                    dropoff_location=pending_request.dropoff_location,
                    pickup_latitude=pending_request.pickup_latitude,
                    pickup_longitude=pending_request.pickup_longitude,
                    dropoff_latitude=pending_request.dropoff_latitude,
                    dropoff_longitude=pending_request.dropoff_longitude,
                    departure_time=ride.departure_time,
                    seats_needed=pending_request.seats_needed,
                    status='PENDING',
                    nearest_dropoff_point=nearest_point
                )
                
                logger.info(f"Created ride request {ride_request.id} for pending request {pending_request.id}")
                
                # Create notification for the rider
                Notification.objects.create(
                    recipient=pending_request.rider,
                    sender=ride.driver,
                    message=f"Found a matching ride for your pending request! Driver: {ride.driver.first_name} {ride.driver.last_name}",
                    ride=ride,
                    ride_request=ride_request,
                    notification_type='RIDE_MATCH'
                )
                
                # Send email notification only to the rider
                try:
                    send_ride_match_notification(ride_request, notify_driver=False)
                    logger.info(f"Sent email notification for ride match to {pending_request.rider.email}")
                except Exception as e:
                    logger.error(f"Failed to send email notification for ride match: {str(e)}")
                
                # Update available seats
                available_seats -= pending_request.seats_needed
                
                # Update pending request status
                pending_request.status = 'MATCHED'
                pending_request.save()
                logger.info(f"Updated pending request {pending_request.id} status to MATCHED")
            except Exception as e:
                logger.error(f"Error creating ride request for {pending_request.id}: {str(e)}")
                logger.exception("Exception details:")
                continue
        
        # Log summary
        logger.info(f"Finished checking pending requests for ride {ride.id}. " +
                  f"Matched {len(matching_riders) - (available_seats == ride.available_seats)} out of {len(matching_riders)} compatible requests.")

    @action(detail=False, methods=['get'])
    def search(self, request):
        start_lat = float(request.query_params.get('start_lat', 0))
        start_lon = float(request.query_params.get('start_lon', 0))
        end_lat = float(request.query_params.get('end_lat', 0))
        end_lon = float(request.query_params.get('end_lon', 0))
        date = request.query_params.get('date')
        seats = int(request.query_params.get('seats', 1))

        rides = Ride.objects.filter(
            status='SCHEDULED',
            available_seats__gte=seats
        )

        if date:
            date_obj = datetime.strptime(date, '%Y-%m-%d').date()
            rides = rides.filter(departure_time__date=date_obj)

        # Filter rides within 10 miles radius of start and end points
        filtered_rides = []
        for ride in rides:
            start_distance = great_circle(
                (start_lat, start_lon),
                (ride.start_latitude, ride.start_longitude)
            ).miles
            end_distance = great_circle(
                (end_lat, end_lon),
                (ride.end_latitude, ride.end_longitude)
            ).miles

            if start_distance <= 10 and end_distance <= 10:
                filtered_rides.append(ride)

        serializer = self.get_serializer(filtered_rides, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        ride = self.get_object()
        status = request.data.get('status')
        
        if status not in dict(Ride.STATUS_CHOICES):
            return Response(
                {"error": "Invalid status"},
                status=status.HTTP_400_BAD_REQUEST
            )

        ride.status = status
        ride.save()
        return Response(self.get_serializer(ride).data)

    def create(self, request, *args, **kwargs):
        logger.info(f"Received request data: {request.data}")
        logger.info(f"User type: {request.user.user_type}")
        logger.info(f"User: {request.user.username}")
        logger.info(f"Request headers: {request.headers}")
        return super().create(request, *args, **kwargs)

class RideRequestViewSet(viewsets.ModelViewSet):
    serializer_class = RideRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return RideRequest.objects.filter(rider=self.request.user)

    def find_suitable_rides(self, ride_request_data):
        """
        Find suitable rides for a ride request with improved matching algorithm.
        
        Parameters:
        - ride_request_data: Dictionary containing ride request details
        
        Returns:
        - List of suitable rides sorted by matching score (descending)
        """
        logger.info(f"Finding suitable rides for request: {ride_request_data}")
        
        # Get available rides (not by the requester)
        available_rides = Ride.objects.filter(
            departure_time__gte=timezone.now(),
            available_seats__gte=ride_request_data['seats_needed']
        ).exclude(driver=self.request.user)  # Use request.user instead of ride_request_data['rider']
        
        logger.info(f"Initial available rides count: {available_rides.count()}")
        
        suitable_rides = []
        
        for ride in available_rides:
            # Basic compatibility checks
            if ride.available_seats < ride_request_data['seats_needed']:
                logger.info(f"Ride ID {ride.id} excluded: insufficient seats ({ride.available_seats} < {ride_request_data['seats_needed']})")
                continue
            
            # Time compatibility (within 30 minutes)
            time_diff = abs((ride.departure_time - ride_request_data['departure_time']).total_seconds() / 60)
            logger.info(f"Ride ID {ride.id} time difference: {time_diff:.1f} minutes")
            
            if time_diff > 30:  # Allow up to 30 minute difference
                logger.info(f"Ride ID {ride.id} excluded: time difference too large ({time_diff:.1f} > 30 minutes)")
                continue
            
            # Coordinate consistency check - these should all be (lng, lat) format
            driver_start = (ride.start_longitude, ride.start_latitude)
            driver_end = (ride.end_longitude, ride.end_latitude)
            rider_pickup = (ride_request_data['pickup_longitude'], ride_request_data['pickup_latitude'])
            rider_dropoff = (ride_request_data['dropoff_longitude'], ride_request_data['dropoff_latitude'])
            
            # Validate all coordinates are present
            if (None in driver_start or None in driver_end or 
                None in rider_pickup or None in rider_dropoff):
                logger.error(f"Ride ID {ride.id} excluded: missing coordinates")
                continue
                
            # Log the route for debugging
            logger.info(f"Calculating route overlap for ride {ride.id}:")
            logger.info(f"Driver route: {driver_start} -> {driver_end}")
            logger.info(f"Rider route: {rider_pickup} -> {rider_dropoff}")
            
            # Calculate route overlap
            overlap_percentage, nearest_point = calculate_route_overlap(
                driver_start, driver_end, rider_pickup, rider_dropoff
            )
            
            logger.info(f"Ride ID {ride.id} route overlap: {overlap_percentage:.2f}%")
            
            # Use more lenient threshold for low-density areas or initial deployment
            # 35% is enough to indicate reasonable directional alignment
            MIN_OVERLAP_THRESHOLD = 35.0
            
            if overlap_percentage >= MIN_OVERLAP_THRESHOLD:
                # Calculate comprehensive matching score
                matching_score = calculate_matching_score(
                    overlap_percentage, 
                    time_diff, 
                    ride.available_seats,
                    ride_request_data['seats_needed']
                )
                
                logger.info(f"Ride ID {ride.id} matching score: {matching_score:.2f}")
                
                suitable_rides.append({
                    'ride': ride,
                    'overlap_percentage': overlap_percentage,
                    'matching_score': matching_score,
                    'time_diff': time_diff,
                    'nearest_dropoff_point': nearest_point
                })
            else:
                logger.info(f"Ride ID {ride.id} excluded: low route overlap ({overlap_percentage:.2f}% < {MIN_OVERLAP_THRESHOLD}%)")
        
        # Sort rides by matching score (descending)
        suitable_rides.sort(key=lambda x: x['matching_score'], reverse=True)
        
        logger.info(f"Final suitable rides count: {len(suitable_rides)}")
        if suitable_rides:
            best_match = max(suitable_rides, key=lambda x: x['matching_score'])
            logger.info(f"Best match: Ride ID {best_match['ride'].id} with score {best_match['matching_score']:.2f}")
        else:
            logger.info("No suitable rides found")
        
        return suitable_rides

    def create(self, request, *args, **kwargs):
        try:
            logger.info("Starting ride request creation")
            logger.info(f"Request data: {request.data}")
            logger.info(f"User: {request.user.username}, ID: {request.user.id}, Type: {request.user.user_type}")
            
            # Extra detailed debugging for Railway
            logger.info(f"DATABASE DEBUG - Server timezone: {timezone.get_current_timezone_name()}")
            logger.info(f"DATABASE DEBUG - Current time: {timezone.now()}")
            
            # Validate the serializer
            serializer = self.get_serializer(data=request.data)
            if not serializer.is_valid():
                logger.error(f"Serializer validation failed: {serializer.errors}")
                return Response({
                    'status': 'error',
                    'has_match': False,
                    'errors': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
                
            logger.info(f"Serializer validated successfully: {serializer.validated_data}")
            
            # Find potential rides first
            potential_rides = self.find_suitable_rides(serializer.validated_data)
            logger.info(f"Found {len(potential_rides)} potential rides")
            
            if not potential_rides:
                logger.warning("No suitable rides found for request")
                
                # Create a pending ride request for future matching
                from .models import PendingRideRequest
                
                # Check the departure time - only store requests for future rides
                departure_time = serializer.validated_data['departure_time']
                
                # Only store the request if the departure time is at least 30 minutes in the future
                time_window = timezone.now() + timezone.timedelta(minutes=30)
                
                if departure_time > time_window:
                    try:
                        # Create a pending request for future matching
                        pending_request = PendingRideRequest.objects.create(
                            rider=request.user,
                            pickup_location=serializer.validated_data['pickup_location'],
                            dropoff_location=serializer.validated_data['dropoff_location'],
                            pickup_latitude=serializer.validated_data['pickup_latitude'],
                            pickup_longitude=serializer.validated_data['pickup_longitude'],
                            dropoff_latitude=serializer.validated_data['dropoff_latitude'],
                            dropoff_longitude=serializer.validated_data['dropoff_longitude'],
                            departure_time=departure_time,
                            seats_needed=serializer.validated_data['seats_needed'],
                            status='PENDING'
                        )
                        
                        logger.info(f"DATABASE DEBUG - Created pending ride request: {pending_request.id}")
                        logger.info(f"DATABASE DEBUG - Object in DB: {PendingRideRequest.objects.filter(id=pending_request.id).exists()}")
                        
                        # Verify the data is saved correctly
                        saved_request = PendingRideRequest.objects.get(id=pending_request.id)
                        logger.info(f"DATABASE DEBUG - Saved object fields: pickup_lat={saved_request.pickup_latitude}, pickup_lng={saved_request.pickup_longitude}")
                        
                        # Create a notification for the rider
                        notification = Notification.objects.create(
                            recipient=request.user,
                            message=f"No rides found matching your criteria. Your request has been saved and we'll notify you if a match is found before your departure time.",
                            notification_type="RIDE_PENDING"
                        )
                        
                        logger.info(f"DATABASE DEBUG - Created notification: {notification.id}")
                        
                        return Response({
                            'status': 'pending',
                            'has_match': False,
                            'pending_request_id': pending_request.id,
                            'message': 'No suitable rides found at the moment. Your request has been saved and we will notify you if a match is found later.'
                        }, status=status.HTTP_202_ACCEPTED)
                    except Exception as db_error:
                        logger.error(f"DATABASE ERROR creating pending request: {str(db_error)}")
                        logger.exception("Database error details:")
                        return Response({
                            'status': 'error',
                            'has_match': False,
                            'error': f'Database error: {str(db_error)}'
                        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                else:
                    # If the request is for immediate travel (within 30 minutes), just return no matches
                    return Response({
                        'status': 'error',
                        'has_match': False,
                        'error': 'No suitable rides found matching your criteria. Please try different locations or times.'
                    }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the best matching ride
            best_match = max(potential_rides, key=lambda x: x['matching_score'])
            matched_ride = best_match['ride']
            
            logger.info(f"Found best matching ride: {matched_ride.id}")
            logger.info(f"Driver: {matched_ride.driver.username}")
            logger.info(f"Vehicle details: {matched_ride.driver.vehicle_make} {matched_ride.driver.vehicle_model}")
            
            try:
                # Create the ride request with the matched ride
                ride_request = serializer.save(
                    rider=request.user,
                    ride=matched_ride,
                    status='PENDING',
                    nearest_dropoff_point=best_match['nearest_dropoff_point']
                )
                
                logger.info(f"DATABASE DEBUG - Created ride request: {ride_request.id}")
                logger.info(f"DATABASE DEBUG - Object in DB: {RideRequest.objects.filter(id=ride_request.id).exists()}")
                
                # Verify the data is saved correctly
                saved_request = RideRequest.objects.get(id=ride_request.id)
                logger.info(f"DATABASE DEBUG - Saved object fields: pickup_lat={saved_request.pickup_latitude}, ride_id={saved_request.ride_id}")
                
                # Check if notifications already exist to prevent duplicates
                existing_notifications = Notification.objects.filter(
                    Q(recipient=ride_request.rider, ride_request=ride_request, notification_type='RIDE_MATCH')
                )
                
                if not existing_notifications.exists():
                    # Create a notification for the rider with match details
                    notification = Notification.objects.create(
                        recipient=ride_request.rider,
                        sender=matched_ride.driver,
                        message=f"Found a matching ride! Driver: {matched_ride.driver.first_name} {matched_ride.driver.last_name}",
                        ride=matched_ride,
                        ride_request=ride_request,
                        notification_type='RIDE_MATCH'
                    )
                    
                    logger.info(f"DATABASE DEBUG - Created match notification: {notification.id}")
            except Exception as db_error:
                logger.error(f"DATABASE ERROR creating ride request: {str(db_error)}")
                logger.exception("Database error details:")
                return Response({
                    'status': 'error',
                    'has_match': False,
                    'error': f'Database error: {str(db_error)}'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Send email notification only to the rider
            try:
                send_ride_match_notification(ride_request, notify_driver=False)
            except Exception as e:
                logger.error(f"Failed to send email notification for ride match: {str(e)}")
                # Continue processing even if email fails
            
            # Prepare the response data with a clear match status
            response_data = {
                'status': 'success',
                'has_match': True,
                'ride_request': {
                    'id': ride_request.id,
                    'status': ride_request.status,
                    'pickup_location': ride_request.pickup_location,
                    'dropoff_location': ride_request.dropoff_location,
                    'seats_needed': ride_request.seats_needed,
                    'departure_time': ride_request.departure_time,
                },
                'match_details': {
                    'ride_id': matched_ride.id,
                    'driver_name': f"{matched_ride.driver.first_name} {matched_ride.driver.last_name}",
                    'driver_email': matched_ride.driver.email,
                    'driver_phone': matched_ride.driver.phone_number,
                    'vehicle_details': {
                        'make': matched_ride.driver.vehicle_make,
                        'model': matched_ride.driver.vehicle_model,
                        'year': matched_ride.driver.vehicle_year,
                        'color': matched_ride.driver.vehicle_color,
                        'license_plate': matched_ride.driver.license_plate,
                        'max_passengers': matched_ride.driver.max_passengers
                    },
                    'ride_details': {
                        'start_location': matched_ride.start_location,
                        'end_location': matched_ride.end_location,
                        'departure_time': matched_ride.departure_time,
                        'available_seats': matched_ride.available_seats
                    }
                }
            }
            
            logger.info("Response data prepared:")
            logger.info(f"Response data summary: Ride request ID {ride_request.id} matched with ride ID {matched_ride.id}")
            
            return Response(response_data, status=status.HTTP_201_CREATED)
            
        except ValidationError as e:
            logger.error(f"Validation error: {str(e)}")
            return Response({
                'status': 'error',
                'has_match': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in create: {str(e)}")
            logger.error(f"Error type: {type(e)}")
            logger.error(f"Error args: {e.args}")
            logger.exception("Full exception details:")
            return Response({
                'status': 'error',
                'has_match': False,
                'error': 'An unexpected error occurred. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        ride_request = self.get_object()
        if request.user != ride_request.ride.driver:
            raise PermissionDenied("Only the driver can accept ride requests")

        # Verify enough seats are available
        ride = ride_request.ride
        if ride.available_seats < ride_request.seats_needed:
            logger.warning(f"Cannot accept request: not enough seats ({ride.available_seats} < {ride_request.seats_needed})")
            return Response({
                'status': 'error',
                'error': f'Not enough seats available. You have {ride.available_seats} seats but this request needs {ride_request.seats_needed}.'
            }, status=status.HTTP_400_BAD_REQUEST)

        ride_request.status = 'ACCEPTED'
        ride_request.save()

        # Update available seats
        ride.available_seats -= ride_request.seats_needed
        ride.save()

        # Create detailed notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            sender=ride_request.ride.driver,
            message=f"Your ride request has been accepted by {ride_request.ride.driver.first_name} {ride_request.ride.driver.last_name}",
            notification_type="REQUEST_ACCEPTED",
            ride=ride_request.ride,
            ride_request=ride_request
        )
        
        # Create detailed notification for the driver
        Notification.objects.create(
            recipient=ride_request.ride.driver,
            sender=ride_request.rider,
            message=f"You accepted a ride request from {ride_request.rider.first_name} {ride_request.rider.last_name}",
            notification_type="RIDE_ACCEPTED_BY_DRIVER",
            ride=ride_request.ride,
            ride_request=ride_request
        )

        # Send email notification for ride accepted
        try:
            send_ride_accepted_notification(ride_request)
        except Exception as e:
            logger.error(f"Failed to send email notification for ride accepted: {str(e)}")

        return Response({'status': 'request accepted'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        ride_request = self.get_object()
        if request.user != ride_request.ride.driver:
            raise PermissionDenied("Only the driver can reject ride requests")

        ride_request.status = 'REJECTED'
        ride_request.save()

        # Create notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            message=f"Your ride request for {ride_request.ride.start_location} to {ride_request.ride.end_location} has been rejected",
            notification_type="REQUEST_REJECTED",
            ride=ride_request.ride,
            ride_request=ride_request
        )

        return Response({'status': 'request rejected'})

    @action(detail=True, methods=['post'])
    def accept_match(self, request, pk=None):
        """
        Action to accept a ride match by the rider
        """
        logger.info(f"Accepting ride match for request {pk}")
        
        ride_request = self.get_object()
        logger.info(f"Rider: {ride_request.rider.username}, Request status: {ride_request.status}")
        
        if ride_request.rider != request.user:
            logger.warning(f"Permission denied: {request.user.username} tried to accept {ride_request.rider.username}'s request")
            raise PermissionDenied("You don't have permission to accept this ride request")
        
        if ride_request.status != 'PENDING':
            logger.warning(f"Invalid status: Ride request {pk} is {ride_request.status}, not PENDING")
            return Response({'status': 'error', 'message': 'This ride request is not in pending status'}, 
                          status=status.HTTP_400_BAD_REQUEST)

        # Verify the ride still has enough available seats
        ride = ride_request.ride
        if ride.available_seats < ride_request.seats_needed:
            logger.warning(f"Cannot accept match: not enough seats ({ride.available_seats} < {ride_request.seats_needed})")
            return Response({
                'status': 'error',
                'message': f'This ride no longer has enough available seats. Required: {ride_request.seats_needed}, Available: {ride.available_seats}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update the status to ACCEPTED
        logger.info(f"Updating ride request {pk} status to ACCEPTED")
        ride_request.status = 'ACCEPTED'
        ride_request.save()
        
        # Update available seats in the ride
        logger.info(f"Updating available seats for ride {ride.id} from {ride.available_seats} to {ride.available_seats - ride_request.seats_needed}")
        ride.available_seats -= ride_request.seats_needed
        ride.save()
        
        # Create notifications for both rider and driver
        logger.info(f"Creating notifications for ride request {pk}")
        Notification.objects.create(
            recipient=ride_request.ride.driver,
            sender=ride_request.rider,
            message=f"{ride_request.rider.first_name} {ride_request.rider.last_name} has accepted the ride match.",
            ride=ride_request.ride,
            ride_request=ride_request,
            notification_type='REQUEST_ACCEPTED'
        )
        
        Notification.objects.create(
            recipient=ride_request.rider,
            sender=ride_request.ride.driver,
            message=f"You have successfully accepted the ride with {ride_request.ride.driver.first_name} {ride_request.ride.driver.last_name}.",
            ride=ride_request.ride,
            ride_request=ride_request,
            notification_type='REQUEST_ACCEPTED'
        )
        
        # Send email notification for ride accepted
        logger.info(f"Attempting to send email notifications for ride request {pk}")
        try:
            # Send notification to both rider and driver
            send_ride_match_notification(ride_request, notify_driver=True)
            email_sent = send_ride_accepted_notification(ride_request)
            logger.info(f"Email notification result: {email_sent}")
        except Exception as e:
            logger.error(f"Failed to send email notification for ride accepted: {str(e)}")
            logger.exception("Email exception details:")
        
        logger.info(f"Ride match {pk} acceptance complete")
        return Response({'status': 'success', 'message': 'Ride match accepted successfully'})

    @action(detail=True, methods=['post'])
    def reject_match(self, request, pk=None):
        try:
            ride_request = self.get_object()
            
            if ride_request.status != 'PENDING':
                raise ValidationError("This ride request is not in a pending state")
            
            if ride_request.rider != request.user:
                raise PermissionDenied("You can only reject your own ride requests")
            
            # Use ride_request.ride instead of matched_ride
            matched_ride = ride_request.ride
            
            # Update ride request status
            ride_request.status = 'REJECTED'
            ride_request.save()
            
            # Create notifications
            Notification.objects.create(
                recipient=matched_ride.driver,
                sender=ride_request.rider,
                message=f"{ride_request.rider.first_name} {ride_request.rider.last_name} has rejected your ride offer",
                ride=matched_ride,
                ride_request=ride_request,
                notification_type='RIDE_REJECTED'
            )
            
            return Response({'status': 'rejected'})
            
        except Exception as e:
            logger.error(f"Error rejecting match: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def accepted(self, request):
        """Get all accepted ride requests for a user (both as rider and driver)"""
        user = request.user
        
        # Get rides where user is the rider
        rider_requests = RideRequest.objects.filter(
            rider=user,
            status='ACCEPTED'
        ).select_related('ride', 'ride__driver')
        
        # Get rides where user is the driver
        driver_requests = RideRequest.objects.filter(
            ride__driver=user,
            status='ACCEPTED'
        ).select_related('ride', 'rider')
        
        # Combine the results
        all_requests = list(rider_requests) + list(driver_requests)
        
        serializer = RideRequestSerializer(all_requests, many=True, context={'request': request})
        return Response(serializer.data)
        
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an accepted ride request"""
        ride_request = self.get_object()
        
        # Only the rider or driver can cancel a ride
        if request.user != ride_request.rider and request.user != ride_request.ride.driver:
            raise PermissionDenied("Only the rider or driver can cancel this ride")
        
        # Only cancel if it's in ACCEPTED status
        if ride_request.status != 'ACCEPTED':
            raise ValidationError("Only accepted rides can be cancelled")
        
        # Update status to CANCELLED
        ride_request.status = 'CANCELLED'
        ride_request.save()
        
        # Return available seats to the ride
        ride = ride_request.ride
        ride.available_seats += ride_request.seats_needed
        ride.save()
        
        # Create notifications
        if request.user == ride_request.rider:
            # Rider cancelled
            Notification.objects.create(
                recipient=ride_request.ride.driver,
                sender=ride_request.rider,
                message=f"{ride_request.rider.first_name} {ride_request.rider.last_name} has cancelled their ride",
                ride=ride_request.ride,
                ride_request=ride_request,
                notification_type='RIDE_CANCELLED'
            )
        else:
            # Driver cancelled
            Notification.objects.create(
                recipient=ride_request.rider,
                sender=ride_request.ride.driver,
                message=f"Your ride with {ride_request.ride.driver.first_name} {ride_request.ride.driver.last_name} has been cancelled by the driver",
                ride=ride_request.ride,
                ride_request=ride_request,
                notification_type='RIDE_CANCELLED'
            )
        
        return Response({'status': 'ride cancelled'})
        
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        ride_request = self.get_object()
        if request.user != ride_request.ride.driver:
            raise PermissionDenied("Only the driver can mark a ride as completed")

        ride_request.status = 'COMPLETED'
        ride_request.save()

        # Create notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            message=f"Your ride to {ride_request.ride.end_location} has been completed",
            ride=ride_request.ride,
            ride_request=ride_request,
            notification_type='RIDE_COMPLETED'
        )
        
        return Response({'status': 'ride completed'})
        
    @action(detail=False, methods=['post'])
    def force_match_check(self, request):
        """
        Debug endpoint to force the ride matching process for all rides and pending requests.
        This can help diagnose why ride matches aren't being created.
        """
        if not request.user.is_authenticated:
            return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
            
        try:
            logger.info(f"Force match check initiated by {request.user.username}")
            
            # Get all scheduled rides
            rides = Ride.objects.filter(status='SCHEDULED')
            logger.info(f"Found {rides.count()} scheduled rides")
            
            # Get all pending ride requests
            pending_requests = PendingRideRequest.objects.filter(status='PENDING')
            logger.info(f"Found {pending_requests.count()} pending ride requests")
            
            match_results = []
            
            # For each ride, check all pending requests
            for ride in rides:
                logger.info(f"Checking ride {ride.id} from {ride.start_location} to {ride.end_location}")
                
                # Get ride details
                driver_start = (ride.start_longitude, ride.start_latitude)
                driver_end = (ride.end_longitude, ride.end_latitude)
                
                for pending_request in pending_requests:
                    logger.info(f"Testing against pending request {pending_request.id}")
                    
                    # Skip if ride doesn't have enough seats
                    if ride.available_seats < pending_request.seats_needed:
                        logger.info(f"Not enough seats: {ride.available_seats} < {pending_request.seats_needed}")
                        match_results.append({
                            'ride_id': ride.id,
                            'request_id': pending_request.id,
                            'result': 'Insufficient seats',
                            'matched': False
                        })
                        continue
                    
                    # Skip if departure times are too far apart
                    time_diff = abs((ride.departure_time - pending_request.departure_time).total_seconds() / 60)
                    if time_diff > 30:
                        logger.info(f"Time difference too large: {time_diff:.1f} minutes")
                        match_results.append({
                            'ride_id': ride.id,
                            'request_id': pending_request.id,
                            'result': f'Time difference too large: {time_diff:.1f} min',
                            'matched': False
                        })
                        continue
                    
                    # Get rider pickup and dropoff coordinates
                    rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                    rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                    
                    # Validate coordinates
                    if (None in driver_start or None in driver_end or 
                        None in rider_pickup or None in rider_dropoff):
                        logger.error(f"Invalid coordinates")
                        match_results.append({
                            'ride_id': ride.id,
                            'request_id': pending_request.id,
                            'result': 'Invalid coordinates',
                            'matched': False
                        })
                        continue
                    
                    # Calculate route overlap
                    try:
                        overlap_percentage, nearest_point = calculate_route_overlap(
                            driver_start, driver_end, rider_pickup, rider_dropoff
                        )
                        
                        logger.info(f"Route overlap: {overlap_percentage:.2f}%")
                        
                        # Calculate matching score
                        matching_score = calculate_matching_score(
                            overlap_percentage,
                            time_diff,
                            ride.available_seats,
                            pending_request.seats_needed
                        )
                        logger.info(f"Matching score: {matching_score:.2f}")
                        
                        # Use consistent threshold with find_suitable_rides (35%)
                        MIN_OVERLAP_THRESHOLD = 35.0
                        
                        # If there's a good match, add to matching riders
                        if overlap_percentage >= MIN_OVERLAP_THRESHOLD:
                            logger.info(f"Found a match!")
                            
                            match_results.append({
                                'ride_id': ride.id,
                                'request_id': pending_request.id,
                                'result': f'Match found! Overlap: {overlap_percentage:.2f}%, Score: {matching_score:.2f}',
                                'matched': True,
                                'overlap': overlap_percentage,
                                'score': matching_score
                            })
                            
                            # Actually create a match if requested
                            if request.data.get('create_matches', False):
                                try:
                                    # Create a ride request
                                    ride_request = RideRequest.objects.create(
                                        rider=pending_request.rider,
                                        ride=ride,
                                        pickup_location=pending_request.pickup_location,
                                        dropoff_location=pending_request.dropoff_location,
                                        pickup_latitude=pending_request.pickup_latitude,
                                        pickup_longitude=pending_request.pickup_longitude,
                                        dropoff_latitude=pending_request.dropoff_latitude,
                                        dropoff_longitude=pending_request.dropoff_longitude,
                                        departure_time=ride.departure_time,
                                        seats_needed=pending_request.seats_needed,
                                        status='PENDING',
                                        nearest_dropoff_point=nearest_point
                                    )
                                    
                                    logger.info(f"Created ride request {ride_request.id}")
                                    
                                    # Create notification for the rider
                                    Notification.objects.create(
                                        recipient=pending_request.rider,
                                        sender=ride.driver,
                                        message=f"Found a matching ride for your pending request! Driver: {ride.driver.first_name} {ride.driver.last_name}",
                                        ride=ride,
                                        ride_request=ride_request,
                                        notification_type='RIDE_MATCH'
                                    )
                                    
                                    # Update pending request status
                                    pending_request.status = 'MATCHED'
                                    pending_request.save()
                                    
                                    logger.info(f"Updated pending request {pending_request.id} status to MATCHED")
                                except Exception as e:
                                    logger.error(f"Error creating match: {str(e)}")
                        else:
                            match_results.append({
                                'ride_id': ride.id,
                                'request_id': pending_request.id,
                                'result': f'Overlap too low: {overlap_percentage:.2f}% < {MIN_OVERLAP_THRESHOLD}%',
                                'matched': False,
                                'overlap': overlap_percentage,
                                'score': matching_score
                            })
                    except Exception as e:
                        logger.error(f"Error calculating overlap: {str(e)}")
                        match_results.append({
                            'ride_id': ride.id,
                            'request_id': pending_request.id,
                            'result': f'Error: {str(e)}',
                            'matched': False
                        })
            
            # Summarize results
            matches_found = sum(1 for r in match_results if r['matched'])
            logger.info(f"Matching process complete. Found {matches_found} potential matches out of {len(match_results)} combinations tested.")
            
            return Response({
                'status': 'success', 
                'rides_checked': rides.count(),
                'requests_checked': pending_requests.count(),
                'potential_matches': matches_found,
                'results': match_results
            })
            
        except Exception as e:
            logger.error(f"Error in force_match_check: {str(e)}")
            logger.exception("Exception details:")
            return Response({
                'status': 'error',
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Log authentication details
        logger.info(f"Notification request from user: {self.request.user.username}")
        logger.info(f"User authenticated: {self.request.user.is_authenticated}")
        logger.info(f"Request headers: {dict(self.request.headers)}")
        logger.info(f"Auth header: {self.request.headers.get('Authorization', 'Not found')}")
        
        # Log notification retrieval for debugging
        notifications = Notification.objects.filter(recipient=self.request.user).order_by('-created_at')
        logger.info(f"Retrieved {notifications.count()} notifications for user {self.request.user.username}")
        
        # Log RIDE_MATCH notifications for debugging
        ride_match_count = notifications.filter(notification_type='RIDE_MATCH').count()
        logger.info(f"User {self.request.user.username} has {ride_match_count} RIDE_MATCH notifications")
        
        if ride_match_count > 0:
            sample = notifications.filter(notification_type='RIDE_MATCH').first()
            logger.info(f"Sample RIDE_MATCH notification: id={sample.id}, ride_request={sample.ride_request_id if sample.ride_request else 'None'}")
        
        return notifications

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({'status': 'notification marked as read'})

    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({'status': 'all notifications marked as read'})
