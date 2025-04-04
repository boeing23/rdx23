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
import pytz

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

def get_route_driving_distance(start_coords, end_coords):
    """Get the actual driving distance between two points using OpenRouteService API"""
    try:
        url = f"{OPENROUTE_BASE_URL}/directions/driving-car"
        headers = {
            'Accept': 'application/json',
            'Authorization': ORS_API_KEY,
            'Content-Type': 'application/json; charset=utf-8'
        }
        
        body = {
            "coordinates": [[start_coords[0], start_coords[1]], [end_coords[0], end_coords[1]]],
            "format": "json"
        }
        
        response = requests.post(url, json=body, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            # Convert distance from meters to kilometers
            if 'routes' in data and len(data['routes']) > 0:
                return data['routes'][0]['summary']['distance'] / 1000.0
            
        # If API call fails, fall back to great_circle
        logger.warning("Failed to get driving distance from API, falling back to straight-line distance")
        return great_circle(
            (start_coords[1], start_coords[0]),  # Convert (lng, lat) to (lat, lng)
            (end_coords[1], end_coords[0])
        ).kilometers
            
    except Exception as e:
        logger.error(f"Error calculating driving distance: {str(e)}")
        # Fall back to great_circle
        return great_circle(
            (start_coords[1], start_coords[0]),  # Convert (lng, lat) to (lat, lng)
            (end_coords[1], end_coords[0])
        ).kilometers

def find_optimal_pickup(driver_route, rider_pickup):
    """
    Find the optimal pickup point for a rider along a driver's route.
    Enhanced to use driving distance where possible.
    
    Parameters:
    driver_route: List of (lat, lng) coordinates representing the driver's route
    rider_pickup: (lat, lng) coordinate of the rider's requested pickup location
    
    Returns:
    Tuple of (optimal_pickup_point, distance_to_pickup, pickup_index)
    """
    # Find the segment on driver's route closest to pickup point
    min_pickup_dist = float('inf')
    pickup_index = 0
    optimal_pickup = None
    
    # Find the closest point on each segment
    for i in range(len(driver_route) - 1):
        p1 = driver_route[i]
        p2 = driver_route[i + 1]
        closest = closest_point_on_segment(p1, p2, rider_pickup)
        
        # Try to use actual driving distance if possible
        try:
            # Convert from (lat, lng) to (lng, lat) for the API
            closest_lng_lat = (closest[1], closest[0])
            rider_pickup_lng_lat = (rider_pickup[1], rider_pickup[0])
            
            dist = get_route_driving_distance(closest_lng_lat, rider_pickup_lng_lat)
        except Exception as e:
            logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
            dist = great_circle(closest, rider_pickup).kilometers
            
        if dist < min_pickup_dist:
            min_pickup_dist = dist
            pickup_index = i
            optimal_pickup = closest
    
    if not optimal_pickup:
        # Fallback to the point on route closest to pickup
        for i, point in enumerate(driver_route):
            try:
                # Convert from (lat, lng) to (lng, lat) for the API
                point_lng_lat = (point[1], point[0])
                rider_pickup_lng_lat = (rider_pickup[1], rider_pickup[0])
                
                dist = get_route_driving_distance(point_lng_lat, rider_pickup_lng_lat)
            except Exception as e:
                logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
                dist = great_circle(point, rider_pickup).kilometers
                
            if dist < min_pickup_dist:
                min_pickup_dist = dist
                pickup_index = i
                optimal_pickup = point
    
    return optimal_pickup, min_pickup_dist, pickup_index

def find_optimal_dropoff(driver_route, rider_pickup, rider_dropoff):
    """
    Find the optimal drop-off point for a rider along a driver's route.
    Enhanced to use driving distance where possible.
    
    Parameters:
    driver_route: List of (lat, lng) coordinates representing the driver's route
    rider_pickup: (lat, lng) coordinate of the rider's pickup location
    rider_dropoff: (lat, lng) coordinate of the rider's destination
    
    Returns:
    Tuple of (optimal_dropoff_point, distance_to_destination, pickup_index)
    """
    # Find the index on driver's route closest to pickup point
    min_pickup_dist = float('inf')
    pickup_index = 0
    
    for i, point in enumerate(driver_route):
        try:
            # Convert from (lat, lng) to (lng, lat) for the API
            point_lng_lat = (point[1], point[0])
            rider_pickup_lng_lat = (rider_pickup[1], rider_pickup[0])
            
            dist = get_route_driving_distance(point_lng_lat, rider_pickup_lng_lat)
        except Exception as e:
            logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
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
        
        try:
            # Convert from (lat, lng) to (lng, lat) for the API
            closest_lng_lat = (closest[1], closest[0])
            rider_dropoff_lng_lat = (rider_dropoff[1], rider_dropoff[0])
            
            dist = get_route_driving_distance(closest_lng_lat, rider_dropoff_lng_lat)
        except Exception as e:
            logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
            dist = great_circle(closest, rider_dropoff).kilometers
            
        if dist < min_dist:
            min_dist = dist
            optimal_point = closest
    
    if not optimal_point:
        # Fallback to final point if no optimal point found
        optimal_point = driver_route[-1]
        
        try:
            # Convert from (lat, lng) to (lng, lat) for the API
            point_lng_lat = (optimal_point[1], optimal_point[0])
            rider_dropoff_lng_lat = (rider_dropoff[1], rider_dropoff[0])
            
            min_dist = get_route_driving_distance(point_lng_lat, rider_dropoff_lng_lat)
        except Exception as e:
            logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
            min_dist = great_circle(optimal_point, rider_dropoff).kilometers
    
    return optimal_point, min_dist, pickup_index

def calculate_direction_similarity(vec1, vec2):
    """Calculate the direction similarity between two vectors using cosine similarity"""
    try:
        # Calculate magnitudes
        mag1 = math.sqrt(vec1[0]**2 + vec1[1]**2)
        mag2 = math.sqrt(vec2[0]**2 + vec2[1]**2)
        
        if mag1 > 0 and mag2 > 0:
            # Calculate dot product
            dot_product = vec1[0] * vec2[0] + vec1[1] * vec2[1]
            
            # Calculate cosine similarity
            cosine_sim = dot_product / (mag1 * mag2)
            
            # Ensure it's in valid range (-1 to 1)
            cosine_sim = max(-1, min(1, cosine_sim))
            
            return cosine_sim
        return 0
    except Exception as e:
        logger.error(f"Error calculating direction similarity: {str(e)}")
        return 0

def calculate_route_overlap(driver_start, driver_end, rider_pickup, rider_dropoff):
    """
    Calculate the percentage of route overlap between driver and rider routes.
    
    Parameters:
    driver_start (tuple): Driver's starting point coordinates (longitude, latitude)
    driver_end (tuple): Driver's destination coordinates (longitude, latitude)
    rider_pickup (tuple): Rider's pickup point coordinates (longitude, latitude)
    rider_dropoff (tuple): Rider's dropoff point coordinates (longitude, latitude)
    
    Returns:
    tuple: (overlap_percentage, nearest_dropoff_point, optimal_pickup_point)
    """
    try:
        logger.info(f"Calculating route overlap with inputs:")
        logger.info(f"  Driver start: {driver_start}, Driver end: {driver_end}")
        logger.info(f"  Rider pickup: {rider_pickup}, Rider dropoff: {rider_dropoff}")
        
        # Validate input coordinates
        if None in [driver_start, driver_end, rider_pickup, rider_dropoff]:
            logger.error("Missing coordinate values in calculate_route_overlap")
            return 0.0, None, None
        
        # Ensure coordinates are in the correct format (lng, lat)
        # Check if any coordinates appear to be in reversed order (lat, lng)
        def ensure_lng_lat_format(coords):
            lng, lat = coords
            # Try to convert to float if not already
            try:
                lng = float(lng)
                lat = float(lat)
            except (ValueError, TypeError):
                logger.error(f"Invalid coordinate values: {coords}")
                return None
                
            # Basic range check to detect if values are flipped
            # Longitude typically ranges from -180 to 180
            # Latitude typically ranges from -90 to 90
            if abs(lng) <= 90 and abs(lat) > 90:
                # Values appear to be flipped, correct them
                logger.warning(f"Coordinates appear to be in (lat, lng) format, correcting: {coords}")
                return (lat, lng)
            return (lng, lat)
        
        # Validate and potentially correct all coordinates
        driver_start = ensure_lng_lat_format(driver_start)
        driver_end = ensure_lng_lat_format(driver_end)
        rider_pickup = ensure_lng_lat_format(rider_pickup)
        rider_dropoff = ensure_lng_lat_format(rider_dropoff)
        
        if None in [driver_start, driver_end, rider_pickup, rider_dropoff]:
            logger.error("Failed to validate coordinates")
            return 0.0, None, None
        
        # Generate routes for both driver and rider
        driver_route = generate_route(driver_start, driver_end)
        rider_route = generate_route(rider_pickup, rider_dropoff)
        
        logger.info(f"Generated driver route with {len(driver_route)} points")
        logger.info(f"Generated rider route with {len(rider_route)} points")
        
        if not driver_route or not rider_route:
            logger.error("Failed to generate routes")
            return 0.0, None, None
        
        # Find the nearest point on the driver's route to the rider's dropoff
        min_distance = float('inf')
        nearest_point = None
        nearest_point_index = 0
        
        for i, point in enumerate(driver_route):
            distance = calculate_distance(point, rider_dropoff)
            if distance < min_distance:
                min_distance = distance
                nearest_point = point
                nearest_point_index = i
        
        logger.info(f"Nearest dropoff point found at driver route index {nearest_point_index} with distance {min_distance:.2f}m")
        
        # Find an optimal pickup point along the driver's route that is closest to the rider's pickup
        pickup_min_distance = float('inf')
        optimal_pickup_point = None
        optimal_pickup_index = 0
        
        # Only consider points before the dropoff point in the driver's route
        for i, point in enumerate(driver_route[:nearest_point_index + 1]):
            distance = calculate_distance(point, rider_pickup)
            if distance < pickup_min_distance:
                pickup_min_distance = distance
                optimal_pickup_point = point
                optimal_pickup_index = i
        
        logger.info(f"Optimal pickup point found at driver route index {optimal_pickup_index} with distance {pickup_min_distance:.2f}m")
        
        # More advanced overlap calculation
        overlap_count = 0
        total_points = len(driver_route)
        
        # Consider directional compatibility by checking segments between consecutive points
        driver_direction_vectors = []
        rider_direction_vectors = []
        
        # Calculate direction vectors for driver route
        for i in range(len(driver_route) - 1):
            p1 = driver_route[i]
            p2 = driver_route[i + 1]
            vector = (p2[0] - p1[0], p2[1] - p1[1])  # (delta_lng, delta_lat)
            mag = (vector[0]**2 + vector[1]**2)**0.5
            if mag > 0:
                normalized = (vector[0]/mag, vector[1]/mag)
                driver_direction_vectors.append(normalized)
        
        # Calculate direction vectors for rider route
        for i in range(len(rider_route) - 1):
            p1 = rider_route[i]
            p2 = rider_route[i + 1]
            vector = (p2[0] - p1[0], p2[1] - p1[1])
            mag = (vector[0]**2 + vector[1]**2)**0.5
            if mag > 0:
                normalized = (vector[0]/mag, vector[1]/mag)
                rider_direction_vectors.append(normalized)
        
        # Calculate direction similarity using a sliding window approach
        direction_similarities = []
        window_size = min(10, len(driver_direction_vectors), len(rider_direction_vectors))
        
        if window_size > 0:
            for i in range(len(driver_direction_vectors) - window_size + 1):
                for j in range(len(rider_direction_vectors) - window_size + 1):
                    similarity_sum = 0
                    for k in range(window_size):
                        # Dot product of normalized vectors = cosine similarity
                        d_vec = driver_direction_vectors[i + k]
                        r_vec = rider_direction_vectors[j + k]
                        dot_product = d_vec[0] * r_vec[0] + d_vec[1] * r_vec[1]
                        similarity_sum += max(0, dot_product)  # Only count positive similarity
                    
                    avg_similarity = similarity_sum / window_size
                    direction_similarities.append(avg_similarity)
        
        max_direction_similarity = max(direction_similarities) if direction_similarities else 0
        logger.info(f"Maximum direction similarity: {max_direction_similarity:.4f}")
        
        # Calculate spatial proximity
        proximity_counts = 0
        PROXIMITY_THRESHOLD = 100  # meters
        
        # Pair points from both routes to find those that are within the threshold distance
        for d_point in driver_route:
            for r_point in rider_route:
                if calculate_distance(d_point, r_point) <= PROXIMITY_THRESHOLD:
                    proximity_counts += 1
                    break  # Count each driver point only once if it's close to any rider point
        
        proximity_percentage = (proximity_counts / len(driver_route)) * 100 if driver_route else 0
        logger.info(f"Proximity percentage: {proximity_percentage:.2f}%")
        
        # Consider the paths between optimal pickup and dropoff
        if optimal_pickup_index is not None and nearest_point_index is not None:
            # Path segment between pickup and dropoff on driver's route
            driver_segment = driver_route[optimal_pickup_index:nearest_point_index+1]
            
            # For rider, consider their entire route as we want to find overlaps
            rider_segment = rider_route
            
            # Count points in the driver segment that are close to any point in the rider segment
            segment_overlap_count = 0
            for d_point in driver_segment:
                for r_point in rider_segment:
                    if calculate_distance(d_point, r_point) <= PROXIMITY_THRESHOLD:
                        segment_overlap_count += 1
                        break
            
            segment_overlap_percentage = (segment_overlap_count / len(driver_segment)) * 100 if driver_segment else 0
            logger.info(f"Segment overlap percentage: {segment_overlap_percentage:.2f}%")
        else:
            segment_overlap_percentage = 0
        
        # Combine all factors to determine overall overlap
        # Weight the different factors based on their importance
        direction_weight = 0.3
        proximity_weight = 0.3
        segment_weight = 0.4
        
        # Calculate weighted overlap percentage
        weighted_overlap = (
            direction_weight * max_direction_similarity * 100 +
            proximity_weight * proximity_percentage +
            segment_weight * segment_overlap_percentage
        )
        
        logger.info(f"Weighted overlap: {weighted_overlap:.2f}%")
        
        # Apply additional bonuses for special cases
        # If rider and driver share the same end point
        if calculate_distance(driver_end, rider_dropoff) <= 200:  # Within 200m
            logger.info("Bonus: Rider and driver share same destination")
            weighted_overlap += 10  # 10% bonus
        
        # If the route is generally aligned (same direction)
        if max_direction_similarity > 0.8:  # High directional similarity
            logger.info("Bonus: Routes have high directional similarity")
            weighted_overlap += 5  # 5% bonus
        
        # Ensure the overlap is within reasonable bounds
        overlap_percentage = max(0, min(100, weighted_overlap))
        logger.info(f"Final overlap percentage: {overlap_percentage:.2f}%")
        
        return overlap_percentage, nearest_point, optimal_pickup_point
        
    except Exception as e:
        logger.error(f"Error in calculate_route_overlap: {str(e)}")
        logger.exception("Full exception details:")
        return 0.0, None, None

def generate_route(start, end, num_points=20):
    """
    Generate a route between start and end points using the OpenRouteService API.
    Enhanced with better error handling and retries to avoid straight line fallbacks.
    
    Parameters:
    start: (lng, lat) tuple
    end: (lng, lat) tuple
    num_points: Number of points to generate along the route
    
    Returns:
    route: List of (lng, lat) coordinates
    """
    max_retries = 3
    retry_delay = 1  # seconds
    
    try:
        # Validate coordinates
        if start[0] is None or start[1] is None or end[0] is None or end[1] is None:
            logger.error(f"Invalid coordinates: start={start}, end={end}")
            raise ValueError("Invalid coordinates")
            
        # Check if this is the test case for Pheasant Run to Lane Stadium or Janie Lane to Lane Stadium
        pheasant_run_coords = [-80.4189968, 37.2489617]
        lane_stadium_coords = [-80.41800385907507, 37.21989015]
        janie_lane_coords = [-80.41594021829319, 37.2510400809438]
        
        # More lenient check using distance for test case detection
        # Use a small radius (150m) to detect these locations
        is_near_pheasant_run = False
        is_near_lane_stadium = False
        is_near_janie_lane = False
        
        try:
            # Check if start is near Pheasant Run
            pheasant_run_distance = calculate_distance(start, pheasant_run_coords)
            is_near_pheasant_run = pheasant_run_distance < 150  # Within 150 meters
            
            # Check if start is near Janie Lane
            janie_lane_distance = calculate_distance(start, janie_lane_coords)
            is_near_janie_lane = janie_lane_distance < 150  # Within 150 meters
            
            # Check if end is near Lane Stadium
            lane_stadium_distance = calculate_distance(end, lane_stadium_coords)
            is_near_lane_stadium = lane_stadium_distance < 150  # Within 150 meters
            
            logger.info(f"Location check - Near Pheasant Run: {is_near_pheasant_run} ({pheasant_run_distance:.2f}m)")
            logger.info(f"Location check - Near Janie Lane: {is_near_janie_lane} ({janie_lane_distance:.2f}m)")
            logger.info(f"Location check - Near Lane Stadium: {is_near_lane_stadium} ({lane_stadium_distance:.2f}m)")
            
            is_driver_test = is_near_pheasant_run and is_near_lane_stadium
            is_rider_test = is_near_janie_lane and is_near_lane_stadium
        except Exception as e:
            logger.error(f"Error checking test locations: {str(e)}")
            # Fall back to exact coordinate check
            is_driver_test = (
                abs(float(start[0]) - pheasant_run_coords[0]) < 0.001 and
                abs(float(start[1]) - pheasant_run_coords[1]) < 0.001 and
                abs(float(end[0]) - lane_stadium_coords[0]) < 0.001 and
                abs(float(end[1]) - lane_stadium_coords[1]) < 0.001
            )
            
            is_rider_test = (
                abs(float(start[0]) - janie_lane_coords[0]) < 0.001 and
                abs(float(start[1]) - janie_lane_coords[1]) < 0.001 and
                abs(float(end[0]) - lane_stadium_coords[0]) < 0.001 and
                abs(float(end[1]) - lane_stadium_coords[1]) < 0.001
            )
        
        if is_driver_test:
            logger.info("Test route for Pheasant Run to Lane Stadium requested, but test data removed for production")
            # Test data has been removed for production deployment
            logger.info("Will proceed with standard route generation")
        
        if is_rider_test:
            logger.info("Test route for Janie Lane to Lane Stadium requested, but test data removed for production")
            # Test data has been removed for production deployment
            logger.info("Will proceed with standard route generation")
            
        # Validate coordinate format (lng should be -180 to 180, lat should be -90 to 90)
        for coords in [start, end]:
            lng, lat = coords
            if lng > 90 or lng < -90 or lat > 180 or lat < -180:
                logger.warning(f"Coordinates appear to be in (lat, lng) format instead of (lng, lat): {coords}")

        # Convert to float if strings
        try:
            start = (float(start[0]), float(start[1]))
            end = (float(end[0]), float(end[1]))
        except (ValueError, TypeError) as e:
            logger.error(f"Error converting coordinates to float: {str(e)}")
            raise ValueError(f"Invalid coordinate format: {start}, {end}")
        
        # Validate coordinate format (lng should be -180 to 180, lat should be -90 to 90)
        # If coordinates look reversed, correct them
        for name, coords in [("Start", start), ("End", end)]:
            lng, lat = coords
            if abs(lng) > 90 and abs(lat) <= 90:
                logger.warning(f"{name} coordinates appear to be in (lat, lng) format instead of (lng, lat): {coords}")
                logger.warning(f"Auto-correcting coordinate format")
                if name == "Start":
                    start = (lat, lng)  # Swap to correct (lng, lat) format
                else:
                    end = (lat, lng)
        
        # Check for bad coordinates
        if not (-180 <= start[0] <= 180 and -90 <= start[1] <= 90 and -180 <= end[0] <= 180 and -90 <= end[1] <= 90):
            logger.warning(f"Coordinates are outside normal ranges: start={start}, end={end}")
            # Fix automatically if clearly wrong
            if abs(start[0]) > 180 or abs(start[1]) > 90 or abs(end[0]) > 180 or abs(end[1]) > 90:
                logger.warning("Coordinates are far outside normal ranges, attempting auto-correction")
                if abs(start[0]) > 180 or abs(start[1]) > 90:
                    if abs(start[0]) > 90 and abs(start[1]) <= 90:
                        start = (start[1], start[0])  # Likely swapped lat/lng
                if abs(end[0]) > 180 or abs(end[1]) > 90:
                    if abs(end[0]) > 90 and abs(end[1]) <= 90:
                        end = (end[1], end[0])  # Likely swapped lat/lng
                logger.info(f"Auto-corrected coordinates: start={start}, end={end}")
        
        logger.info(f"Using coordinates for route: start={start}, end={end}")
        
        # Try the directions API with retries
        for attempt in range(max_retries):
            try:
                logger.info(f"Calling OpenRouteService directions API (attempt {attempt+1}/{max_retries}) for route from {start} to {end}")
                
                directions_url = f"{OPENROUTE_BASE_URL}/directions/driving-car"
                headers = {
                    'Accept': 'application/json, application/geo+json',
                    'Authorization': ORS_API_KEY,
                    'Content-Type': 'application/json; charset=utf-8'
                }
                
                # Make sure coordinates are in correct format [longitude,latitude]
                body = {
                    "coordinates": [[start[0], start[1]], [end[0], end[1]]],
                    "format": "geojson"
                }
                
                logger.debug(f"Request body: {body}")
                
                response = requests.post(directions_url, json=body, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    logger.debug(f"Response status: {response.status_code}, data keys: {list(data.keys())}")
                    # Extract coordinates from the route
                    if 'features' in data and len(data['features']) > 0:
                        feature = data['features'][0]
                        if 'geometry' in feature and 'coordinates' in feature['geometry']:
                            coordinates = feature['geometry']['coordinates']
                            logger.info(f"Successfully retrieved route with {len(coordinates)} points")
                            
                            # Validate coordinates
                            for i, coord in enumerate(coordinates):
                                if len(coord) < 2 or not all(isinstance(c, (int, float)) for c in coord[:2]):
                                    logger.warning(f"Invalid coordinate at index {i}: {coord}")
                                    coordinates[i] = [0, 0]  # Replace with dummy value
                            
                            # If too many points, sample them down to num_points
                            if len(coordinates) > num_points:
                                step = max(1, len(coordinates) // num_points)
                                sampled_coordinates = [coordinates[i] for i in range(0, len(coordinates), step)]
                                # Always include the last point
                                if coordinates[-1] not in sampled_coordinates:
                                    sampled_coordinates.append(coordinates[-1])
                                
                                logger.info(f"Sampled route to {len(sampled_coordinates)} points")
                                return sampled_coordinates
                            else:
                                logger.info(f"Using original route with {len(coordinates)} points")
                                return coordinates
                        else:
                            logger.warning("No geometry/coordinates found in route response")
                    else:
                        logger.warning("No features found in directions API response")
                        logger.debug(f"Response data: {data}")
                elif response.status_code == 404:
                    logger.warning(f"Route not found (404) - may be invalid locations")
                    break  # No need to retry
                elif response.status_code == 429:  # Rate limit hit
                    logger.warning(f"API rate limit hit (attempt {attempt+1}). Retrying after delay...")
                    import time
                    time.sleep(retry_delay * (attempt + 1))  # Incremental backoff
                    continue
                else:
                    logger.warning(f"OpenRouteService directions API failed with status {response.status_code} (attempt {attempt+1})")
                    logger.debug(f"API response: {response.text[:500]}...")
                    
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(retry_delay)
                        continue
            
            except requests.exceptions.Timeout:
                logger.warning(f"API request timed out (attempt {attempt+1})")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(retry_delay)
                    continue
            except Exception as e:
                logger.error(f"Error using OpenRouteService directions API (attempt {attempt+1}): {str(e)}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(retry_delay)
                    continue
        
        # If failed to get route data, we'll use a fallback method
        # This is only needed in environments where the OpenRouteService API is not available
        logger.warning("OpenRouteService APIs failed or not accessible, using straight line fallback method")
        logger.warning("IMPORTANT: Using straight line approximation which may not reflect actual roads")
                
    except Exception as e:
        logger.error(f"Error in route generation: {str(e)}")
        logger.exception("Full exception details:")
    
    # Fallback to enhanced straight line interpolation method
    logger.info("Using fallback route generation method (straight line with enhancements)")
    
    # Base route is a straight line
    route = []
    try:
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
    except Exception as e:
        logger.error(f"Error in fallback route generation: {str(e)}")
        # Last resort fallback - just return start and end points
        route = [start, end]
    
    logger.info(f"Generated fallback route with {len(route)} points")
    return route

    def get_address_from_coordinates(self, longitude, latitude):
        """Get address from coordinates using reverse geocoding"""
        try:
            response = requests.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    'format': 'json',
                    'lat': latitude,
                    'lon': longitude
                },
                headers={'User-Agent': 'ChalBeyy/1.0'}
            )
            if response.status_code == 200:
                data = response.json()
                return data.get('display_name', 'Unknown location')
            return 'Unknown location'
        except Exception as e:
            logger.error(f"Error reverse geocoding: {str(e)}")
            return 'Unknown location'

    def calculate_matching_score(self, overlap_percentage, time_diff, available_seats, seats_needed):
        """
        Calculate a matching score between driver and rider based on route overlap, time difference, and seat availability.
        
        Parameters:
        overlap_percentage (float): Percentage of route overlap between driver and rider
        time_diff (int): Absolute time difference in minutes between driver and rider departure times
        available_seats (int): Number of available seats in the driver's vehicle
        seats_needed (int): Number of seats requested by the rider
        
        Returns:
        float: A matching score between 0 and 100, higher is better
        """
        try:
            logger.info(f"Calculating matching score with: overlap={overlap_percentage:.2f}%, time_diff={time_diff} mins, " +
                       f"seats_available={available_seats}, seats_needed={seats_needed}")
            
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
                logger.info("Bonus: Near-perfect time match (+5 points)")
                
            # Very high route overlap (over 70%)
            if overlap_percentage >= 70:
                final_score += 5
                logger.info("Bonus: Excellent route overlap (+5 points)")
                
            # Cap the final score at 100
            final_score = min(100, final_score)
            
            logger.info(f"Scoring components: Overlap={overlap_score:.2f}, Time={time_score:.2f}, Seat={seat_score:.2f}")
            logger.info(f"Final matching score: {final_score:.2f}")
            
            return final_score
            
        except Exception as e:
            logger.error(f"Error calculating matching score: {str(e)}")
            logger.exception("Full exception details:")
            return 0.0

    def find_suitable_rides(self, rides, ride_request_data):
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
            MIN_OVERLAP_THRESHOLD = 35.0  # Reduced from 50.0 to catch more potential matches
            MIN_MATCHING_SCORE = 60.0     # Adjusted as well to balance against lower overlap threshold
            
            suitable_rides = []
            
            for ride in rides:
                # Skip rides with insufficient available seats
                if ride.available_seats < seats_needed:
                    logger.debug(f"Skipping ride {ride.id}: insufficient seats ({ride.available_seats} available, {seats_needed} needed)")
                    continue
                
                # Get driver's coordinates
                driver_start = ride.start_location_coordinates
                driver_end = ride.end_location_coordinates
                
                # Validate driver coordinates
                if not driver_start or not driver_end:
                    logger.warning(f"Skipping ride {ride.id}: missing coordinates")
                    continue
                    
                # Calculate route overlap
                overlap_percentage, nearest_dropoff, optimal_pickup = self.calculate_route_overlap(
                    driver_start, driver_end, rider_pickup, rider_dropoff
                )
                
                # If overlap is below threshold, skip this ride
                if overlap_percentage < MIN_OVERLAP_THRESHOLD:
                    logger.debug(f"Skipping ride {ride.id}: low overlap ({overlap_percentage:.2f}%)")
                    continue
                    
                # Calculate time difference in minutes
                time_diff = abs((ride.departure_time - rider_departure_time).total_seconds() / 60)
                
                # Calculate matching score
                matching_score = self.calculate_matching_score(
                    overlap_percentage, time_diff, ride.available_seats, seats_needed
                )
                
                # If matching score is below threshold, skip this ride
                if matching_score < MIN_MATCHING_SCORE:
                    logger.debug(f"Skipping ride {ride.id}: low matching score ({matching_score:.2f})")
                    continue
                    
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

    def calculate_distance(self, point1, point2):
        """
        Calculate the distance between two points in meters.
        
        Parameters:
        point1 (tuple): First point coordinates (longitude, latitude)
        point2 (tuple): Second point coordinates (longitude, latitude)
        
        Returns:
        float: Distance in meters
        """
        # Convert to radians
        lon1, lat1 = map(math.radians, point1)
        lon2, lat2 = map(math.radians, point2)
        
        # Haversine formula
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        r = 6371000  # Radius of earth in meters
        return c * r

# Permission classes
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

# ViewSet classes
class RideViewSet(viewsets.ModelViewSet):
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Log the user info to help with debugging
        logger.info(f"Getting rides for user: {user.username}, user_type: {getattr(user, 'user_type', 'unknown')}")
        
        if hasattr(user, 'user_type') and user.user_type.upper() == 'DRIVER':
            # Drivers see their own rides
            logger.info(f"User is a DRIVER, returning their own rides")
            return Ride.objects.filter(driver=user)
        else:
            # Riders see all scheduled rides that have available seats
            logger.info(f"User is a RIDER, returning available rides")
            available_rides = Ride.objects.filter(
                status='SCHEDULED',
                available_seats__gt=0,
                departure_time__gt=timezone.now()
            ).exclude(driver=user)
            
            logger.info(f"Found {available_rides.count()} available rides")
            return available_rides

    def create(self, request, *args, **kwargs):
        """
        Create a new ride with the authenticated user as the driver.
        Only users with driver user_type can create rides.
        """
        # Verify the user is a driver
        if not hasattr(request.user, 'user_type') or request.user.user_type.upper() != 'DRIVER':
            logger.warning(f"Non-driver user {request.user.username} attempted to create a ride")
            return Response(
                {"error": "Only drivers can create rides", "detail": "You must have a driver account to create rides."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        logger.info(f"Driver {request.user.username} is creating a ride")
        
        # Add the driver to the request data
        data = request.data.copy()
        data['driver'] = request.user.id
        
        serializer = self.get_serializer(data=data)
        if serializer.is_valid():
            # Save with the authenticated user as the driver
            ride = serializer.save(driver=request.user)
            logger.info(f"Ride created successfully with ID: {ride.id}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        else:
            logger.error(f"Ride creation failed: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def debug_available_rides(self, request):
        """
        Debug endpoint to check what rides are available in the system
        and why they might not be showing up for the current user.
        """
        user = request.user
        
        # Get all rides in the system
        all_rides = Ride.objects.all()
        logger.info(f"Total rides in system: {all_rides.count()}")
        
        # Check scheduled rides
        scheduled_rides = Ride.objects.filter(status='SCHEDULED')
        logger.info(f"Scheduled rides: {scheduled_rides.count()}")
        
        # Check rides with available seats
        available_seat_rides = Ride.objects.filter(available_seats__gt=0)
        logger.info(f"Rides with available seats: {available_seat_rides.count()}")
        
        # Check future rides
        future_rides = Ride.objects.filter(departure_time__gt=timezone.now())
        logger.info(f"Future rides: {future_rides.count()}")
        
        # Check rides that would be shown to this user
        if hasattr(user, 'user_type') and user.user_type.upper() == 'DRIVER':
            user_rides = Ride.objects.filter(driver=user)
            filter_description = "Your own rides as a driver"
        else:
            user_rides = Ride.objects.filter(
                status='SCHEDULED',
                available_seats__gt=0,
                departure_time__gt=timezone.now()
            ).exclude(driver=user)
            filter_description = "Available rides for riders"
        
        # Format a minimal version of ride data for the response
        ride_data = []
        for ride in user_rides:
            ride_data.append({
                'id': ride.id,
                'start': ride.start_location,
                'end': ride.end_location,
                'seats': ride.available_seats,
                'departure': ride.departure_time.isoformat(),
                'status': ride.status,
                'driver_id': ride.driver_id
            })
        
        return Response({
            'total_rides': all_rides.count(),
            'scheduled_rides': scheduled_rides.count(),
            'rides_with_seats': available_seat_rides.count(),
            'future_rides': future_rides.count(),
            'user_type': getattr(user, 'user_type', 'unknown'),
            'filter_description': filter_description,
            'available_to_user': user_rides.count(),
            'ride_details': ride_data
        })

class RideRequestViewSet(viewsets.ModelViewSet):
    serializer_class = RideRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        user_type = getattr(user, 'user_type', '').lower()
        
        if user_type == 'driver':
            return RideRequest.objects.filter(ride__driver=user)
        elif user_type == 'rider':
            return RideRequest.objects.filter(rider=user)
        return RideRequest.objects.none()

    @action(detail=False, methods=['get'])
    def accepted(self, request):
        """
        Get all accepted ride requests for the current user (both as rider and driver)
        """
        try:
            logger.info(f"Fetching accepted rides for user: {request.user.username} (ID: {request.user.id})")
            
            user = request.user
            user_type = getattr(user, 'user_type', '').lower()
            
            # Use select_related to fetch related ride and driver data in a single query
            if user_type == 'driver':
                ride_requests = RideRequest.objects.filter(
                    ride__driver=user,
                    status__in=['ACCEPTED', 'COMPLETED']
                ).select_related(
                    'ride',
                    'rider'
                ).order_by('-departure_time')
            elif user_type == 'rider':
                ride_requests = RideRequest.objects.filter(
                    rider=user,
                    status__in=['ACCEPTED', 'COMPLETED']
                ).select_related(
                    'ride',
                    'ride__driver'
                ).order_by('-departure_time')
            else:
                return Response([], status=status.HTTP_200_OK)
            
            logger.info(f"Found {ride_requests.count()} accepted rides")
            
            # Serialize the ride requests
            serializer = self.get_serializer(ride_requests, many=True)
            
            # Enhance the response with direct driver information for frontend compatibility
            enhanced_data = []
            for ride_request_data in serializer.data:
                # Get driver details from the ride if available
                driver_details = {}
                ride_details = ride_request_data.get('ride_details')
                
                if ride_details and 'driver' in ride_details:
                    driver = ride_details['driver']
                    if driver:
                        driver_details = {
                            'driver_id': driver.get('id'),
                            'driver_name': f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip(),
                            'driver_email': driver.get('email'),
                            'driver_phone': driver.get('phone_number'),
                            'vehicle_make': driver.get('vehicle_make'),
                            'vehicle_model': driver.get('vehicle_model'),
                            'vehicle_color': driver.get('vehicle_color'),
                            'vehicle_year': driver.get('vehicle_year'),
                            'license_plate': driver.get('license_plate')
                        }
                
                # Merge the driver details with the original data
                enhanced_ride_request = {**ride_request_data, **driver_details}
                enhanced_data.append(enhanced_ride_request)
            
            return Response(enhanced_data)
            
        except Exception as e:
            logger.error(f"Error fetching accepted rides: {str(e)}")
            logger.exception("Full exception details:")
            return Response(
                {"error": "An error occurred while fetching accepted rides"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def create(self, request, *args, **kwargs):
        logging.info(f"RideRequestViewSet.create called with data: {request.data}")
        
        # Check if the request doesn't include a ride
        if 'ride' not in request.data or not request.data['ride']:
            # Get the rider from the authenticated user
            rider = request.user
            logging.info(f"No ride specified, identifying rider as: {rider}")
            
            # Extract data needed to find suitable rides
            request_data = request.data.copy()
            
            # Check if we have the necessary data
            if not all(k in request_data for k in ['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng']):
                return Response({
                    "status": "error",
                    "has_match": False,
                    "errors": {"non_field_errors": ["Missing location data. Please provide pickup and dropoff coordinates."]}
                }, status=status.HTTP_400_BAD_REQUEST)
                
            # Import the service function
            from rides.services import find_suitable_rides
            
            # Get available rides that match the rider's criteria
            available_rides = Ride.objects.filter(
                status='available',
                departure_time__gte=timezone.now()
            ).select_related('driver')
            
            logging.info(f"Looking for suitable rides among {available_rides.count()} available rides")
            
            # Find suitable rides using our service function
            suitable_rides = find_suitable_rides(available_rides, request_data)
            
            if not suitable_rides:
                return Response({
                    "status": "error",
                    "has_match": False,
                    "errors": {"non_field_errors": ["No suitable rides found for your request."]}
                }, status=status.HTTP_404_NOT_FOUND)
                
            # Select the best match (first one, since they're sorted by matching score)
            best_match = suitable_rides[0]
            
            # Add the ride ID to the request data
            request_data['ride'] = best_match.id
            request_data['rider'] = rider.id
            
            # Create a serializer with the updated data
            serializer = self.get_serializer(data=request_data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            
            # Return success response with the matched ride
            return Response({
                "status": "success",
                "has_match": True,
                "message": "Ride request created and matched with an available ride.",
                "matched_ride": {
                    "id": best_match.id,
                    "driver": best_match.driver.get_full_name(),
                    "start_location": best_match.start_location,
                    "end_location": best_match.end_location,
                    "departure_time": best_match.departure_time.isoformat()
                },
                "ride_request": serializer.data
            }, status=status.HTTP_201_CREATED)
            
        # If a ride is specified, proceed with the normal creation process
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        headers = self.get_success_headers(serializer.data)
        return Response({
            "status": "success",
            "has_match": True,
            "ride_request": serializer.data
        }, status=status.HTTP_201_CREATED, headers=headers)
    
    def perform_create(self, serializer):
        logging.info(f"Performing RideRequest creation with data: {serializer.validated_data}")
        serializer.save()

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

def mark_past_rides_complete():
    """
    Automatically mark rides as complete if their departure time has passed.
    """
    current_time = timezone.now()
    past_rides = RideRequest.objects.filter(
        status='ACCEPTED',
        departure_time__lt=current_time
    )
    
    for ride_request in past_rides:
        ride_request.status = 'COMPLETED'
        ride_request.save()
        
        # Create notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            message=f"Your ride to {ride_request.ride.end_location} has been automatically marked as completed",
            ride=ride_request.ride,
            ride_request=ride_request,
            notification_type='RIDE_COMPLETED'
        )
