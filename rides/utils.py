import requests
from django.conf import settings
from typing import Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)

def get_route_details(
    start_coords: Tuple[float, float],
    end_coords: Tuple[float, float]
) -> Dict[str, Any]:
    """
    Get route details between two points using OpenRouteService.
    
    Args:
        start_coords: Tuple of (longitude, latitude) for start point
        end_coords: Tuple of (longitude, latitude) for end point
        
    Returns:
        Dictionary containing route details including:
        - distance (in meters)
        - duration (in seconds)
        - geometry (encoded polyline)
        - steps (list of navigation steps)
    """
    url = f"{settings.OPENROUTE_BASE_URL}/directions/driving-car"
    
    headers = {
        'Authorization': settings.OPENROUTE_API_KEY,
        'Content-Type': 'application/json; charset=utf-8'
    }
    
    params = {
        'start': f"{start_coords[1]},{start_coords[0]}", # OpenRouteService expects lon,lat
        'end': f"{end_coords[1]},{end_coords[0]}"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        
        data = response.json()
        
        if 'features' in data and len(data['features']) > 0:
            route = data['features'][0]
            properties = route['properties']
            geometry = route['geometry']
            
            return {
                'distance': properties.get('segments', [{}])[0].get('distance', 0),  # in meters
                'duration': properties.get('segments', [{}])[0].get('duration', 0),  # in seconds
                'geometry': geometry,
                'steps': properties.get('segments', [{}])[0].get('steps', [])
            }
        else:
            logger.error("No route found in OpenRouteService response")
            return None
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching route from OpenRouteService: {str(e)}")
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