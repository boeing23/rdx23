from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
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
from .services import send_ride_match_notification, send_ride_accepted_notification, create_match_notifications, get_address_from_coordinates
import math
import random
import pytz
from django.conf import settings
from django.db import DatabaseError
from django.db import models
from django.db.models import Q, F, Count, Sum, Avg
from django.db.models.functions import Coalesce, ExtractHour
from django.http import JsonResponse
from django.utils.timezone import make_aware
from django.utils.dateparse import parse_datetime
from users.models import User  # For admin dashboard functions
import time
from django.db import transaction
import json
from json.decoder import JSONDecodeError
import ast
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.core.serializers import serialize
from django.shortcuts import redirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView

logger = logging.getLogger(__name__)

# Initialize geolocator
geolocator = Nominatim(user_agent="carpool_app")


def reverse_geocode(coordinates):
    """Get address from coordinates with fallback for errors"""
    try:
        # Try to get address using Nominatim
        location = geolocator.reverse(
            (coordinates[0], coordinates[1]), exactly_one=True)
        if location and location.address:
            return location.address
    except Exception as e:
        logger.error(f"Error in reverse_geocode: {str(e)}")
    return "Location address unavailable"


# OpenRouteService API constants
ORS_API_KEY = getattr(settings, 'OPENROUTE_API_KEY', None)
if not ORS_API_KEY:
    logger.error("OpenRouteService API key not configured in settings")
OPENROUTE_BASE_URL = "https://api.openrouteservice.org/v2"


def calculate_distance(point1, point2):
    """
    Calculate the distance between two points using great circle distance.
    Points should be in (longitude, latitude) format.
    """
    # Convert from (longitude, latitude) to (latitude, longitude) for
    # great_circle
    p1 = (point1[1], point1[0])
    p2 = (point2[1], point2[0])
    return great_circle(p1, p2).meters


def get_coordinates(address):
    location = geolocator.geocode(address)
    if location:
        return location.longitude, location.latitude
    return None


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
        elif response.status_code == 429:  # Rate limit hit
            logger.warning("OpenRouteService API rate limit hit")
            # Wait for a bit before retrying
            time.sleep(2)
            return get_route_driving_distance(start_coords, end_coords)
            
        # If API call fails, fall back to great_circle
        logger.warning(
            "Failed to get driving distance from API, falling back to straight-line distance")
        return great_circle(
            # Convert (lng, lat) to (lat, lng)
            (start_coords[1], start_coords[0]),
            (end_coords[1], end_coords[0])
        ).kilometers
            
    except Exception as e:
        logger.error(f"Error calculating driving distance: {str(e)}")
        # Fall back to great_circle
        return great_circle(
            # Convert (lng, lat) to (lat, lng)
            (start_coords[1], start_coords[0]),
            (end_coords[1], end_coords[0])
        ).kilometers


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
    t = (vec_p1d[0] * segment_vec[0] + vec_p1d[1] * segment_vec[1]
         ) / (segment_vec[0]**2 + segment_vec[1]**2 + 1e-8)
    t = max(0, min(1, t))  # Clamp to segment
    # Projection point
    closest = (p1[0] + t * segment_vec[0], p1[1] + t * segment_vec[1])
    return closest


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
            
            dist = get_route_driving_distance(
    closest_lng_lat, rider_pickup_lng_lat)
        except Exception as e:
            logger.warning(
        f"Failed to get driving distance, using great_circle: {str(e)}")
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
                
                dist = get_route_driving_distance(
                    point_lng_lat, rider_pickup_lng_lat)
            except Exception as e:
                logger.warning(
    f"Failed to get driving distance, using great_circle: {str(e)}")
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
            
            dist = get_route_driving_distance(
                point_lng_lat, rider_pickup_lng_lat)
        except Exception as e:
            logger.warning(
    f"Failed to get driving distance, using great_circle: {str(e)}")
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
            
            dist = get_route_driving_distance(
    closest_lng_lat, rider_dropoff_lng_lat)
        except Exception as e:
            logger.warning(
    f"Failed to get driving distance, using great_circle: {str(e)}")
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
            
            min_dist = get_route_driving_distance(
                point_lng_lat, rider_dropoff_lng_lat)
        except Exception as e:
            logger.warning(
    f"Failed to get driving distance, using great_circle: {str(e)}")
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


def find_optimal_point(route, target_point):
    """Find optimal point along a route closest to target point using vector projection"""
    min_dist = float('inf')
    optimal_point = None
    optimal_index = 0

    for i in range(len(route) - 1):
        p1, p2 = route[i], route[i + 1]

        # Vector calculations
        vec = (p2[0] - p1[0], p2[1] - p1[1])
        vec_target = (target_point[0] - p1[0], target_point[1] - p1[1])

        # Projection calculation
        t = (vec_target[0] * vec[0] + vec_target[1] *
             vec[1]) / (vec[0]**2 + vec[1]**2 + 1e-8)
        t = max(0, min(1, t))
        closest = (p1[0] + t * vec[0], p1[1] + t * vec[1])

        try:
            dist = calculate_distance(closest, target_point)
            if dist < min_dist:
                min_dist = dist
                optimal_point = closest
                optimal_index = i
        except Exception as e:
            logger.error(f"Error calculating distance: {str(e)}")
            continue

    return {
    "point": optimal_point,
    "index": optimal_index,
     "distance": min_dist}


def calculate_segment_overlap(route1, route2, threshold=200):
    """Calculate percentage of points in route1 that are close to any point in route2"""
    if not route1 or not route2:
        return 0

    proximity_count = 0
    for p1 in route1:
        for p2 in route2:
            try:
                if calculate_distance(p1, p2) <= threshold:
                    proximity_count += 1
                    break
            except Exception as e:
                logger.error(
    f"Error in calculating distance for overlap: {str(e)}")
                continue

    return (proximity_count / len(route1)) * 100 if route1 else 0


def calculate_route_overlap(
    driver_start,
    driver_end,
    rider_pickup,
    rider_dropoff,
    get_optimal_points=True,
    log_prefix=""):
    """
    Calculate the percentage of route overlap between driver and rider routes.
    """
    logger.info(f"{log_prefix}Calculating route overlap with inputs:")
    logger.info(f"{log_prefix}  Driver start: {driver_start}, Driver end: {driver_end}")
    logger.info(f"{log_prefix}  Rider pickup: {rider_pickup}, Rider dropoff: {rider_dropoff}")

    # Generate driver's route
    driver_route = generate_route(driver_start, driver_end)
    if not driver_route or len(driver_route) < 2:
        logger.error(f"{log_prefix}Failed to generate driver route")
        return {
            "compatibility_score": 0,
            "optimal_pickup_point": None,
            "optimal_dropoff_point": None
        }

    logger.info(f"{log_prefix}Successfully generated route with {len(driver_route)} points")

    # Generate rider's route
    rider_route = generate_route(rider_pickup, rider_dropoff)
    if not rider_route or len(rider_route) < 2:
        logger.error(f"{log_prefix}Failed to generate rider route")
        return {
            "compatibility_score": 0,
            "optimal_pickup_point": None,
            "optimal_dropoff_point": None
        }

    logger.info(f"{log_prefix}Successfully generated route with {len(rider_route)} points")

    # Find optimal pickup and dropoff points
    optimal_pickup_point = None
    optimal_dropoff_point = None

    if get_optimal_points:
        optimal_pickup_data = find_optimal_point(driver_route, rider_pickup)
        optimal_pickup_point = optimal_pickup_data["point"]
        pickup_sequence_index = optimal_pickup_data["index"]

        logger.info(f"{log_prefix}Calculated optimal pickup point: {optimal_pickup_point}")

        optimal_dropoff_data = find_optimal_point(driver_route, rider_dropoff)
        optimal_dropoff_point = optimal_dropoff_data["point"]
        dropoff_sequence_index = optimal_dropoff_data["index"]

        logger.info(f"{log_prefix}Calculated optimal dropoff point: {optimal_dropoff_point}")

        # SEQUENCE CHECK: Ensure pickup comes before dropoff on driver's route
        if pickup_sequence_index >= dropoff_sequence_index:
            logger.warning(
                f"{log_prefix}Invalid sequence: pickup point ({pickup_sequence_index}) must come before dropoff point ({dropoff_sequence_index})")
            return {
                "compatibility_score": 0,
                "optimal_pickup_point": None,
                "optimal_dropoff_point": None
            }

        # Minimum required segment distance (at least 20% of driver's route)
        min_segment_points = max(2, int(0.2 * len(driver_route)))
        if dropoff_sequence_index - pickup_sequence_index < min_segment_points:
            logger.warning(
                f"{log_prefix}Segment too short: only {dropoff_sequence_index - pickup_sequence_index} points between pickup and dropoff (minimum: {min_segment_points})")
            return {
                "compatibility_score": 0,
                "optimal_pickup_point": None,
                "optimal_dropoff_point": None
            }

    # Calculate direction vectors
    driver_direction = (
        driver_end[0] - driver_start[0],
        driver_end[1] - driver_start[1]
    )

    rider_direction = (
        rider_dropoff[0] - rider_pickup[0],
        rider_dropoff[1] - rider_pickup[1]
    )

    # Calculate cosine similarity between directions
    driver_magnitude = (driver_direction[0]**2 + driver_direction[1]**2)**0.5
    rider_magnitude = (rider_direction[0]**2 + rider_direction[1]**2)**0.5

    if driver_magnitude == 0 or rider_magnitude == 0:
        direction_similarity = 0
    else:
        dot_product = driver_direction[0] * rider_direction[0] + driver_direction[1] * rider_direction[1]
        direction_similarity = dot_product / (driver_magnitude * rider_magnitude)

    # Calculate direction score (0-100)
    direction_score = (direction_similarity + 1) * 50  # Convert from [-1,1] to [0,100]
    logger.info(f"{log_prefix}Direction score: {direction_score:.2f} (similarity: {direction_similarity:.2f})")

    # DIRECTION CHECK: Must be going in generally the same direction
    if direction_similarity < 0:
        logger.warning(f"{log_prefix}Incompatible directions: similarity {direction_similarity:.2f} is negative")
        return {
            "compatibility_score": 0,
            "optimal_pickup_point": None,
            "optimal_dropoff_point": None
        }

    # Calculate route coverage
    coverage_ratio = calculate_segment_overlap(driver_route, rider_route)
    coverage_score = coverage_ratio * 100
    logger.info(f"{log_prefix}Coverage score: {coverage_score:.2f} (coverage: {coverage_ratio:.2f})")

    # Calculate deviation
    deviation_score = 0
    if get_optimal_points and optimal_pickup_point and optimal_dropoff_point:
        # Calculate direct distance along original driver route
        direct_distance = sum(
            calculate_distance(driver_route[i], driver_route[i + 1])
            for i in range(min(pickup_sequence_index, len(driver_route) - 1),
                          min(dropoff_sequence_index, len(driver_route) - 1))
        )

        # Calculate distance with detour
        detour_distance = (
            calculate_distance(driver_route[pickup_sequence_index], optimal_pickup_point) +
            calculate_distance(optimal_pickup_point, rider_pickup) +
            sum(calculate_distance(rider_route[i], rider_route[i + 1]) for i in range(len(rider_route) - 1)) +
            calculate_distance(rider_dropoff, optimal_dropoff_point) +
            calculate_distance(optimal_dropoff_point, driver_route[dropoff_sequence_index])
        )

        if direct_distance > 0:
            deviation_percentage = (detour_distance - direct_distance) / direct_distance * 100
        else:
            deviation_percentage = 1000  # Arbitrary high value

        if deviation_percentage > 100:
            logger.warning(f"{log_prefix}High deviation percentage: {deviation_percentage:.2f}%")

        # DEVIATION CHECK: Maximum acceptable deviation is 200%
        if deviation_percentage > 200:
            logger.warning(f"{log_prefix}Excessive deviation: {deviation_percentage:.2f}% exceeds maximum 200%")
            return {
                "compatibility_score": 0,
                "optimal_pickup_point": None,
                "optimal_dropoff_point": None
            }

        # Calculate deviation score (0-100)
        deviation_score = max(0, 100 - min(deviation_percentage, 100))
        logger.info(f"{log_prefix}Deviation score: {deviation_score:.2f} (deviation: {deviation_percentage:.2f}%)")
    else:
        logger.info(f"{log_prefix}Deviation score: {deviation_score:.2f} (no optimal points)")

    # Calculate weighted compatibility score
    weights = {'direction': 0.4, 'coverage': 0.3, 'deviation': 0.3}
    compatibility_score = (
        weights['direction'] * direction_score +
        weights['coverage'] * coverage_score +
        weights['deviation'] * deviation_score
    )

    logger.info(f"{log_prefix}Overall compatibility score: {compatibility_score:.2f}")

    # MINIMUM COMPATIBILITY THRESHOLD: At least 60%
    if compatibility_score < 60:
        logger.warning(f"{log_prefix}Compatibility score {compatibility_score:.2f} below minimum threshold of 60")
        return {
            "compatibility_score": compatibility_score,
            "optimal_pickup_point": None,
            "optimal_dropoff_point": None
        }

    # Format the optimal points
    formatted_pickup_point = None
    formatted_dropoff_point = None

    if get_optimal_points and optimal_pickup_point and optimal_dropoff_point:
        pickup_distance = calculate_distance(optimal_pickup_point, rider_pickup)
        dropoff_distance = calculate_distance(optimal_dropoff_point, rider_dropoff)

        # MAX DISTANCE CHECK: Pickup point must be within 500 meters of requested pickup
        if pickup_distance > 500:
            logger.warning(f"{log_prefix}Pickup point too far: {pickup_distance:.2f} meters exceeds maximum 500 meters")
            return {
                "compatibility_score": compatibility_score,
                "optimal_pickup_point": None,
                "optimal_dropoff_point": None
            }

        # MAX DISTANCE CHECK: Dropoff point must be within 1000 meters of requested dropoff
        if dropoff_distance > 1000:
            logger.warning(f"{log_prefix}Dropoff point too far: {dropoff_distance:.2f} meters exceeds maximum 1000 meters")
            return {
                "compatibility_score": compatibility_score,
                "optimal_pickup_point": None,
                "optimal_dropoff_point": None
            }

        # Reverse coordinates for geocoding
        pickup_lat_lng = (optimal_pickup_point[1], optimal_pickup_point[0])
        dropoff_lat_lng = (optimal_dropoff_point[1], optimal_dropoff_point[0])

        # Get addresses for the optimal points
        pickup_address = reverse_geocode(pickup_lat_lng)
        dropoff_address = reverse_geocode(dropoff_lat_lng)

        formatted_pickup_point = {
            'longitude': optimal_pickup_point[0],
            'latitude': optimal_pickup_point[1],
            'address': pickup_address,
            'distance_from_rider': pickup_distance,
            'sequence_index': pickup_sequence_index
        }

        formatted_dropoff_point = {
            'longitude': optimal_dropoff_point[0],
            'latitude': optimal_dropoff_point[1],
            'address': dropoff_address,
            'distance_from_rider': dropoff_distance,
            'sequence_index': dropoff_sequence_index
        }

        logger.info(f"{log_prefix}Formatted optimal pickup point: {formatted_pickup_point}")
        logger.info(f"{log_prefix}Formatted optimal dropoff point: {formatted_dropoff_point}")

    logger.info(f"{log_prefix}Calculated compatibility score: {compatibility_score:.2f}")
    return {
        "compatibility_score": compatibility_score,
        "optimal_pickup_point": formatted_pickup_point,
        "optimal_dropoff_point": formatted_dropoff_point
    }


def find_point_index(route, point):
    """Find the closest index position of a point in a route"""
    if not route or not point:
        return None

    min_dist = float('inf')
    closest_idx = None

    for i, route_point in enumerate(route):
        dist = calculate_distance(route_point, point)
        if dist < min_dist:
            min_dist = dist
            closest_idx = i

    return closest_idx


def calculate_direction_vector(start, end):
    """Calculate a normalized direction vector between start and end points"""
    if not start or not end:
        return (0, 0)

    dx = end[0] - start[0]
    dy = end[1] - start[1]

    # Normalize the vector
    magnitude = math.sqrt(dx * dx + dy * dy)
    if magnitude > 0:
        return (dx / magnitude, dy / magnitude)
    else:
        return (0, 0)


def calculate_vector_similarity(vec1, vec2):
    """Calculate the cosine similarity between two vectors (dot product of normalized vectors)"""
    if not vec1 or not vec2:
        return 0

    # Dot product
    dot_product = vec1[0] * vec2[0] + vec1[1] * vec2[1]

    # Clamp to [-1, 1] range to handle floating point errors
    return max(-1, min(1, dot_product))


def generate_route(start_coords, end_coords, max_retries=3, retry_delay=2):
    """
    Generate a route between two points using OpenRouteService API.
    Returns a list of coordinates along the route.
    """
    if not start_coords or not end_coords:
        logger.error("Missing coordinates for route generation")
        return None

    # Check if API key is available
    if not ORS_API_KEY:
        logger.error("OpenRouteService API key not configured, using fallback method")
        return generate_fallback_route(start_coords, end_coords)

    # Ensure coordinates are in the correct format (lng, lat)
    start_lng, start_lat = start_coords
    end_lng, end_lat = end_coords

    # Validate coordinates
    if not all(isinstance(x, (int, float)) for x in [start_lng, start_lat, end_lng, end_lat]):
        logger.error(f"Invalid coordinate values: start={start_coords}, end={end_coords}")
        return None

    # Construct the API request
    url = f"{OPENROUTE_BASE_URL}/directions/driving-car"
    headers = {
        'Authorization': ORS_API_KEY,
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
    }
    params = {
        'start': f"{start_lng},{start_lat}",
        'end': f"{end_lng},{end_lat}"
    }

    # Try the API request with retries
    for attempt in range(max_retries):
        try:
            logger.info(f"Calling OpenRouteService directions API (attempt {attempt + 1}/{max_retries}) for route from ({start_lng}, {start_lat}) to ({end_lng}, {end_lat})")

            response = requests.get(url, headers=headers, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                if 'features' in data and data['features']:
                    # Extract coordinates from the route
                    coordinates = data['features'][0]['geometry']['coordinates']
                    logger.info(f"Successfully generated route with {len(coordinates)} points")
                    return coordinates
                else:
                    logger.warning("No features found in directions API response")
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay)
                        continue
            elif response.status_code == 403:
                logger.error("OpenRouteService API key rejected (403 Forbidden)")
                return generate_fallback_route(start_coords, end_coords)
            elif response.status_code == 429:  # Rate limit
                retry_after = int(response.headers.get('Retry-After', retry_delay))
                logger.warning(f"Rate limited by OpenRouteService, retrying after {retry_after} seconds")
                time.sleep(retry_after)
                continue
            else:
                logger.error(f"OpenRouteService API error: {response.status_code} - {response.text}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error in generate_route: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
        
    # If all retries failed, use fallback method
    logger.warning("OpenRouteService APIs failed or not accessible, using straight line fallback method")
    return generate_fallback_route(start_coords, end_coords)


def generate_fallback_route(start_coords, end_coords, num_points=10):
    """Generate a fallback route using straight line interpolation"""
    logger.warning("IMPORTANT: Using straight line approximation which may not reflect actual roads")
    logger.info("Using fallback route generation method (straight line with enhancements)")

    start_lng, start_lat = start_coords
    end_lng, end_lat = end_coords

    # Calculate intermediate points
    route = []
    for i in range(num_points + 1):
        t = i / num_points
        lng = start_lng + t * (end_lng - start_lng)
        lat = start_lat + t * (end_lat - start_lat)
        route.append([lng, lat])

    return route

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
        """Get rides for the current user"""
        # Mark past rides as complete before returning the queryset
        mark_past_rides_complete()
        
        user = self.request.user
        logger.info(f"Getting rides for user: {user.username}, type: {getattr(user, 'user_type', 'unknown')}")
        
        # For drivers, show only their rides
        if hasattr(user, 'user_type') and user.user_type == 'DRIVER':
            logger.info("User is a driver, returning driver's rides")
            return Ride.objects.filter(driver=user)
        
        # For riders, show all available rides and rides they're part of
        logger.info("User is a rider, returning available rides and rides they're part of")
        return Ride.objects.filter(
            Q(status='SCHEDULED') &  # Only show scheduled rides
            Q(departure_time__gte=timezone.now()) &  # Only future rides
            Q(available_seats__gt=0)  # With available seats
        ).exclude(driver=user).distinct()

    @staticmethod
    def check_pending_requests(new_ride):
        """
        Check for pending requests that might match available rides and propose the best match.
        This method is called when a new ride is created.
        """
        try:
            # Find pending requests that might match rides
            pending_requests = PendingRideRequest.objects.filter(
                status='PENDING',
                departure_time__gte=timezone.now()
            )

            logger.info(f"Checking {pending_requests.count()} pending requests against available rides")

            # For each pending request, find the best matching ride
            for pending_request in pending_requests:
                logger.info(f"Checking pending request ID: {pending_request.id} from {pending_request.rider.username}")

                # Get all available rides (including the new one)
                available_rides = Ride.objects.filter(
                    status='SCHEDULED',
                    departure_time__gte=timezone.now(),
                    available_seats__gte=pending_request.seats_needed
                # Rider can't match with their own ride
                ).exclude(driver=pending_request.rider)

                logger.info(f"Found {available_rides.count()} available rides to check for pending request {pending_request.id}")

                # Variables to track the best match
                best_match = None
                best_score = 0
                best_compatibility = None

                # Check each ride for compatibility
                for ride in available_rides:
                    # Calculate route overlap
                    overlap_result = calculate_route_overlap(
                        (ride.start_longitude, ride.start_latitude),
                        (ride.end_longitude, ride.end_latitude),
                        (pending_request.pickup_longitude, pending_request.pickup_latitude),
                        (pending_request.dropoff_longitude, pending_request.dropoff_latitude),
                        get_optimal_points=True,
                        log_prefix=f"[Pending Request {pending_request.id} - Ride {ride.id}] "
                    )

                    compatibility_score = overlap_result.get(
                        "compatibility_score", 0)

                    # If compatible and better than current best match
                    if (compatibility_score >= 60 and  # Minimum 60% compatibility required
                        compatibility_score > best_score and
                        overlap_result.get("optimal_pickup_point") and
                        overlap_result.get("optimal_dropoff_point")):

                        best_match = ride
                        best_score = compatibility_score
                        best_compatibility = overlap_result
                        logger.info(f"Found better match: Ride {ride.id} with score {compatibility_score:.2f}")

                # If we found a good match
                if best_match and best_score >= 60:
                    logger.info(f"Found best match: Ride {best_match.id} with score {best_score:.2f}")

                    # Update the pending request
                    pending_request.status = 'MATCH_PROPOSED'
                    pending_request.proposed_ride = best_match
                    pending_request.save()

                    # Get optimal points from the best match
                    optimal_pickup = best_compatibility.get(
                        "optimal_pickup_point")
                    optimal_dropoff = best_compatibility.get(
                        "optimal_dropoff_point")

                    # Create notification for the rider
                    notification_message = (
                        f"We found a potential ride match from {pending_request.pickup_location} to "
                        f"{pending_request.dropoff_location} with driver {best_match.driver.get_full_name()}"
                    )

                    notification = Notification.objects.create(
                        recipient=pending_request.rider,
                        notification_type='MATCH_PROPOSED',
                        message=notification_message,
                        pending_request=pending_request,
                        ride=best_match
                    )
                    logger.info(f"Created notification {notification.id} for pending request {pending_request.id}")
                else:
                    logger.info(f"No suitable match found for pending request {pending_request.id}")

        except Exception as e:
            logger.error(f"Error checking pending requests: {str(e)}")
            logger.exception("Full exception details:")

    def create(self, request, *args, **kwargs):
        """Create a new ride"""
        # Validate request data
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create the ride
        try:
            # Pass the driver to serializer.save() instead of in request.data
            ride = serializer.save(driver=request.user)
            
            # Check for pending requests that might match this ride
            self.check_pending_requests(ride)

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Error creating ride: {str(e)}")
            return Response(
                {"error": "Failed to create ride"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def pending_status(self, request):
        """Check if a pending ride request has been matched"""
        try:
            pending_request_id = request.query_params.get('pending_request_id')
            if not pending_request_id:
                return Response(
                    {"error": "pending_request_id is required"}, status=status.HTTP_400_BAD_REQUEST)

            pending_request = get_object_or_404(
    PendingRideRequest, id=pending_request_id)
            
            # Verify the user is the rider
            if pending_request.rider != request.user:
                raise PermissionDenied("You can only check status of your own ride requests")

            # Get any new notifications for this request
            notifications = Notification.objects.filter(
                recipient=request.user,
                pending_request=pending_request,
                is_read=False
            ).order_by('-created_at')

            # Calculate optimal pickup and dropoff points if there's a match
            optimal_pickup_point = None
            optimal_dropoff_point = None
            compatibility_score = 0
            
            if pending_request.status == 'MATCH_PROPOSED' and pending_request.proposed_ride:
                try:
                    # Get coordinates for rider and driver
                    driver_start = (pending_request.proposed_ride.start_longitude, pending_request.proposed_ride.start_latitude)
                    driver_end = (pending_request.proposed_ride.end_longitude, pending_request.proposed_ride.end_latitude)
                    rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                    rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                    
                    # Calculate route overlap which returns optimal points
                    overlap_result = calculate_route_overlap(
                        driver_start, driver_end, rider_pickup, rider_dropoff
                    )
                    compatibility_score = overlap_result.get("compatibility_score", 0)
                    optimal_pickup_point = overlap_result.get("optimal_pickup_point")
                    optimal_dropoff_point = overlap_result.get("optimal_dropoff_point")

                except Exception as e:
                    logger.error(f"Error calculating optimal points: {str(e)}")

            return Response({
                "status": pending_request.status,
                "has_match": pending_request.status == 'MATCH_PROPOSED',
                "match_details": {
                    "ride_id": pending_request.proposed_ride.id if pending_request.proposed_ride else None,
                    "driver_name": pending_request.proposed_ride.driver.get_full_name() if pending_request.proposed_ride else None,
                    "pickup": pending_request.pickup_location,
                    "dropoff": pending_request.dropoff_location,
                    "departure_time": pending_request.departure_time.isoformat() if pending_request.departure_time else None,
                    "optimal_pickup_point": optimal_pickup_point,
                    "optimal_dropoff_point": optimal_dropoff_point,
                    "compatibility_score": compatibility_score
                } if pending_request.status == 'MATCH_PROPOSED' else None,
                "notifications": NotificationSerializer(notifications, many=True).data
            })

        except Exception as e:
            logger.error(f"Error checking pending status: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def complete_past_rides(self, request):
        """Manually trigger marking past rides as complete"""
        try:
            mark_past_rides_complete()
            count = Ride.objects.filter(status='COMPLETED').count()
            return Response({
                "status": "success",
                "message": "Past rides have been marked as complete",
                "completed_rides_count": count
            })
        except Exception as e:
            logger.error(f"Error completing past rides: {str(e)}")
            return Response(
                {"error": f"Error completing past rides: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RideRequestViewSet(viewsets.ModelViewSet):
    queryset = RideRequest.objects.all()
    serializer_class = RideRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Mark past rides as complete
        mark_past_rides_complete()
        
        user = self.request.user
        # Return all ride requests for this user
        return RideRequest.objects.filter(rider=user)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def accepted(self, request):
        """
        Get all accepted ride requests for the current user (both as rider and driver)
        """
        try:
            # Mark past rides as complete before retrieving the list
            mark_past_rides_complete()
            
            # Log detailed information for debugging
            logger.info(
                f"Fetching accepted rides for user: {request.user.username} (ID: {request.user.id})")

            # Use Q objects to get rides where the user is either the rider or driver
            from django.db.models import Q
            ride_requests = RideRequest.objects.filter(
                Q(rider=request.user) | Q(ride__driver=request.user),
                status__in=['ACCEPTED', 'COMPLETED']
            ).select_related(
                'ride',
                'ride__driver',
                'rider'
            ).order_by('-departure_time')

            logger.info(f"Found {ride_requests.count()} accepted rides")

            # Serialize the ride requests
            serializer = RideRequestSerializer(ride_requests, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.error(f"Error fetching accepted rides: {str(e)}")
            return Response(
                {"error": f"Error fetching accepted rides: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    def create(self, request):
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
    
            # Debug logging
            logger.info(f"Creating ride request for user: {request.user.id} - {request.user.username}")

            # Get selected ride
            selected_ride_id = serializer.validated_data.get('ride')
            selected_ride = None
            if selected_ride_id:
                try:
                    selected_ride = Ride.objects.get(id=selected_ride_id.id)
                except Ride.DoesNotExist:
                    logger.warning(f"Selected ride with ID {selected_ride_id} does not exist")

            # Process standalone request
            if not selected_ride_id and not serializer.validated_data.get('pickup_longitude'):
                ride_request = serializer.save()
                ride_request.rider = request.user
                ride_request.save()
                return Response({
                    'status': 'success',
                    'message': 'Your ride request has been saved.'
                }, status=status.HTTP_201_CREATED)

            # Find best match logic
            available_rides = Ride.objects.filter(
                status='SCHEDULED',
                departure_time__gte=timezone.now(),
                available_seats__gte=serializer.validated_data.get('seats_needed', 1)
            ).exclude(driver=request.user)

            best_match = None
            best_score = 0
            COMPATIBILITY_THRESHOLD = 60

            for ride in available_rides:
                if None in (ride.start_longitude, ride.start_latitude, ride.end_longitude, ride.end_latitude):
                    continue

                compatibility_result = calculate_route_overlap(
                    driver_start=(ride.start_longitude, ride.start_latitude),
                    driver_end=(ride.end_longitude, ride.end_latitude),
                    rider_pickup=(
                        float(serializer.validated_data['pickup_longitude']), 
                        float(serializer.validated_data['pickup_latitude'])
                    ),
                    rider_dropoff=(
                        float(serializer.validated_data['dropoff_longitude']), 
                        float(serializer.validated_data['dropoff_latitude'])
                    ),
                    get_optimal_points=True,
                    log_prefix=f"[Ride {ride.id}] "
                )

                compatibility_score = compatibility_result.get('compatibility_score', 0)
                if compatibility_score > best_score and compatibility_score >= COMPATIBILITY_THRESHOLD:
                    best_match = ride
                    best_score = compatibility_score

            # Handle no match found
            if not best_match:
                target_ride = selected_ride or available_rides.first()
                if not target_ride:
                    return Response({
                        'status': 'error',
                        'error': 'No available rides found.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                ride_request = RideRequest(
                    ride=target_ride,
                    rider=request.user,
                    pickup_location=serializer.validated_data['pickup_location'],
                    dropoff_location=serializer.validated_data['dropoff_location'],
                    pickup_latitude=serializer.validated_data['pickup_latitude'],
                    pickup_longitude=serializer.validated_data['pickup_longitude'],
                    dropoff_latitude=serializer.validated_data['dropoff_latitude'],
                    dropoff_longitude=serializer.validated_data['dropoff_longitude'],
                    departure_time=serializer.validated_data['departure_time'],
                    seats_needed=serializer.validated_data.get('seats_needed', 1),
                    status='PENDING'
                )
                ride_request.save()
                return Response({
                    'status': 'error',
                    'has_match': False,
                    'error': 'No suitable matching rides found. Your request has been saved and will be matched when a compatible ride becomes available.'
                }, status=status.HTTP_200_OK)

            # Create accepted request
            ride = best_match
            optimal_pickup_point = compatibility_result.get('optimal_pickup_point')
            optimal_dropoff_point = compatibility_result.get('optimal_dropoff_point')
            compatibility_score = best_score

            ride_request = RideRequest(
                ride=ride,
                rider=request.user,
                pickup_location=serializer.validated_data['pickup_location'],
                dropoff_location=serializer.validated_data['dropoff_location'],
                pickup_latitude=serializer.validated_data['pickup_latitude'],
                pickup_longitude=serializer.validated_data['pickup_longitude'],
                dropoff_latitude=serializer.validated_data['dropoff_latitude'],
                dropoff_longitude=serializer.validated_data['dropoff_longitude'],
                departure_time=serializer.validated_data['departure_time'],
                seats_needed=serializer.validated_data.get('seats_needed', 1),
                status='ACCEPTED',
                optimal_pickup_point=optimal_pickup_point,
                nearest_dropoff_point=optimal_dropoff_point
            )
            ride_request.save()

            # Update ride seats
            if ride.available_seats > 0:
                ride.available_seats -= serializer.validated_data.get('seats_needed', 1)
                ride.save()
                
                if ride.available_seats <= 0:
                    ride.status = 'FULL'
                    ride.save()

            # Create notification
            Notification.objects.create(
                recipient=ride.driver,
                notification_type='RIDE_REQUEST',
                message=f"{request.user.username} has requested to join your ride.",
                ride_request=ride_request
            )
    
            # Create map URL
            def format_coord(coord):
                return f"{coord[1]},{coord[0]}" if isinstance(coord, tuple) else f"{coord['latitude']},{coord['longitude']}"

            driver_start = (ride.start_longitude, ride.start_latitude)
            driver_end = (ride.end_longitude, ride.end_latitude)
            rider_pickup = (
                serializer.validated_data['pickup_longitude'],
                serializer.validated_data['pickup_latitude']
            )
            rider_dropoff = (
                serializer.validated_data['dropoff_longitude'],
                serializer.validated_data['dropoff_latitude']
            )

            map_url = "https://www.openstreetmap.org/directions?"
            if optimal_pickup_point and 'latitude' in optimal_pickup_point and 'longitude' in optimal_pickup_point:
                map_url += f"route={format_coord(driver_start)};{format_coord(optimal_pickup_point)};{format_coord(optimal_dropoff_point)};{format_coord(driver_end)}"
            else:
                map_url += f"route={format_coord(driver_start)};{format_coord(rider_pickup)};{format_coord(rider_dropoff)};{format_coord(driver_end)}"

            return Response({
                'status': 'success',
                'message': 'Ride request created successfully.',
                'has_match': True,
                'match_details': {
                    'ride_id': ride.id,
                    'driver': {
                        'id': ride.driver.id,
                        'username': ride.driver.username,
                        'first_name': ride.driver.first_name,
                        'last_name': ride.driver.last_name,
                        'profile_image': ride.driver.profile.profile_image.url if hasattr(ride.driver, 'profile') and ride.driver.profile and ride.driver.profile.profile_image else None
                    },
                    'vehicle': {
                        'make': ride.driver.vehicle_make if hasattr(ride.driver, 'vehicle_make') else 'Not specified',
                        'model': ride.driver.vehicle_model if hasattr(ride.driver, 'vehicle_model') else 'Not specified',
                        'color': ride.driver.vehicle_color if hasattr(ride.driver, 'vehicle_color') else 'Not specified',
                        'license_plate': ride.driver.license_plate if hasattr(ride.driver, 'license_plate') else 'Not specified'
                    },
                    'optimal_pickup_point': optimal_pickup_point,
                    'optimal_dropoff_point': optimal_dropoff_point,
                    'compatibility_score': compatibility_score,
                    'departure_time': ride.departure_time,
                    'map_url': map_url
                }
            }, status=status.HTTP_201_CREATED)
    
        except Exception as e:
            logger.error(f"Failed to create ride request: {str(e)}")
            return Response({"error": f"Failed to create ride request: {str(e)}"},
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def accept_match(self, request):
        try:
            pending_request_id = request.data.get('pending_request_id')
            if not pending_request_id:
                return Response({"error": "pending_request_id required"}, status=400)

            try:
                pending_request = PendingRideRequest.objects.get(id=pending_request_id)
                if pending_request.rider != request.user:
                    raise PermissionDenied()

                if pending_request.status != 'MATCH_PROPOSED':
                    return Response({"error": "Invalid status"}, status=400)

                proposed_ride = pending_request.proposed_ride
                if not proposed_ride:
                    return Response({"error": "No proposed ride found"}, status=400)
                
                # Calculate optimal points
                optimal_pickup_point = None
                optimal_dropoff_point = None
                compatibility_score = 0
            
                try:
                    driver_start = (pending_request.proposed_ride.start_longitude, pending_request.proposed_ride.start_latitude)
                    driver_end = (pending_request.proposed_ride.end_longitude, pending_request.proposed_ride.end_latitude)
                    rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                    rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                    
                    overlap_result = calculate_route_overlap(
                        driver_start, driver_end, rider_pickup, rider_dropoff
                    )
                    compatibility_score = overlap_result.get("compatibility_score", 0)
                    optimal_pickup_point = overlap_result.get("optimal_pickup_point")
                    optimal_dropoff_point = overlap_result.get("optimal_dropoff_point")
                except Exception as e:
                    logger.error(f"Error calculating points: {str(e)}")

                # Create ride request
                ride_request = RideRequest.objects.create(
                    rider=pending_request.rider,
                    ride=pending_request.proposed_ride,
                    pickup_location=pending_request.pickup_location,
                    dropoff_location=pending_request.dropoff_location,
                    pickup_latitude=pending_request.pickup_latitude,
                    pickup_longitude=pending_request.pickup_longitude,
                    dropoff_latitude=pending_request.dropoff_latitude,
                    dropoff_longitude=pending_request.dropoff_longitude,
                    departure_time=pending_request.departure_time,
                    seats_needed=pending_request.seats_needed,
                    status='ACCEPTED',
                    optimal_pickup_point=optimal_pickup_point,
                    nearest_dropoff_point=optimal_dropoff_point
                )

                # Update pending request
                pending_request.status = 'MATCHED'
                pending_request.matched_ride_request = ride_request
                pending_request.save()

                # Update seats
                with transaction.atomic():
                    proposed_ride.refresh_from_db()
                    proposed_ride.available_seats -= pending_request.seats_needed
                    proposed_ride.save()
                    
                    if proposed_ride.available_seats <= 0:
                        proposed_ride.status = 'FULL'
                        proposed_ride.save()

                # Create notifications
                try:
                    create_match_notifications(ride_request)
                    send_ride_match_emails(ride_request)
                except Exception as e:
                    logger.error(f"Error with notifications: {str(e)}")

                return Response({
                    "status": "success",
                    "message": "Match accepted successfully",
                    "ride_request": RideRequestSerializer(ride_request).data,
                    "match_details": {
                        "ride_id": proposed_ride.id,
                        "driver_name": proposed_ride.driver.get_full_name(),
                        "driver_id": proposed_ride.driver.id,
                        "pickup": pending_request.pickup_location,
                        "dropoff": pending_request.dropoff_location,
                        "departure_time": proposed_ride.departure_time.isoformat() if proposed_ride.departure_time else None,
                        "optimal_pickup_point": optimal_pickup_point,
                        "optimal_dropoff_point": optimal_dropoff_point,
                        "compatibility_score": compatibility_score
                    }
                })

            except PendingRideRequest.DoesNotExist:
                try:
                    ride_request = RideRequest.objects.get(id=pending_request_id)
                    if ride_request.rider != request.user:
                        raise PermissionDenied()

                    if ride_request.status == 'ACCEPTED':
                        return Response({
                            "status": "success",
                            "message": "This ride request is already accepted",
                            "ride_request": RideRequestSerializer(ride_request).data
                        })
                    
                    ride_request.status = 'ACCEPTED'
                    ride_request.save()
                    
                    Notification.objects.create(
                        recipient=ride_request.rider,
                        notification_type='RIDE_ACCEPTED',
                        message=f"Your ride request from {ride_request.pickup_location} to {ride_request.dropoff_location} has been accepted",
                        ride_request=ride_request
                    )
                    
                    return Response({
                        "status": "success",
                        "message": "Ride request accepted successfully",
                        "ride_request": RideRequestSerializer(ride_request).data
                    })

                except RideRequest.DoesNotExist:
                    return Response(
                        {"error": f"No ride request found with ID {pending_request_id}"},
                        status=status.HTTP_404_NOT_FOUND
                    )

        except Exception as e:
            logger.error(f"Error accepting match: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def reject_match(self, request):
        """Reject a proposed ride match"""
        try:
            pending_request_id = request.data.get('pending_request_id')
            if not pending_request_id:
                return Response({"error": "pending_request_id is required"}, status=status.HTTP_400_BAD_REQUEST)

            pending_request = get_object_or_404(PendingRideRequest, id=pending_request_id)
            
            # Verify the user is the rider
            if pending_request.rider != request.user:
                raise PermissionDenied("You can only reject your own ride requests")

            # Check if the request is in MATCH_PROPOSED state
            if pending_request.status != 'MATCH_PROPOSED':
                return Response(
                    {"error": "This request is not in a state to be rejected"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Update the pending request status
            pending_request.status = 'REJECTED'
            pending_request.save()

            # Create a notification for the rider
            Notification.objects.create(
                recipient=pending_request.rider,
                notification_type='RIDE_REJECTED',
                message=f"You have rejected the proposed ride match for your request from {pending_request.pickup_location} to {pending_request.dropoff_location}",
                pending_request=pending_request
            )

            return Response({
                "status": "success",
                "message": "Match rejected successfully"
            })

        except Exception as e:
            logger.error(f"Error rejecting match: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user).order_by('-created_at')

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({"status": "success"})

    @action(detail=False, methods=['post'])
    def mark_all_as_read(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"status": "success"})

def mark_past_rides_complete():
    """Mark rides as complete if their departure time has passed"""
    try:
        now = timezone.now()
        past_rides = Ride.objects.filter(
            status__in=['SCHEDULED', 'AVAILABLE'],
            departure_time__lt=now
        )
        past_rides.update(status='COMPLETED')
        
        # Update associated ride requests
        RideRequest.objects.filter(
            ride__in=past_rides,
            status__in=['PENDING', 'ACCEPTED']
        ).update(status='COMPLETED')
        
    except Exception as e:
        logger.error(f"Error marking past rides as complete: {str(e)}")

def mark_expired_pending_requests():
    """Mark pending ride requests as expired if their departure time has passed"""
    try:
        now = timezone.now()
        expired_requests = PendingRideRequest.objects.filter(
            status__in=['PENDING', 'MATCH_PROPOSED'],
            departure_time__lt=now
        )
        expired_requests.update(status='EXPIRED')
        
    except Exception as e:
        logger.error(f"Error marking expired pending requests: {str(e)}")

def fix_notification_field_names():
    """
    One-time fix for notification field names. 
    Migrates any notifications that use 'user' field to 'recipient' field.
    This should be run as a management command, not on module import.
    """
    try:
        from django.db import connection
        if not connection.is_usable():
            logger.warning("Database connection is not usable, skipping notification field fix")
            return

        with connection.cursor() as cursor:
            # Check if 'user' column exists in the notifications table
            cursor.execute("""
                SELECT COUNT(*) 
                FROM information_schema.columns 
                WHERE table_name='rides_notification' AND column_name='user_id'
            """)
            if cursor.fetchone()[0] > 0:
                # Migrate data from user_id to recipient_id
                cursor.execute("""
                    UPDATE rides_notification 
                    SET recipient_id = user_id 
                    WHERE recipient_id IS NULL AND user_id IS NOT NULL
                """)
                logger.info("Successfully migrated notification field names from user to recipient")
    except Exception as e:
        logger.warning(f"Could not fix notification field names: {str(e)}")
        # Don't raise the exception, just log it
        return

# Remove the automatic execution on module import
# fix_notification_field_names()

def send_ride_match_emails(ride_request):
    """
    Send email notifications to both rider and driver about a ride match.
    
    Args:
        ride_request: The RideRequest that was created
        
    Returns:
        None
    """
    try:
        # Get all the necessary data
        ride = ride_request.ride
        rider = ride_request.rider
        driver = ride.driver
        
        # Extract optimal pickup and dropoff information
        optimal_pickup_info = None
        optimal_dropoff_info = None
        
        if ride_request.optimal_pickup_point:
            if isinstance(ride_request.optimal_pickup_point, dict):
                optimal_pickup_info = ride_request.optimal_pickup_point
            elif isinstance(ride_request.optimal_pickup_point, str):
                try:
                    optimal_pickup_info = json.loads(ride_request.optimal_pickup_point)
                except JSONDecodeError:
                    logger.error("Failed to parse optimal_pickup_point JSON")
        
        if ride_request.nearest_dropoff_point:
            if isinstance(ride_request.nearest_dropoff_point, dict):
                optimal_dropoff_info = ride_request.nearest_dropoff_point
            elif isinstance(ride_request.nearest_dropoff_point, str):
                try:
                    optimal_dropoff_info = json.loads(ride_request.nearest_dropoff_point)
                except JSONDecodeError:
                    logger.error("Failed to parse nearest_dropoff_point JSON")
        
        # Format pickup and dropoff information
        pickup_details = ""
        if optimal_pickup_info:
            address = optimal_pickup_info.get('address', 'Address unavailable')
            lat = optimal_pickup_info.get('latitude')
            lng = optimal_pickup_info.get('longitude')
            distance = optimal_pickup_info.get('distance_from_rider')
            
            distance_text = f"{distance:.2f} meters" if distance else "N/A"
            
            pickup_details = f"""
Optimal Pickup Point:
- Address: {address}
- Coordinates: {lat}, {lng}
- Distance from requested pickup: {distance_text}
- Maps Link: https://www.google.com/maps/search/?api=1&query={lat},{lng}
"""
        
        dropoff_details = ""
        if optimal_dropoff_info:
            address = optimal_dropoff_info.get('address', 'Address unavailable')
            lat = optimal_dropoff_info.get('latitude')
            lng = optimal_dropoff_info.get('longitude')
            distance = optimal_dropoff_info.get('distance_from_rider')
            
            distance_text = f"{distance:.2f} meters" if distance else "N/A"
            
            dropoff_details = f"""
Optimal Dropoff Point:
- Address: {address}
- Coordinates: {lat}, {lng}
- Distance from requested dropoff: {distance_text}
- Maps Link: https://www.google.com/maps/search/?api=1&query={lat},{lng}
"""
        
        # Try to get vehicle information directly from driver
        vehicle_make = getattr(driver, 'vehicle_make', 'Not specified')
        vehicle_model = getattr(driver, 'vehicle_model', 'Not specified')
        vehicle_color = getattr(driver, 'vehicle_color', 'Not specified')
        license_plate = getattr(driver, 'license_plate', 'Not specified')
        
        # Format the departure time
        departure_time_str = 'Not specified'
        if ride.departure_time:
            try:
                departure_time_str = ride.departure_time.strftime('%m/%d/%Y at %I:%M %p')
            except Exception as e:
                logger.error(f"Error formatting departure time: {str(e)}")
                departure_time_str = str(ride.departure_time)
        
        # Compose rider email
        rider_subject = f"Your ride request has been matched!"
        rider_message = f"""
Hello {rider.first_name},

Great news! Your ride request has been matched with a driver.

Ride Details:
- Driver: {driver.first_name} {driver.last_name}
- From: {ride_request.pickup_location}
- To: {ride_request.dropoff_location}
- Date/Time: {departure_time_str}
- Vehicle: {vehicle_make} {vehicle_model}, {vehicle_color}
- License Plate: {license_plate}

{pickup_details}
{dropoff_details}

Driver Contact: {driver.email}

Please be at the pickup location on time. Safe travels!

Best regards,
The Ridex Team
"""
        
        # Compose driver email
        driver_subject = f"A rider has been matched with your ride"
        driver_message = f"""
Hello {driver.first_name},

A rider has been matched with your ride.

Ride Details:
- Rider: {rider.first_name} {rider.last_name}
- From: {ride.start_location}
- To: {ride.end_location}
- Date/Time: {departure_time_str}
- Pickup Location: {ride_request.pickup_location}
- Dropoff Location: {ride_request.dropoff_location}

{pickup_details}
{dropoff_details}

Rider Contact: {rider.email}

Have a safe trip!

Best regards,
The Ridex Team
"""
        
        # Send emails - wrap in try-except to handle email sending errors
        try:
            from django.core.mail import send_mail
            
            # Send to rider
            send_mail(
                subject=rider_subject,
                message=rider_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[rider.email],
                fail_silently=True,  # Don't raise exceptions on email failure
            )
            logger.info(f"Sent match notification email to rider {rider.email}")
            
            # Send to driver
            send_mail(
                subject=driver_subject,
                message=driver_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[driver.email],
                fail_silently=True,  # Don't raise exceptions on email failure
            )
            logger.info(f"Sent match notification email to driver {driver.email}")
        except Exception as e:
            logger.error(f"Error sending emails: {str(e)}")
            # Continue with the request even if email sending fails
        
    except Exception as e:
        logger.error(f"Error sending ride match emails: {str(e)}")
        logger.exception("Full exception details")

def check_destination_compatibility(driver_start_coords, driver_end_coords, destination_query):
    """
    Check if a destination is compatible with a driver's route.
    Returns (is_compatible, geocoded_address)
    """
    try:
        logger.info(f"Checking if destination '{destination_query}' is compatible with route from {driver_start_coords} to {driver_end_coords}")
        
        # Geocode the destination query
        API_URL = "https://api.openrouteservice.org/geocode/search"
        headers = {
            'Authorization': ORS_API_KEY
        }
        params = {
            'text': destination_query,
            'size': 1,  # Limit to 1 result for best match
            'boundary.country': 'US'  # Limit to the US
        }
        
        # Use query parameters in the API request
        response = requests.get(API_URL, headers=headers, params=params)
        
        # If the API call is successful, parse the results
        if response.status_code == 200:
            data = response.json()
            if 'features' in data and data['features']:
                # Get the coordinates from the API response
                coordinates = data['features'][0]['geometry']['coordinates']
                
                # Calculate route compatibility using OpenRouteService results
                result = calculate_route_overlap(
                    driver_start_coords, driver_end_coords, coordinates[0], coordinates[-1]
                )
                compatibility_score = result.get('compatibility_score', 0)
                optimal_pickup_point = result.get('optimal_pickup_point')
                optimal_dropoff_point = result.get('optimal_dropoff_point')
                
                # Check if this route is compatible enough with the driver's route
                if compatibility_score >= 60:  # Minimum 60 out of 100 compatibility score required
                    geocoded_address = data['features'][0]['properties']['label']
                    logger.info(f"Found compatible route to {geocoded_address} with score {compatibility_score:.2f}")
                    return True, geocoded_address
                else:
                    logger.warning(f"Route has low compatibility score: {compatibility_score:.2f}")
        else:
            logger.error(f"Error from geocoding API: {response.status_code} - {response.text}")
            
    except Exception as e:
        logger.error(f"Error in check_destination_compatibility: {str(e)}")
        logger.exception("Exception details:")
        
    return False, None