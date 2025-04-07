#!/usr/bin/env python

fixed_function = '''def generate_route(start_coords, end_coords, max_retries=3, retry_delay=2):
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
    return generate_fallback_route(start_coords, end_coords)'''

with open('rides/views.py', 'r') as f:
    content = f.read()

# Find the beginning and end of the function
start_pattern = 'def generate_route'
end_pattern = 'def generate_fallback_route'
start_index = content.find(start_pattern)
end_index = content.find(end_pattern)

if start_index >= 0 and end_index > start_index:
    # Replace the function
    new_content = content[:start_index] + fixed_function + '\n\n' + content[end_index:]
    
    # Write the new content back to the file
    with open('rides/views.py', 'w') as f:
        f.write(new_content)
    
    print('Successfully replaced generate_route function')
else:
    print('Could not find the function in the file')
