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
from .services import send_ride_match_notification, send_ride_accepted_notification, create_match_notifications
import math
import random
import pytz
from django.conf import settings
from django.db import DatabaseError

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

    @staticmethod
    def check_pending_requests(ride):
        """
        Side effect: Checks for pending ride requests that might match this new ride.
        If matches are found, proposes them to the rider by updating the pending request status 
        to MATCH_PROPOSED and storing the proposed ride.
        """
        try:
            from .models import PendingRideRequest, Notification
            from .utils import find_suitable_rides

            # Find pending ride requests that could be matched with this ride
            pending_requests = PendingRideRequest.objects.filter(status='PENDING')
            
            # Filter out expired requests
            non_expired_requests = [req for req in pending_requests if not req.is_expired]
            
            for pending_request in non_expired_requests:
                # Skip requests that need more seats than available
                if pending_request.seats_needed > ride.available_seats:
                    continue
                    
                # Check if the ride is suitable (using the existing utility function)
                suitable_rides = find_suitable_rides(
                    start_lat=pending_request.pickup_latitude,
                    start_lng=pending_request.pickup_longitude,
                    end_lat=pending_request.dropoff_latitude,
                    end_lng=pending_request.dropoff_longitude,
                    departure_time=pending_request.departure_time,
                    seats_needed=pending_request.seats_needed
                )
                
                # If the new ride is in the list of suitable rides
                ride_ids = [r.id for r in suitable_rides]
                if ride.id in ride_ids:
                    # Propose this match to the rider
                    pending_request.status = 'MATCH_PROPOSED'
                    pending_request.proposed_ride = ride
                    pending_request.save()
                    
                    # Create a notification for the rider
                    Notification.objects.create(
                        recipient=pending_request.rider,
                        sender=ride.driver,
                        message=f"A ride match from {ride.start_location} to {ride.end_location} has been proposed! Tap to view and accept.",
                        ride=ride,
                        notification_type='MATCH_PROPOSED'
                    )
                    
                    logger.info(f"Match proposed for pending request {pending_request.id} with ride {ride.id}")
        
        except Exception as e:
            logger.error(f"Error in check_pending_requests: {str(e)}")
            logger.exception("Full exception details:")

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
            
            # Check for pending ride requests that might match this new ride
            self.check_pending_requests(ride)
            
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

    @action(detail=False, methods=['get'])
    def pending_status(self, request):
        """
        Check if a pending ride request has been matched with a ride.
        Returns the pending ride request status, match details if any,
        and any new notifications for the user.
        
        Query Parameters:
        - pending_id: ID of the pending ride request
        """
        try:
            pending_id = request.query_params.get('pending_id')
            if not pending_id:
                return Response({"error": "Missing pending_id parameter"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the pending ride request
            from .models import PendingRideRequest, Notification
            try:
                pending_request = PendingRideRequest.objects.get(
                    id=pending_id, 
                    rider=request.user
                )
            except PendingRideRequest.DoesNotExist:
                return Response({"error": "Pending ride request not found"}, status=status.HTTP_404_NOT_FOUND)
            
            # Get any new notifications for this pending request
            notifications = Notification.objects.filter(
                recipient=request.user,
                is_read=False,
                created_at__gte=pending_request.created_at
            ).order_by('-created_at')[:5]
            
            # Prepare notification data
            notification_data = []
            for notification in notifications:
                notification_data.append({
                    'id': notification.id,
                    'message': notification.message,
                    'type': notification.notification_type,
                    'created_at': notification.created_at
                })
            
            # Prepare response based on status
            response_data = {
                'id': pending_request.id,
                'status': pending_request.status,
                'notifications': notification_data,
                'created_at': pending_request.created_at,
                'departure_time': pending_request.departure_time,
            }
            
            # If the request has a match proposed, include ride details
            if pending_request.status == 'MATCH_PROPOSED' and pending_request.proposed_ride:
                ride = pending_request.proposed_ride
                response_data['proposed_ride'] = {
                    'id': ride.id,
                    'driver': {
                        'id': ride.driver.id,
                        'username': ride.driver.username,
                        'first_name': ride.driver.first_name,
                        'last_name': ride.driver.last_name,
                    },
                    'start_location': ride.start_location,
                    'end_location': ride.end_location,
                    'departure_time': ride.departure_time,
                    'route_distance': ride.get_formatted_distance(),
                    'route_duration': ride.get_formatted_duration()
                }
            
            # If the request is matched, include the ride_request
            elif pending_request.status == 'MATCHED' and pending_request.matched_ride_request:
                ride_request = pending_request.matched_ride_request
                ride = ride_request.ride
                response_data['matched_ride'] = {
                    'ride_request_id': ride_request.id,
                    'ride_id': ride.id,
                    'driver': {
                        'id': ride.driver.id,
                        'username': ride.driver.username,
                        'first_name': ride.driver.first_name,
                        'last_name': ride.driver.last_name,
                    },
                    'start_location': ride.start_location,
                    'end_location': ride.end_location,
                    'departure_time': ride.departure_time,
                    'status': ride_request.status
                }
            
            # Mark notifications as read
            notifications.update(is_read=True)
            
            return Response(response_data)
            
        except Exception as e:
            logger.error(f"Error checking pending request status: {str(e)}")
            logger.exception("Full exception details:")
            return Response({"error": "An error occurred"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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
    def test_mock_response(self, request):
        """
        Returns a mock response of accepted ride requests with properly formatted driver details
        for testing the frontend.
        """
        logger.info("Generating mock response for accepted rides")
        
        # Mock data with the format expected by the frontend
        mock_data = [
            {
                "id": 15,
                "rider": {
                    "id": 5,
                    "username": "rider_user",
                    "first_name": "Rider",
                    "last_name": "User",
                    "email": "rider@example.com",
                    "phone_number": "123-456-7890"
                },
                "ride": 10,
                "ride_details": {
                    "id": 10,
                    "driver": {
                        "id": 3,
                        "username": "driver_user",
                        "first_name": "Driver",
                        "last_name": "User",
                        "email": "driver@example.com",
                        "phone_number": "987-654-3210",
                        "vehicle_make": "Toyota",
                        "vehicle_model": "Camry",
                        "vehicle_color": "Blue",
                        "license_plate": "ABC123"
                    },
                    "start_location": "Campus Drive, Blacksburg",
                    "end_location": "Main Street, Blacksburg",
                    "departure_time": "2025-04-05T10:00:00Z",
                    "seats_available": 3,
                    "route_distance": 5.2,
                    "route_duration": 15
                },
                "pickup_location": "Campus Drive, Blacksburg",
                "dropoff_location": "Main Street, Blacksburg",
                "pickup_latitude": 37.223866,
                "pickup_longitude": -80.428721,
                "dropoff_latitude": 37.230761,
                "dropoff_longitude": -80.414967,
                "departure_time": "2025-04-05T10:00:00Z",
                "seats_needed": 1,
                "status": "ACCEPTED",
                "created_at": "2025-04-01T08:30:00Z",
                "updated_at": "2025-04-01T09:00:00Z",
                "nearest_dropoff_point": "{\"latitude\": 37.230761, \"longitude\": -80.414967, \"address\": \"Main Street, Blacksburg\"}",
                "nearest_dropoff_info": {
                    "address": "Main Street, Blacksburg",
                    "latitude": 37.230761,
                    "longitude": -80.414967,
                    "distance_from_rider": 0.5
                },
                "optimal_pickup_point": "{\"latitude\": 37.223866, \"longitude\": -80.428721, \"address\": \"Campus Drive, Blacksburg\"}",
                "optimal_pickup_info": {
                    "address": "Campus Drive, Blacksburg",
                    "latitude": 37.223866,
                    "longitude": -80.428721,
                    "distance_from_rider": 0.1
                },
                "driver_details": {
                    "id": 3,
                    "username": "driver_user",
                    "first_name": "Driver",
                    "last_name": "User",
                    "email": "driver@example.com",
                    "phone_number": "987-654-3210",
                    "vehicle_make": "Toyota",
                    "vehicle_model": "Camry",
                    "vehicle_color": "Blue",
                    "license_plate": "ABC123"
                },
                "driver_id": 3,
                "driver_name": "Driver User",
                "driver_email": "driver@example.com",
                "driver_phone": "987-654-3210",
                "vehicle_make": "Toyota",
                "vehicle_model": "Camry",
                "vehicle_color": "Blue",
                "license_plate": "ABC123"
            }
        ]
        
        logger.info("Returning mock response with properly formatted data")
        return Response(mock_data)

    @action(detail=False, methods=['get'])
    def mock_accepted(self, request):
        """
        A special endpoint that returns mock data when in DEBUG mode, 
        otherwise it calls the regular accepted endpoint.
        This allows frontend testing without changing the API URL.
        """
        from django.conf import settings
        
        # Check if we're in debug mode
        if settings.DEBUG:
            logger.info("DEBUG mode detected, returning mock data for accepted rides")
            # Use the same mock data from test_mock_response
            mock_data = [
                {
                    "id": 15,
                    "rider": {
                        "id": 5,
                        "username": "rider_user",
                        "first_name": "Rider",
                        "last_name": "User",
                        "email": "rider@example.com",
                        "phone_number": "123-456-7890"
                    },
                    "ride": 10,
                    "ride_details": {
                        "id": 10,
                        "driver": {
                            "id": 3,
                            "username": "driver_user",
                            "first_name": "Driver",
                            "last_name": "User",
                            "email": "driver@example.com",
                            "phone_number": "987-654-3210",
                            "vehicle_make": "Toyota",
                            "vehicle_model": "Camry",
                            "vehicle_color": "Blue",
                            "license_plate": "ABC123"
                        },
                        "start_location": "Campus Drive, Blacksburg",
                        "end_location": "Main Street, Blacksburg",
                        "departure_time": "2025-04-05T10:00:00Z",
                        "seats_available": 3,
                        "route_distance": 5.2,
                        "route_duration": 15
                    },
                    "pickup_location": "Campus Drive, Blacksburg",
                    "dropoff_location": "Main Street, Blacksburg",
                    "pickup_latitude": 37.223866,
                    "pickup_longitude": -80.428721,
                    "dropoff_latitude": 37.230761,
                    "dropoff_longitude": -80.414967,
                    "departure_time": "2025-04-05T10:00:00Z",
                    "seats_needed": 1,
                    "status": "ACCEPTED",
                    "created_at": "2025-04-01T08:30:00Z",
                    "updated_at": "2025-04-01T09:00:00Z",
                    "nearest_dropoff_point": "{\"latitude\": 37.230761, \"longitude\": -80.414967, \"address\": \"Main Street, Blacksburg\"}",
                    "nearest_dropoff_info": {
                        "address": "Main Street, Blacksburg",
                        "latitude": 37.230761,
                        "longitude": -80.414967,
                        "distance_from_rider": 0.5
                    },
                    "optimal_pickup_point": "{\"latitude\": 37.223866, \"longitude\": -80.428721, \"address\": \"Campus Drive, Blacksburg\"}",
                    "optimal_pickup_info": {
                        "address": "Campus Drive, Blacksburg",
                        "latitude": 37.223866,
                        "longitude": -80.428721,
                        "distance_from_rider": 0.1
                    },
                    "driver_details": {
                        "id": 3,
                        "username": "driver_user",
                        "first_name": "Driver",
                        "last_name": "User",
                        "email": "driver@example.com",
                        "phone_number": "987-654-3210",
                        "vehicle_make": "Toyota",
                        "vehicle_model": "Camry",
                        "vehicle_color": "Blue",
                        "license_plate": "ABC123"
                    },
                    "driver_id": 3,
                    "driver_name": "Driver User",
                    "driver_email": "driver@example.com",
                    "driver_phone": "987-654-3210",
                    "vehicle_make": "Toyota",
                    "vehicle_model": "Camry",
                    "vehicle_color": "Blue",
                    "license_plate": "ABC123"
                }
            ]
            
            # For the frontend to test with fake data
            return Response(mock_data)
        else:
            # Not in debug mode, call the normal accepted endpoint
            logger.info("Production mode detected, calling real accepted endpoint")
            return self.accepted(request)

    @action(detail=False, methods=['get'])
    def accepted(self, request):
        """
        Get all accepted ride requests for the current user (both as rider and driver)
        """
        try:
            logger.info(f"Fetching accepted rides for user: {request.user.username} (ID: {request.user.id})")
            
            user = request.user
            user_type = getattr(user, 'user_type', '').lower()
            logger.info(f"User type: {user_type}")
            
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
            
            # If no rides were found, return empty array rather than potentially trying to process empty data
            if not ride_requests.exists():
                logger.info("No accepted rides found, returning empty array")
                return Response([])

            # Serialize ride requests one by one to identify and handle problematic records
            serialized_data = []
            for request_obj in ride_requests:
                try:
                    # Serialize each ride request individually
                    serializer = self.get_serializer(request_obj)
                    ride_data = serializer.data
                    
                    # Validate and sanitize JSON data to prevent issues
                    # Handle nearest_dropoff_point and optimal_pickup_point separately if they're causing issues
                    if 'nearest_dropoff_point' in ride_data and ride_data['nearest_dropoff_point'] is not None:
                        # Ensure it's a valid JSON-serializable value
                        if not isinstance(ride_data['nearest_dropoff_point'], (dict, list, str, int, float, bool)) or ride_data['nearest_dropoff_point'] == '':
                            logger.warning(f"Invalid nearest_dropoff_point for ride {request_obj.id}: {type(ride_data['nearest_dropoff_point'])}")
                            ride_data['nearest_dropoff_point'] = None
                    
                    if 'optimal_pickup_point' in ride_data and ride_data['optimal_pickup_point'] is not None:
                        # Ensure it's a valid JSON-serializable value
                        if not isinstance(ride_data['optimal_pickup_point'], (dict, list, str, int, float, bool)) or ride_data['optimal_pickup_point'] == '':
                            logger.warning(f"Invalid optimal_pickup_point for ride {request_obj.id}: {type(ride_data['optimal_pickup_point'])}")
                            ride_data['optimal_pickup_point'] = None
                    
                    serialized_data.append(ride_data)
                    
                except Exception as e:
                    logger.error(f"Error serializing ride request {request_obj.id}: {str(e)}")
                    logger.exception("Serialization error details:")
                    # Skip this problematic ride rather than failing the entire request
                    continue
            
            # Enhance the response with direct driver information for frontend compatibility
            enhanced_data = []
            
            for ride_request_data in serialized_data:
                try:
                    # Default driver details - used if we can't extract from ride_details
                    driver_details = {
                        'driver_id': None,
                        'driver_name': 'Unknown Driver',
                        'driver_email': None,
                        'driver_phone': None,
                        'vehicle_make': None,
                        'vehicle_model': None,
                        'vehicle_color': None,
                        'vehicle_year': None,
                        'license_plate': None
                    }
                    
                    # Get ride_details if it exists
                    ride_details = ride_request_data.get('ride_details')
                    
                    # First try to extract from ride_details.driver
                    if ride_details and isinstance(ride_details, dict) and 'driver' in ride_details:
                        driver = ride_details['driver']
                        if driver and isinstance(driver, dict):
                            logger.debug(f"Found driver in ride_details: {driver}")
                            driver_details = {
                                'driver_id': driver.get('id'),
                                'driver_name': f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or 'Unknown Driver',
                                'driver_email': driver.get('email'),
                                'driver_phone': driver.get('phone_number'),
                                'vehicle_make': driver.get('vehicle_make'),
                                'vehicle_model': driver.get('vehicle_model'),
                                'vehicle_color': driver.get('vehicle_color'),
                                'vehicle_year': driver.get('vehicle_year'),
                                'license_plate': driver.get('license_plate')
                            }
                    
                    # Then try driver_details as fallback
                    elif ride_request_data.get('driver_details'):
                        driver = ride_request_data.get('driver_details')
                        if driver and isinstance(driver, dict):
                            logger.debug(f"Found driver in driver_details: {driver}")
                            driver_details = {
                                'driver_id': driver.get('id'),
                                'driver_name': f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or 'Unknown Driver',
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
                    
                    # Ensure all values are JSON-serializable
                    for key, value in enhanced_ride_request.items():
                        if not isinstance(value, (dict, list, str, int, float, bool, type(None))):
                            logger.warning(f"Non-serializable value for key {key}: {type(value)}")
                            enhanced_ride_request[key] = str(value) if value is not None else None
                    
                    enhanced_data.append(enhanced_ride_request)
                
                except Exception as processing_error:
                    logger.error(f"Error processing ride request data: {str(processing_error)}")
                    logger.error(f"Problematic ride request data: {ride_request_data}")
                    # Skip this ride request if we can't process it, rather than failing the whole request
                    continue
            
            logger.info(f"Returning {len(enhanced_data)} enhanced ride requests")
            return Response(enhanced_data)
            
        except Exception as e:
            logger.error(f"Error fetching accepted rides: {str(e)}")
            logger.exception("Full exception details:")
            # Return empty list on error rather than 500
            return Response([])

    def create(self, request, *args, **kwargs):
        logging.info(f"====================== RIDE REQUEST DETAILS ======================")
        logging.info(f"Raw request data: {request.data}")
        logging.info(f"Request path: {request.path}")
        logging.info(f"Request method: {request.method}")
        logging.info(f"Request headers: {dict(request.headers)}")
        for key, value in request.data.items():
            logging.info(f"Field {key}: {value}")
        logging.info(f"Rider user: {request.user.username} (ID: {request.user.id})")
        logging.info(f"====================== END REQUEST DETAILS ======================")
        
        # Check if the request doesn't include a ride
        if 'ride' not in request.data or not request.data['ride']:
            # Get the rider from the authenticated user
            rider = request.user
            logging.info(f"No ride specified, identifying rider as: {rider}")
            
            # Extract data needed to find suitable rides
            request_data = request.data.copy()
            
            # Field name mapping from frontend to backend expected names
            coord_mapping = {
                'pickup_latitude': 'pickup_lat',
                'pickup_longitude': 'pickup_lng',
                'dropoff_latitude': 'dropoff_lat',
                'dropoff_longitude': 'dropoff_lng'
            }
            
            # Add backward compatibility for different field naming conventions
            for frontend_name, backend_name in coord_mapping.items():
                if frontend_name in request_data and backend_name not in request_data:
                    request_data[backend_name] = request_data[frontend_name]
            
            logging.info(f"Processed request data: {request_data}")
            
            # Check if we have the necessary data
            if not all(k in request_data for k in ['pickup_lat', 'pickup_lng', 'dropoff_lat', 'dropoff_lng']):
                logging.error("Missing required coordinate fields")
                logging.error(f"Available fields: {list(request_data.keys())}")
                return Response({
                    "status": "error",
                    "has_match": False,
                    "errors": {"non_field_errors": ["Missing location data. Please provide pickup and dropoff coordinates."]}
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Prepare location coordinates for the matching algorithm
            pickup_coords = (float(request_data['pickup_lng']), float(request_data['pickup_lat']))
            dropoff_coords = (float(request_data['dropoff_lng']), float(request_data['dropoff_lat']))
            
            logging.info(f"Using pickup coordinates: {pickup_coords}")
            logging.info(f"Using dropoff coordinates: {dropoff_coords}")
            
            # Store coordinates for ride matching
            request_data['pickup_location_coordinates'] = pickup_coords 
            request_data['dropoff_location_coordinates'] = dropoff_coords
            
            # Get departure time from request data
            departure_time = request_data.get('departure_time')
            if isinstance(departure_time, str):
                try:
                    departure_time = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
                except Exception:
                    departure_time = timezone.now() + timezone.timedelta(hours=1)
            elif not departure_time:
                departure_time = timezone.now() + timezone.timedelta(hours=1)
                
            # Check for existing pending requests with similar parameters
            from .models import PendingRideRequest
            
            # Define a time window (e.g., 30 minutes) for considering requests as duplicates
            time_window = timezone.timedelta(minutes=30)
            
            # Check for existing pending requests
            existing_requests = PendingRideRequest.objects.filter(
                rider=rider,
                status__in=['PENDING', 'MATCH_PROPOSED'],
                # Check if departure time is within a reasonable window
                departure_time__gte=departure_time - time_window,
                departure_time__lte=departure_time + time_window
            )
            
            # Add distance filter for pickup/dropoff locations
            # We'll check if any existing request has similar coordinates
            existing_request_found = False
            seats_needed = int(request_data.get('seats_needed', 1))
            
            for existing_req in existing_requests:
                # Calculate distance between pickup points
                pickup_distance = great_circle(
                    (float(request_data.get('pickup_lat')), float(request_data.get('pickup_lng'))),
                    (existing_req.pickup_latitude, existing_req.pickup_longitude)
                ).kilometers
                
                # Calculate distance between dropoff points
                dropoff_distance = great_circle(
                    (float(request_data.get('dropoff_lat')), float(request_data.get('dropoff_lng'))),
                    (existing_req.dropoff_latitude, existing_req.dropoff_longitude)
                ).kilometers
                
                # If both pickup and dropoff are within 0.5km, consider it a duplicate
                if pickup_distance < 0.5 and dropoff_distance < 0.5 and existing_req.seats_needed == seats_needed:
                    existing_request_found = True
                    logging.info(f"Found existing similar request (ID: {existing_req.id})")
                    
                    # Return the existing request ID instead of creating a new one
                    return Response({
                        "status": "pending",
                        "has_match": False,
                        "pending_request_id": existing_req.id,
                        "message": "You already have a similar ride request. We'll notify you when a matching ride becomes available.",
                        "is_duplicate": True
                    }, status=status.HTTP_200_OK)
                
            # Import the service function
            from rides.services import find_suitable_rides
            
            # Get available rides that match the rider's criteria
            available_rides = Ride.objects.filter(
                status__in=['available', 'AVAILABLE', 'SCHEDULED', 'scheduled'],
                available_seats__gte=1,  # Use available_seats instead of seats_available
                departure_time__gte=timezone.now()
            ).select_related('driver')
            
            logging.info(f"Looking for suitable rides among {available_rides.count()} available rides")
            
            # Debug available rides
            if available_rides.count() == 0:
                logging.warning("No available rides found in the system!")
            else:
                for index, ride in enumerate(available_rides):
                    logging.info(f"Available ride #{index+1}: ID={ride.id}, from={ride.start_location} to={ride.end_location}, " +
                               f"status={ride.status}, seats={ride.available_seats}, " +  # Use available_seats instead of seats_available
                               f"departure={ride.departure_time}")
            
            # Find suitable rides using our service function
            suitable_rides = find_suitable_rides(
                available_rides, 
                request_data
            )
            
            if not suitable_rides:
                logging.warning("No suitable rides found for the request!")
                logging.warning(f"Pickup location: {request_data.get('pickup_location')}")
                logging.warning(f"Dropoff location: {request_data.get('dropoff_location')}")
                logging.warning(f"Pickup coordinates: {pickup_coords}")
                logging.warning(f"Dropoff coordinates: {dropoff_coords}")
                
                # Log the 404 response for diagnostic purposes
                logging.error("TRACKING: Returning 404 - No suitable rides found for request")
                logging.error(f"TRACKING: This request would create an entry in rides_riderequest IF a match was found")
                logging.error(f"TRACKING: Full request data: {request_data}")
                
                # Store the request as a pending ride request for future matching
                from .models import PendingRideRequest
                
                try:
                    # Create a pending request for future matching
                    pending_request = PendingRideRequest.objects.create(
                        rider=request.user,
                        pickup_location=request_data.get('pickup_location', ''),
                        dropoff_location=request_data.get('dropoff_location', ''),
                        pickup_latitude=float(request_data.get('pickup_lat', 0)),
                        pickup_longitude=float(request_data.get('pickup_lng', 0)),
                        dropoff_latitude=float(request_data.get('dropoff_lat', 0)),
                        dropoff_longitude=float(request_data.get('dropoff_lng', 0)),
                        departure_time=request_data.get('departure_time', timezone.now() + timezone.timedelta(hours=1)),
                        seats_needed=int(request_data.get('seats_needed', 1)),
                        status='PENDING'
                    )
                    
                    logging.info(f"Stored ride request as pending (ID: {pending_request.id})")
                    
                    # Create a notification for the rider
                    from .models import Notification
                    notification = Notification.objects.create(
                        recipient=request.user,
                        message=f"Your ride request from {pending_request.pickup_location} to {pending_request.dropoff_location} has been saved. We'll notify you when a matching ride becomes available.",
                        notification_type="RIDE_PENDING"
                    )
                    
                    # Return a more informative response
                    return Response({
                        "status": "pending",
                        "has_match": False,
                        "pending_request_id": pending_request.id,
                        "message": "Your request has been saved. We'll notify you when a matching ride becomes available."
                    }, status=status.HTTP_202_ACCEPTED)
                    
                except Exception as e:
                    logging.error(f"Error creating pending ride request: {str(e)}")
                    logging.exception("Full exception details:")
                
                # TESTING ONLY: Return a mock response for development
                if settings.DEBUG:
                    logging.info("DEBUG mode active: Returning a mock ride match response for testing")
                    from django.contrib.auth import get_user_model
                    # Ride is already imported at the top level
                    
                    # Get a driver (any user will do for testing)
                    User = get_user_model()
                    try:
                        mock_driver = User.objects.first()
                        if not mock_driver:
                            # If no users exist, use the current user as driver
                            mock_driver = request.user
                            
                        # Create a mock ride 
                        mock_ride = Ride.objects.create(
                            driver=mock_driver,
                            start_location=request_data.get('pickup_location', 'Test Start'),
                            end_location=request_data.get('dropoff_location', 'Test End'),
                            start_latitude=float(request_data.get('pickup_lat', 0)),
                            start_longitude=float(request_data.get('pickup_lng', 0)),
                            end_latitude=float(request_data.get('dropoff_lat', 0)),
                            end_longitude=float(request_data.get('dropoff_lng', 0)),
                            departure_time=timezone.now() + timezone.timedelta(minutes=15),
                            available_seats=4,  # Use available_seats
                            status='SCHEDULED'
                        )
                        
                        # Use this mock ride
                        request_data['ride'] = mock_ride.id
                        # Set rider_id instead of rider for the serializer
                        request_data['rider_id'] = rider.id
                        
                        logging.info(f"Created mock ride #{mock_ride.id} for testing")
                        
                        # Continue with serializer creation
                        serializer = self.get_serializer(data=request_data)
                        serializer.is_valid(raise_exception=True)
                        
                        # Save the ride request with validated data
                        ride_request = serializer.save()
                        
                        # Create a notification for the rider
                        from .models import Notification
                        notification = Notification.objects.create(
                            recipient=rider,
                            sender=mock_ride.driver,
                            message=f"TEST ONLY: Mock ride match from {mock_ride.start_location} to {mock_ride.end_location}",
                            ride=mock_ride,
                            ride_request=ride_request,
                            notification_type='RIDE_MATCH'
                        )
                        
                        return Response({
                            "status": "success",
                            "has_match": True,
                            "message": "TEST ONLY: Mock ride match created for testing",
                            "ride_request": serializer.data
                        }, status=status.HTTP_201_CREATED)
                        
                    except Exception as e:
                        logging.error(f"Error creating mock ride: {str(e)}")
                
                return Response({
                    "status": "error",
                    "has_match": False,
                    "errors": {"non_field_errors": ["No suitable rides found for your request."]}
                }, status=status.HTTP_404_NOT_FOUND)
            
            logging.info(f"Found {len(suitable_rides)} suitable rides")
            for i, match in enumerate(suitable_rides):
                logging.info(f"Match #{i+1}: ride_id={match['ride'].id}, " +
                           f"overlap={match['overlap_percentage']:.2f}%, " +
                           f"score={match['matching_score']:.2f}, " + 
                           f"time_diff={match['time_diff_minutes']:.1f} minutes")
                
            # Select the best match (first one, since they're sorted by matching score)
            best_match = suitable_rides[0]['ride']
            best_match_details = suitable_rides[0]
            
            logging.info(f"Selected best match: ride_id={best_match.id}, " +
                       f"from={best_match.start_location} to={best_match.end_location}, " +
                       f"driver={best_match.driver.username}, " +
                       f"overlap={best_match_details['overlap_percentage']:.2f}%, " +
                       f"score={best_match_details['matching_score']:.2f}")
            
            # Add the ride ID to the request data
            request_data['ride'] = best_match.id
            # Set rider_id instead of rider for the serializer
            request_data['rider_id'] = rider.id
            
            # Create a serializer with the updated data
            serializer = self.get_serializer(data=request_data)
            serializer.is_valid(raise_exception=True)
            ride_request = self.perform_create(serializer)
            
            # Create notifications for both the rider and driver
            from .models import Notification
            
            # Notify rider about the match
            rider_notification = Notification.objects.create(
                recipient=rider,
                sender=best_match.driver,
                message=f"You've been matched with a ride from {best_match.start_location} to {best_match.end_location}",
                ride=best_match,
                ride_request=ride_request,
                notification_type='RIDE_MATCH'  # Make sure this is consistently 'RIDE_MATCH'
            )
            
            # Notify driver about the new ride request
            driver_notification = Notification.objects.create(
                recipient=best_match.driver,
                sender=rider,
                message=f"A rider has requested to join your ride from {best_match.start_location} to {best_match.end_location}",
                ride=best_match,
                ride_request=ride_request,
                notification_type='RIDE_REQUEST'
            )
            
            logging.info(f"Created notifications for rider (ID: {rider_notification.id}) and driver (ID: {driver_notification.id})")
            
            # Return success response with the matched ride
            # Note: We include several explicit match-related fields (isMatched, match_found, match_details)
            # to ensure the frontend correctly recognizes this as a matched ride
            return Response({
                "status": "success",
                "has_match": True,
                "isMatched": True,  # Add explicit field for frontend
                "match_found": True,  # Add another explicit field for frontend
                "message": "Ride request created and matched with an available ride.",
                "matched_ride": {
                    "id": best_match.id,
                    "driver": best_match.driver.get_full_name(),
                    "start_location": best_match.start_location,
                    "end_location": best_match.end_location,
                    "departure_time": best_match.departure_time.isoformat()
                },
                "match_details": {  # Add this specific field for the frontend
                    "ride_id": best_match.id,
                    "driver_name": best_match.driver.get_full_name(),
                    "driver_id": best_match.driver.id,
                    "pickup": best_match.start_location,
                    "dropoff": best_match.end_location,
                    "departure_time": best_match.departure_time.isoformat(),
                    "overlap_percentage": best_match_details.get('overlap_percentage', 0),
                    "matching_score": best_match_details.get('matching_score', 0),
                    "vehicle_make": getattr(best_match.driver, 'vehicle_make', ''),
                    "vehicle_model": getattr(best_match.driver, 'vehicle_model', ''),
                    "vehicle_color": getattr(best_match.driver, 'vehicle_color', ''),
                    "license_plate": getattr(best_match.driver, 'license_plate', '')
                },
                "ride_request": serializer.data,
                "notification_sent": True,
                "notification_id": rider_notification.id
            }, status=status.HTTP_201_CREATED)
        
        # If a ride is specified, proceed with the normal creation process
        # Ensure rider_id is set if not in the request data
        request_data = request.data.copy()
        if 'rider_id' not in request_data and 'rider' not in request_data:
            request_data['rider_id'] = request.user.id
            
        serializer = self.get_serializer(data=request_data)
        serializer.is_valid(raise_exception=True)
        ride_request = self.perform_create(serializer)
        
        # Create notifications for the newly created ride request
        from .models import Notification
        
        # Get the ride
        ride = ride_request.ride
        
        # Notify driver about the new ride request
        driver_notification = Notification.objects.create(
            recipient=ride.driver,
            sender=request.user,
            message=f"A rider has requested to join your ride from {ride.start_location} to {ride.end_location}",
            ride=ride,
            ride_request=ride_request,
            notification_type='RIDE_REQUEST'
        )
        
        headers = self.get_success_headers(serializer.data)
        # Note: We include several explicit match-related fields (isMatched, match_found, match_details)
        # to ensure the frontend correctly recognizes this as a matched ride
        return Response({
            "status": "success",
            "has_match": True,
            "isMatched": True,  # Add explicit field for frontend
            "match_found": True,  # Add another explicit field for frontend
            "message": "Ride request created successfully.",
            "match_details": {  # Add this specific field for the frontend
                "ride_id": ride.id,
                "driver_name": ride.driver.get_full_name(),
                "driver_id": ride.driver.id,
                "pickup": ride.start_location,
                "dropoff": ride.end_location,
                "departure_time": ride.departure_time.isoformat(),
                "vehicle_make": getattr(ride.driver, 'vehicle_make', ''),
                "vehicle_model": getattr(ride.driver, 'vehicle_model', ''),
                "vehicle_color": getattr(ride.driver, 'vehicle_color', ''),
                "license_plate": getattr(ride.driver, 'license_plate', '')
            },
            "ride_request": serializer.data,
            "notification_sent": True,
            "notification_id": driver_notification.id
        }, status=status.HTTP_201_CREATED, headers=headers)
        
    def perform_create(self, serializer):
        logging.info(f"Performing RideRequest creation with data: {serializer.validated_data}")
        # Ensure the rider is set to the current user if not specified
        if 'rider' not in serializer.validated_data:
            logging.info(f"Setting rider to current user: {self.request.user.username} (ID: {self.request.user.id})")
            rider = self.request.user
        else:
            rider = serializer.validated_data['rider']
            logging.info(f"Using specified rider: {rider.username} (ID: {rider.id})")
            
        # Log before saving to database
        logging.info(f"TRACKING: About to save ride request to database")
        ride_request = serializer.save(rider=rider)
        # Log after saving to database
        logging.info(f"TRACKING: Successfully saved ride request to database with ID: {serializer.instance.id}")
        
        return ride_request

    @action(detail=False, methods=['post'])
    def accept_match(self, request):
        """
        Accept a proposed ride match.
        Creates a RideRequest and updates the PendingRideRequest status.
        """
        try:
            pending_id = request.data.get('pending_id')
            if not pending_id:
                return Response({"error": "Missing pending_id parameter"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the pending ride request
            from .models import PendingRideRequest, Notification
            try:
                pending_request = PendingRideRequest.objects.get(
                    id=pending_id, 
                    rider=request.user,
                    status='MATCH_PROPOSED'
                )
            except PendingRideRequest.DoesNotExist:
                return Response({"error": "Proposed match not found"}, status=status.HTTP_404_NOT_FOUND)
            
            # Check if the proposed ride still exists and has available seats
            ride = pending_request.proposed_ride
            if not ride or ride.available_seats < pending_request.seats_needed:
                pending_request.status = 'PENDING'  # Reset to pending to try again
                pending_request.proposed_ride = None
                pending_request.save()
                return Response({
                    "error": "The proposed ride is no longer available",
                    "status": "PENDING"
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Create a ride request for this match
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
                status='PENDING'
            )
            
            # Update the pending request
            pending_request.status = 'MATCHED'
            pending_request.matched_ride_request = ride_request
            pending_request.save()
            
            # Create notifications for rider and driver
            from .services import create_match_notifications
            create_match_notifications(pending_request, ride_request)
            
            # Update available seats if needed
            ride.available_seats -= pending_request.seats_needed
            ride.save()
            
            # Return success
            return Response({
                "status": "success",
                "message": "Match accepted successfully",
                "ride_request_id": ride_request.id
            })
            
        except Exception as e:
            logger.error(f"Error accepting match: {str(e)}")
            logger.exception("Full exception details:")
            return Response({"error": "An error occurred"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def reject_match(self, request):
        """
        Reject a proposed ride match.
        Updates the PendingRideRequest status.
        """
        try:
            pending_id = request.data.get('pending_id')
            if not pending_id:
                return Response({"error": "Missing pending_id parameter"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get the pending ride request
            from .models import PendingRideRequest, Notification
            try:
                pending_request = PendingRideRequest.objects.get(
                    id=pending_id, 
                    rider=request.user,
                    status='MATCH_PROPOSED'
                )
            except PendingRideRequest.DoesNotExist:
                return Response({"error": "Proposed match not found"}, status=status.HTTP_404_NOT_FOUND)
            
            # Get the ride before updating
            ride = pending_request.proposed_ride
            
            # Update the pending request
            pending_request.status = 'REJECTED'
            pending_request.save()
            
            # Create notification for the driver
            if ride:
                Notification.objects.create(
                    recipient=ride.driver,
                    sender=pending_request.rider,
                    message=f"A rider has rejected your ride from {ride.start_location} to {ride.end_location}",
                    ride=ride,
                    notification_type='RIDE_REJECTED'
                )
            
            # Return success
            return Response({
                "status": "success",
                "message": "Match rejected successfully"
            })
            
        except Exception as e:
            logger.error(f"Error rejecting match: {str(e)}")
            logger.exception("Full exception details:")
            return Response({"error": "An error occurred"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

def mark_expired_pending_requests():
    """
    Automatically mark pending ride requests as expired if their departure time has passed.
    """
    try:
        from .models import PendingRideRequest, Notification
        import logging
        from django.utils import timezone
        from django.db import DatabaseError
        
        logger = logging.getLogger(__name__)
        current_time = timezone.now()
        
        try:
            # Get all pending or match proposed requests with departure time in the past
            expired_requests = PendingRideRequest.objects.filter(
                status__in=['PENDING', 'MATCH_PROPOSED'],
                departure_time__lt=current_time - timezone.timedelta(minutes=30)  # 30 minutes after departure time
            )
            
            count = expired_requests.count()
            logger.info(f"Found {count} expired pending ride requests")
            
            for request in expired_requests:
                old_status = request.status
                request.status = 'EXPIRED'
                request.save(update_fields=['status'])
                
                # Notify the rider
                Notification.objects.create(
                    recipient=request.rider,
                    message=f"Your ride request from {request.pickup_location} to {request.dropoff_location} has expired.",
                    notification_type='RIDE_CANCELLED'
                )
                
                logger.info(f"Marked pending request {request.id} as expired (was {old_status})")
        
        except DatabaseError as db_error:
            # If there's a database error (like missing columns), log it but don't crash
            logger.error(f"Database error in mark_expired_pending_requests: {str(db_error)}")
            logger.info("Trying alternative approach with minimal fields...")
            
            # Alternative approach using only fields that must exist
            expired_requests = PendingRideRequest.objects.filter(
                status='PENDING',  # Only check PENDING to avoid proposed_ride field
                departure_time__lt=current_time - timezone.timedelta(minutes=30)
            ).values('id', 'status', 'rider_id', 'pickup_location', 'dropoff_location')
            
            count = expired_requests.count()
            logger.info(f"Found {count} expired pending ride requests (alternative approach)")
            
            for request in expired_requests:
                # Update just the status field
                PendingRideRequest.objects.filter(id=request['id']).update(status='EXPIRED')
                
                # Notify the rider
                Notification.objects.create(
                    recipient_id=request['rider_id'],
                    message=f"Your ride request from {request['pickup_location']} to {request['dropoff_location']} has expired.",
                    notification_type='RIDE_CANCELLED'
                )
                
                logger.info(f"Marked pending request {request['id']} as expired (was {request['status']})")
            
    except Exception as e:
        logger.error(f"Error marking expired pending requests: {str(e)}")
        logger.exception("Full exception details:")
