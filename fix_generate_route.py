#!/usr/bin/env python3

"""
Script to fix indentation in the generate_route function in views.py
"""

def fix_indentation():
    with open('rides/views.py', 'r') as f:
        content = f.read()
    
    # Replace the entire function with a properly indented version
    problematic_function = """def generate_route(start_coords, end_coords, max_retries=3, retry_delay=2):
    \"\"\"
    Generate a route between two points using OpenRouteService API.
    Returns a list of coordinates along the route.
    \"\"\"
    if not start_coords or not end_coords:
        logger.error("Missing coordinates for route generation")
        return None

    # Check if API key is available
    if not ORS_API_KEY:
        logger.error(
            "OpenRouteService API key not configured, using fallback method")
        return generate_fallback_route(start_coords, end_coords)

    # Ensure coordinates are in the correct format (lng, lat)
    start_lng, start_lat = start_coords
    end_lng, end_lat = end_coords

    # Validate coordinates
    if not all(isinstance(x, (int, float))
               for x in [start_lng, start_lat, end_lng, end_lat]):
        logger.error(
            f"Invalid coordinate values: start={start_coords}, end={end_coords}")
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
    }"""
    
    correct_function = """def generate_route(start_coords, end_coords, max_retries=3, retry_delay=2):
    \"\"\"
    Generate a route between two points using OpenRouteService API.
    Returns a list of coordinates along the route.
    \"\"\"
    if not start_coords or not end_coords:
        logger.error("Missing coordinates for route generation")
        return None

    # Check if API key is available
    if not ORS_API_KEY:
        logger.error(
            "OpenRouteService API key not configured, using fallback method")
        return generate_fallback_route(start_coords, end_coords)

    # Ensure coordinates are in the correct format (lng, lat)
    start_lng, start_lat = start_coords
    end_lng, end_lat = end_coords

    # Validate coordinates
    if not all(isinstance(x, (int, float))
               for x in [start_lng, start_lat, end_lng, end_lat]):
        logger.error(
            f"Invalid coordinate values: start={start_coords}, end={end_coords}")
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
    }"""
    
    fixed_content = content.replace(problematic_function, correct_function)
    
    with open('rides/views.py', 'w') as f:
        f.write(fixed_content)
    
    print("Fixed indentation in generate_route function")

if __name__ == "__main__":
    fix_indentation() 