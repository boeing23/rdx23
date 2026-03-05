import requests
from django.conf import settings
from typing import Tuple, Dict, Any
import logging
from math import radians, sin, cos, sqrt, atan2
from geopy.distance import great_circle
import uuid
import time
import json
from django.db import connection

logger = logging.getLogger(__name__)

def get_route_details(
    start_coords: Tuple[float, float],
    end_coords: Tuple[float, float]
) -> Dict[str, Any]:
    """
    Get route details between two points using OpenRouteService.
    """
    url = "https://api.openrouteservice.org/v2/directions/driving-car"
    
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, application/geo+json'
    }
    
    params = {
        'api_key': settings.GEOCODING_API_KEY,
        'start': f"{start_coords[0]},{start_coords[1]}",
        'end': f"{end_coords[0]},{end_coords[1]}"
    }

    logger.info(f"GET_ROUTE_DETAILS: start=({start_coords}), end=({end_coords})")
    logger.info(f"Calling ORS API at {url} with params: {params}")
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=15)
        logger.info(f"ORS Response Status: {response.status_code}")
        response.raise_for_status()
        data = response.json()
        
        if 'features' in data and len(data['features']) > 0:
            route = data['features'][0]
            properties = route['properties']
            geometry = route['geometry']
            
            return {
                'distance': properties.get('segments', [{}])[0].get('distance', 0),
                'duration': properties.get('segments', [{}])[0].get('duration', 0),
                'geometry': geometry['coordinates'],
                'steps': properties.get('segments', [{}])[0].get('steps', [])
            }
        else:
            logger.error("No route found in response.")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"OpenRouteService error: {str(e)}")
        return None


def format_duration(seconds: float) -> str:
    """
    Format duration in seconds to a human-readable string.
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    
    if hours > 0:
        return f"{hours} hour{'s' if hours != 1 else ''} {minutes} min"
    return f"{minutes} min"

def format_distance(meters: float) -> str:
    """
    Format distance in meters to a human-readable string in miles.
    """
    miles = meters * 0.000621371
    return f"{miles:.1f} miles"

def is_route_compatible(
    route1_start: Tuple[float, float],
    route1_end: Tuple[float, float],
    route2_start: Tuple[float, float],
    route2_end: Tuple[float, float],
    max_detour_percent: float = 30.0
) -> bool:
    """
    Check if two routes are compatible for carpooling.
    
    Args:
        route1_start: Start coordinates of the first route (driver)
        route1_end: End coordinates of the first route (driver)
        route2_start: Start coordinates of the second route (rider)
        route2_end: End coordinates of the second route (rider)
        max_detour_percent: Maximum allowed detour percentage (default 30%)
        
    Returns:
        Boolean indicating whether the routes are compatible
    """
    # Get original route details
    original_route = get_route_details(route1_start, route1_end)
    if not original_route:
        return False
    
    original_distance = original_route['distance']
    
    # Calculate route with pickup and dropoff
    pickup_route = get_route_details(route1_start, route2_start)
    if not pickup_route:
        return False
        
    main_route = get_route_details(route2_start, route2_end)
    if not main_route:
        return False
        
    dropoff_route = get_route_details(route2_end, route1_end)
    if not dropoff_route:
        return False
    
    # Calculate total distance with detour
    detour_distance = (
        pickup_route['distance'] +
        main_route['distance'] +
        dropoff_route['distance']
    )
    
    # Calculate detour percentage
    detour_percent = ((detour_distance - original_distance) / original_distance) * 100
    
    return detour_percent <= max_detour_percent 

def get_road_distance(start_lat, start_lon, end_lat, end_lon):
    """Get road distance between two points using OSRM."""
    try:
        url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}?overview=false"
        response = requests.get(url)
        if response.status_code == 200:
            data = response.json()
            if data["code"] == "Ok" and len(data["routes"]) > 0:
                distance = data["routes"][0]["distance"]  # meters
                return distance, "road"
    except Exception as e:
        logger.warning(f"Failed to get road distance: {e}")
    
    # Fallback to great circle distance
    R = 6371000  # Earth's radius in meters
    lat1, lon1, lat2, lon2 = map(radians, [start_lat, start_lon, end_lat, end_lon])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    distance = R * c
    return distance, "great_circle"

def interpolate_points(points, min_points):
    """Generate evenly spaced points along the route."""
    if len(points) >= min_points:
        return points
    
    result = []
    for i in range(len(points) - 1):
        p1 = points[i]
        p2 = points[i + 1]
        
        # Add original point
        result.append(p1)
        
        # Calculate number of points to add between p1 and p2
        num_points = max(1, min_points // (len(points) - 1))
        
        for j in range(1, num_points):
            t = j / num_points
            lat = p1[0] + t * (p2[0] - p1[0])
            lon = p1[1] + t * (p2[1] - p1[1])
            result.append((lat, lon))
    
    # Add last point
    result.append(points[-1])
    return result

def find_best_point(target_lat, target_lon, route_points, max_distance):
    """Find the best point (as tuple lat,lon) along the route within max_distance."""
    best_point_tuple = None # Changed variable name
    best_distance = float('inf')
    best_method = None
    
    # Ensure route_points are tuples (lat, lon)
    route_point_tuples = [(p[0], p[1]) for p in route_points] # Convert to tuple if needed
    
    for point_tuple in route_point_tuples:
        # Pass tuple elements to get_road_distance
        distance, method = get_road_distance(target_lat, target_lon, point_tuple[0], point_tuple[1]) 
        
        if distance <= max_distance and distance < best_distance:
            best_point_tuple = point_tuple # Store the tuple
            best_distance = distance
            best_method = method
            # Log using tuple elements
            logger.info(f"Found better point tuple: ({point_tuple[0]}, {point_tuple[1]}) - {distance}m using {method}") 
    
    return best_point_tuple, best_distance, best_method # Return tuple

def calculate_optimal_pickup_dropoff(
    driver_route_points,
    pickup_lat,
    pickup_lon,
    dropoff_lat,
    dropoff_lon,
    max_pickup_distance=600,  # meters
    max_dropoff_distance=1000,  # meters
    min_points=50
):
    """
    Calculate optimal pickup and dropoff points (as tuples lat,lon) along a driver's route.
    
    Args:
        driver_route_points: List of [lon, lat] points from the driver's route geometry
        pickup_lat, pickup_lon: Rider pickup coordinates as separate lat and lon
        dropoff_lat, dropoff_lon: Rider dropoff coordinates as separate lat and lon
        max_pickup_distance: Maximum distance in meters for a valid pickup point
        max_dropoff_distance: Maximum distance in meters for a valid dropoff point
        min_points: Minimum number of points to interpolate along the route
        
    Returns:
        Dictionary with pickup and dropoff point information or None if no valid points found
    """
    logger.info(f"Calculating optimal points for pickup ({pickup_lat}, {pickup_lon}) and dropoff ({dropoff_lat}, {dropoff_lon})")
    logger.info(f"Using limits - Pickup: {max_pickup_distance}m, Dropoff: {max_dropoff_distance}m")
    
    # IMPORTANT: Ensure driver_route_points is in the correct format
    # Input is expected to be a list of [lon, lat] points, but our calculations need (lat, lon) tuples
    driver_route_point_tuples = []
    
    # Check the format of the first point to determine conversion needed
    if len(driver_route_points) > 0:
        first_point = driver_route_points[0]
        logger.info(f"First driver route point (original): {first_point}")
        
        if isinstance(first_point, (list, tuple)):
            # If it's a list/tuple, convert from [lon, lat] to (lat, lon)
            driver_route_point_tuples = [(p[1], p[0]) for p in driver_route_points]
        elif isinstance(first_point, dict) and 'lat' in first_point and 'lng' in first_point:
            # If it's a dict with lat/lng keys
            driver_route_point_tuples = [(p['lat'], p['lng']) for p in driver_route_points]
    
    logger.info(f"Converted {len(driver_route_point_tuples)} route points to (lat, lon) format")
    
    # Ensure we have enough points; interpolate if needed
    route_point_tuples = interpolate_points(driver_route_point_tuples, min_points)
    logger.info(f"Generated {len(route_point_tuples)} points along route after interpolation")
    
    # Find optimal pickup point (will return tuple)
    pickup_point_tuple, pickup_distance, pickup_method = find_best_point(
        pickup_lat, pickup_lon, route_point_tuples, max_pickup_distance
    )
    
    if not pickup_point_tuple:
        logger.warning(f"No valid pickup point found within {max_pickup_distance}m")
        return None
        
    # Find the index of the pickup point tuple
    try:
        pickup_index = next(i for i, p_tuple in enumerate(route_point_tuples) if p_tuple == pickup_point_tuple) 
    except StopIteration:
        logger.error(f"Could not find index for found pickup_point_tuple {pickup_point_tuple}")
        return None

    logger.info(f"Found pickup point (lat,lon): {pickup_point_tuple} at index {pickup_index}")
    
    # Find optimal dropoff point (will return tuple)
    dropoff_point_tuple, dropoff_distance, dropoff_method = find_best_point(
        dropoff_lat, dropoff_lon, route_point_tuples, max_dropoff_distance
    )
    
    if not dropoff_point_tuple:
        logger.warning(f"No valid dropoff point found within {max_dropoff_distance}m")
        return None
    
    # Find the index of the dropoff point tuple in the full route
    try:
        dropoff_index = next(i for i, p_tuple in enumerate(route_point_tuples) if p_tuple == dropoff_point_tuple)
    except StopIteration:
        logger.error(f"Could not find index for found dropoff_point_tuple {dropoff_point_tuple}")
        return None

    logger.info(f"Found dropoff point (lat,lon): {dropoff_point_tuple} at index {dropoff_index}")
    
    # --- Sanity Check ---
    # If pickup index comes after dropoff index, we have a problem
    # In a real route, pickup should come before dropoff
    if dropoff_index < pickup_index:
        logger.warning(f"Calculated dropoff_index ({dropoff_index}) is less than pickup_index ({pickup_index}). Swapping points.")
        # Swap pickup and dropoff points to maintain proper sequence
        pickup_point_tuple, dropoff_point_tuple = dropoff_point_tuple, pickup_point_tuple
        pickup_index, dropoff_index = dropoff_index, pickup_index
        pickup_distance, dropoff_distance = dropoff_distance, pickup_distance
        pickup_method, dropoff_method = dropoff_method, pickup_method
    # --- End Sanity Check ---

    logger.info(f"Final optimal points - Pickup (lat,lon): {pickup_point_tuple} (Index: {pickup_index}, Dist: {pickup_distance}m), Dropoff (lat,lon): {dropoff_point_tuple} (Index: {dropoff_index}, Dist: {dropoff_distance}m)")
    
    return {
        'pickup': {
            'point': pickup_point_tuple, 
            'distance': pickup_distance,
            'method': pickup_method,
            'index': pickup_index
        },
        'dropoff': {
            'point': dropoff_point_tuple,
            'distance': dropoff_distance,
            'method': dropoff_method,
            'index': dropoff_index
        }
    }

def calculate_route_overlap(
    driver_route_geometry: list,
    rider_start_lat: float, rider_start_lon: float,
    rider_end_lat: float, rider_end_lon: float,
    # Add parameters for distance thresholds
    max_pickup_dist: int = 600, # meters - Increased for testing
    max_dropoff_dist: int = 1000, # meters 
    min_compatibility_score: float = 40.0 # Lower score threshold to increase match chance
):
    """
    Calculates a compatibility score between a driver's route and a rider's request.
    
    Args:
        driver_route_geometry: List of [lon, lat] points for the driver's route (or JSON string).
        rider_start_lat, rider_start_lon: Rider's start coordinates.
        rider_end_lat, rider_end_lon: Rider's end coordinates.
        max_pickup_dist: Max distance (meters) from rider start to driver route.
        max_dropoff_dist: Max distance (meters) from rider end to driver route.
        min_compatibility_score: Minimum score required for a match.

    Returns:
        Dict: {'score': float (0-100), 'message': str}
    """
    logger.info(f"--- Calculating Route Overlap --- Driver Route Type: {type(driver_route_geometry)}")
    logger.info(f"Rider: ({rider_start_lat},{rider_start_lon}) -> ({rider_end_lat},{rider_end_lon})")
    logger.info(f"Thresholds: Pickup<={max_pickup_dist}m, Dropoff<={max_dropoff_dist}m, MinScore>={min_compatibility_score}")

    # Handle case where driver_route_geometry might be a JSON string
    if isinstance(driver_route_geometry, str):
        try:
            driver_route_geometry = json.loads(driver_route_geometry)
            logger.info(f"Successfully parsed driver_route_geometry from JSON string, got {len(driver_route_geometry)} points")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse driver_route_geometry: {e}")
            return {'score': 0, 'message': 'Driver route geometry is not a valid JSON string'}

    if not driver_route_geometry or len(driver_route_geometry) < 2:
        logger.warning("COMPATIBILITY: Driver route geometry is missing or too short.")
        return {'score': 0, 'message': 'Driver route geometry missing or invalid'}

    # IMPORTANT: driver_route_geometry comes in as [lon, lat] but we need [lat, lon] for calculations
    # Convert driver geometry to list of (lat, lon) tuples for consistency
    driver_route_points = [(p[1], p[0]) for p in driver_route_geometry]  # Convert from [lon, lat] to (lat, lon)
    
    logger.info(f"First driver route point (converted to lat,lon): {driver_route_points[0]}")
    logger.info(f"Last driver route point (converted to lat,lon): {driver_route_points[-1]}")

    # 1. Calculate Optimal Pickup/Dropoff Points along Driver Route
    optimal_points_result = calculate_optimal_pickup_dropoff(
        driver_route_geometry,  # Pass original [lon, lat] format - the function will handle conversion
        rider_start_lat, rider_start_lon,
        rider_end_lat, rider_end_lon,
        max_pickup_distance=max_pickup_dist,
        max_dropoff_distance=max_dropoff_dist
    )

    if not optimal_points_result:
        logger.info(f"COMPATIBILITY: Could not find optimal pickup/dropoff points.")
        return {
            'score': 0, 
            'message': 'Could not find compatible pickup/dropoff points within thresholds',
            'optimal_pickup_point': None,
            'optimal_dropoff_point': None
        }

    # Extract points and their indices from the result
    pickup_point_tuple = optimal_points_result['pickup']['point']
    dropoff_point_tuple = optimal_points_result['dropoff']['point']
    actual_pickup_distance = optimal_points_result['pickup']['distance']
    actual_dropoff_distance = optimal_points_result['dropoff']['distance']
    pickup_index = optimal_points_result['pickup']['index']
    dropoff_index = optimal_points_result['dropoff']['index']

    logger.info(f"COMPATIBILITY: Using Pickup Index: {pickup_index}, Dropoff Index: {dropoff_index}")
    logger.info(f"COMPATIBILITY: Pickup point (lat,lon): {pickup_point_tuple}")
    logger.info(f"COMPATIBILITY: Dropoff point (lat,lon): {dropoff_point_tuple}")

    # Check if pickup occurs before dropoff along the route (using the correct indices)
    # Allow pickup_index == dropoff_index if they are the same point (very short ride segment)
    if pickup_index > dropoff_index:
        logger.warning(f"COMPATIBILITY: Invalid sequence: pickup point index ({pickup_index}) is after dropoff point index ({dropoff_index})")
        return {
            'score': 0, 
            'message': 'Pickup point index is after dropoff point index along driver route',
            'optimal_pickup_point': pickup_point_tuple,
            'optimal_dropoff_point': dropoff_point_tuple
        }
    elif pickup_index == dropoff_index and pickup_point_tuple != dropoff_point_tuple:
        # This case should be prevented by the logic in calculate_optimal_pickup_dropoff,
        # but check defensively. It means the optimal point search found the same index
        # for different pickup/dropoff targets, which implies an issue.
        logger.warning(f"COMPATIBILITY: Invalid state: pickup index ({pickup_index}) equals dropoff index ({dropoff_index}) but points differ.")
        return {
            'score': 0, 
            'message': 'Internal error: Pickup and dropoff indices match but points differ.',
            'optimal_pickup_point': pickup_point_tuple,
            'optimal_dropoff_point': dropoff_point_tuple
        }
        
    # 2. Calculate Route Direction Similarity (using optimal points)
    # Vector from driver's start to end
    driver_vec = (driver_route_points[-1][0] - driver_route_points[0][0], driver_route_points[-1][1] - driver_route_points[0][1])
    # Vector from rider's optimal pickup to optimal dropoff
    rider_optimal_vec = (dropoff_point_tuple[0] - pickup_point_tuple[0], dropoff_point_tuple[1] - pickup_point_tuple[1])

    dot_product = driver_vec[0] * rider_optimal_vec[0] + driver_vec[1] * rider_optimal_vec[1]
    mag_driver = sqrt(driver_vec[0]**2 + driver_vec[1]**2)
    mag_rider_optimal = sqrt(rider_optimal_vec[0]**2 + rider_optimal_vec[1]**2)
    
    direction_score = 0 # Default score
    if mag_driver > 0 and mag_rider_optimal > 0:
        cos_angle = dot_product / (mag_driver * mag_rider_optimal)
        cos_angle = max(-1.0, min(1.0, cos_angle)) # Clamp to avoid domain errors
        # Score based on cosine: 1 means perfect alignment (100), 0 means perpendicular (50), -1 means opposite (0)
        direction_score = (cos_angle + 1) / 2 * 100 
    else:
        # Handle zero magnitude vectors (e.g., pickup and dropoff are the same point)
        # If pickup and dropoff are the same, it's technically aligned but covers zero distance.
        # Could assign a specific score or handle based on context.
        # For now, if rider vector is zero, let's give a neutral score or base it on driver direction.
        # If driver vector is also zero, it's undefined. Let's give 0 for now.
        direction_score = 0 if mag_driver == 0 else 50 # Neutral score if rider segment is zero length

    logger.info(f"COMPATIBILITY: Direction Score: {direction_score:.2f}")

    # 3. Calculate Shared Route Coverage
    # Get the driver's route segment between the optimal pickup and dropoff indices
    driver_segment_points = driver_route_points[pickup_index : dropoff_index + 1]
    
    # Calculate distance of the driver's segment using ORS if possible
    # THIS IS INEFFICIENT - AVOID REPEATED ORS CALLS HERE
    driver_segment_distance = 0
    if len(driver_segment_points) >= 2:
        # TODO: OPTIMIZE - Avoid calling ORS again. Calculate from geometry points or pre-fetch.
        # For now, let's estimate using great_circle distance along the segment points
        for i in range(len(driver_segment_points) - 1):
             p1 = driver_segment_points[i]
             p2 = driver_segment_points[i+1]
             driver_segment_distance += great_circle(p1, p2).meters
        # segment_details = get_route_details((driver_segment_points[0][1], driver_segment_points[0][0]), (driver_segment_points[-1][1], driver_segment_points[-1][0]))
        # driver_segment_distance = segment_details['distance'] if segment_details else 0
    
    logger.info(f"COMPATIBILITY: Estimated Driver Segment Distance (Idx {pickup_index}-{dropoff_index}): {driver_segment_distance:.2f}m")

    # Get rider's original route distance using ORS (or estimate)
    # TODO: OPTIMIZE - Avoid calling ORS again. Pass this in or estimate.
    rider_route_details = get_route_details((rider_start_lon, rider_start_lat), (rider_end_lon, rider_end_lat))
    rider_original_distance = rider_route_details['distance'] if rider_route_details else great_circle((rider_start_lat, rider_start_lon), (rider_end_lat, rider_end_lon)).meters
    
    logger.info(f"COMPATIBILITY: Rider Original Distance: {rider_original_distance:.2f}m")

    coverage_ratio = 0
    if rider_original_distance > 0:
        coverage_ratio = (driver_segment_distance / rider_original_distance) * 100
        coverage_ratio = min(coverage_ratio, 100) # Cap at 100%
    
    # Coverage score: linear mapping, 100% coverage = 100 points
    coverage_score = coverage_ratio
    logger.info(f"COMPATIBILITY: Coverage Ratio: {coverage_ratio:.2f}%, Coverage Score: {coverage_score:.2f}")

    # 4. Calculate Deviation Score (based on how far rider has to travel to pickup/dropoff)
    max_allowed_pickup_dist = max_pickup_dist
    max_allowed_dropoff_dist = max_dropoff_dist
    
    # Normalize actual distances to a 0-1 scale (0 = on route, 1 = at max allowed distance)
    pickup_deviation = min(actual_pickup_distance / max_allowed_pickup_dist, 1.0) if max_allowed_pickup_dist > 0 else 0
    dropoff_deviation = min(actual_dropoff_distance / max_allowed_dropoff_dist, 1.0) if max_allowed_dropoff_dist > 0 else 0
    
    # Average deviation (lower is better)
    avg_deviation = (pickup_deviation + dropoff_deviation) / 2
    
    # Deviation score: 100 = no deviation, 0 = max deviation
    deviation_score = (1 - avg_deviation) * 100
    logger.info(f"COMPATIBILITY: Pickup Dev: {pickup_deviation:.2f} ({actual_pickup_distance:.0f}m / {max_allowed_pickup_dist}m), Dropoff Dev: {dropoff_deviation:.2f} ({actual_dropoff_distance:.0f}m / {max_allowed_dropoff_dist}m)")
    logger.info(f"COMPATIBILITY: Deviation Score: {deviation_score:.2f}")

    # 5. Combine Scores (Example: Weighted Average)
    # Weights should sum to 1 (or normalize later)
    weight_direction = 0.40
    weight_coverage = 0.40
    weight_deviation = 0.20
    
    overall_score = (
        (direction_score * weight_direction) +
        (coverage_score * weight_coverage) +
        (deviation_score * weight_deviation)
    )
    
    logger.info(f"COMPATIBILITY: Overall compatibility score: {overall_score:.2f}")

    # Include the optimal points in the return value, formatted in a standard way
    # This ensures they'll be accessible in the calling code
    optimal_pickup_formatted = {
        'lat': pickup_point_tuple[0],
        'lng': pickup_point_tuple[1],
        'distance': actual_pickup_distance
    }
    
    optimal_dropoff_formatted = {
        'lat': dropoff_point_tuple[0],
        'lng': dropoff_point_tuple[1],
        'distance': actual_dropoff_distance
    }

    if overall_score >= min_compatibility_score:
        return {
            'score': overall_score, 
            'message': 'Routes are compatible',
            'optimal_pickup_point': optimal_pickup_formatted,
            'optimal_dropoff_point': optimal_dropoff_formatted
        }
    else:
        return {
            'score': overall_score, 
            'message': f'Compatibility score {overall_score:.2f} below minimum threshold of {min_compatibility_score}',
            'optimal_pickup_point': optimal_pickup_formatted,
            'optimal_dropoff_point': optimal_dropoff_formatted
        }

def create_test_token(user_id, username, expire_hours=2):
    """
    Create a valid JWT token for testing purposes.
    
    Args:
        user_id: The ID of the user to create a token for
        username: The username of the user
        expire_hours: How many hours until the token expires
        
    Returns:
        str: A JWT token string
    """
    from rest_framework_simplejwt.tokens import RefreshToken
    from django.contrib.auth import get_user_model
    
    User = get_user_model()
    
    try:
        # Try to get the user from the database
        user = User.objects.get(id=user_id)
        
        # Create a refresh token for the user
        refresh = RefreshToken.for_user(user)
        
        # Return the access token
        return str(refresh.access_token)
    except User.DoesNotExist:
        # If the user doesn't exist, create a custom token
        # This is less secure but useful for testing
        import jwt
        from django.conf import settings
        from datetime import datetime, timedelta
        
        # Create token payload
        payload = {
            'user_id': user_id,
            'username': username,
            'exp': datetime.utcnow() + timedelta(hours=expire_hours),
            'iat': datetime.utcnow(),
            'token_type': 'access',
            'jti': str(uuid.uuid4())
        }
        
        # Encode the token
        return jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256') 

def update_ride_request_with_points(ride_request_id):
    """
    Update a ride request with test values for optimal pickup and dropoff points using direct SQL to bypass any Django model issues.
    
    Args:
        ride_request_id: The ID of the ride request to update
        
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        from django.db import connection
        import json
        from rides.models import RideRequest
        
        # Get the ride request first to get the coordinates
        ride_request = RideRequest.objects.get(id=ride_request_id)
        
        # Create test values
        pickup_point = {
            'point': [ride_request.pickup_latitude, ride_request.pickup_longitude],
            'distance': 500,
            'method': 'test',
            'index': 10
        }
        
        dropoff_point = {
            'point': [ride_request.dropoff_latitude, ride_request.dropoff_longitude],
            'distance': 500,
            'method': 'test',
            'index': 50
        }
        
        # Convert to JSON strings
        pickup_json = json.dumps(pickup_point)
        dropoff_json = json.dumps(dropoff_point)
        
        # Update the database directly with raw SQL
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE rides_riderequest 
                SET optimal_pickup_point = %s, nearest_dropoff_point = %s 
                WHERE id = %s
                """,
                [pickup_json, dropoff_json, ride_request_id]
            )
        
        logger.info(f"Updated ride request {ride_request_id} with test optimal points using raw SQL")
        return True
    except Exception as e:
        logger.error(f"Error updating ride request {ride_request_id} with test optimal points: {e}")
        return False 