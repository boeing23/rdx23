import logging
import json
import sys
import math
import random
from geopy.distance import great_circle

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

# Copy of relevant functions from views.py to avoid Django dependencies
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

def get_address_from_coordinates(longitude, latitude):
    """Mock of the function to get address from coordinates"""
    # In a test environment, just return a mock address
    return f"Address near ({longitude:.4f}, {latitude:.4f})"

def generate_route(start, end, num_points=20):
    """
    Generate a simplified route between start and end points.
    
    Parameters:
    start: (lng, lat) tuple
    end: (lng, lat) tuple
    num_points: Number of points to generate along the route
    
    Returns:
    route: List of (lng, lat) coordinates
    """
    # Simplified route generation - straight line with some randomization
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
    
    return route

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

def test_ride_matching_with_real_routes():
    """
    Test the ride matching algorithm with real-world route data from OpenRouteService.
    """
    # Driver's route coordinates extracted from the first route
    driver_route_coordinates = [
        [-80.419099, 37.248763], [-80.419048, 37.248747], [-80.418897, 37.248742], 
        [-80.418805, 37.248775], [-80.418134, 37.249163], [-80.418028, 37.249188], 
        [-80.417413, 37.249256], [-80.417302, 37.249284], [-80.416993, 37.248767], 
        [-80.417036, 37.248579], [-80.417104, 37.248422], [-80.417337, 37.248144], 
        [-80.417471, 37.247969], [-80.417523, 37.247853], [-80.41756, 37.247716], 
        [-80.417566, 37.247592], [-80.417533, 37.247139], [-80.417507, 37.2469], 
        [-80.416705, 37.246942], [-80.416354, 37.246916], [-80.416112, 37.246866], 
        [-80.415864, 37.246777], [-80.415655, 37.246677], [-80.414874, 37.246326], 
        [-80.42334, 37.23137], [-80.423353, 37.23136]
    ]

    # Rider's route coordinates extracted from the second route
    rider_route_coordinates = [
        [-80.419099, 37.248763], [-80.419048, 37.248747], [-80.418897, 37.248742], 
        [-80.418805, 37.248775], [-80.418134, 37.249163], [-80.418028, 37.249188], 
        [-80.417413, 37.249256], [-80.417302, 37.249284], [-80.450972, 37.214316], 
        [-80.450834, 37.214292], [-80.450198, 37.214238]
    ]

    # Driver's and rider's start/end points
    driver_start = driver_route_coordinates[0]
    driver_end = driver_route_coordinates[-1]
    rider_pickup = rider_route_coordinates[0]
    rider_dropoff = rider_route_coordinates[-1]

    logger.info("Driver Route:")
    logger.info(f"Starting point: {driver_start}")
    logger.info(f"Ending point: {driver_end}")
    
    logger.info("\nRider Route:")
    logger.info(f"Pickup point: {rider_pickup}")
    logger.info(f"Dropoff point: {rider_dropoff}")

    # Test our algorithm with these routes
    logger.info("\nTesting route overlap calculation...")
    overlap_percentage, nearest_dropoff = calculate_route_overlap(
        driver_start, driver_end, rider_pickup, rider_dropoff
    )

    logger.info(f"Calculated overlap percentage: {overlap_percentage:.2f}%")
    if nearest_dropoff:
        logger.info(f"Nearest dropoff point: {nearest_dropoff.get('coordinates')}")
        logger.info(f"Distance to destination: {nearest_dropoff.get('distance_to_destination'):.2f} km")
        logger.info(f"Address: {nearest_dropoff.get('address')}")
    else:
        logger.info("No nearest dropoff point found.")

    # Test the matching score
    time_diff = 10  # 10 minutes difference in departure times
    available_seats = 3
    seats_needed = 2

    matching_score = calculate_matching_score(
        overlap_percentage, time_diff, available_seats, seats_needed
    )
    logger.info(f"Matching score: {matching_score:.2f}/100")

    # Determine if this is a suitable match based on our current thresholds
    MIN_OVERLAP_THRESHOLD = 35.0
    if overlap_percentage >= MIN_OVERLAP_THRESHOLD:
        logger.info("🟢 This is a suitable match according to our algorithm.")
    else:
        logger.info("🔴 This is NOT a suitable match according to our algorithm.")

    # Test find_optimal_dropoff directly
    logger.info("\nTesting optimal dropoff calculation directly...")
    # Convert coordinates to (lat, lng) format for find_optimal_dropoff
    driver_route_lat_lng = [(coord[1], coord[0]) for coord in driver_route_coordinates]
    rider_pickup_lat_lng = (rider_pickup[1], rider_pickup[0])
    rider_dropoff_lat_lng = (rider_dropoff[1], rider_dropoff[0])
    
    optimal_dropoff, distance_to_dest, pickup_index = find_optimal_dropoff(
        driver_route_lat_lng, rider_pickup_lat_lng, rider_dropoff_lat_lng
    )
    
    logger.info(f"Optimal dropoff point: {optimal_dropoff}")
    logger.info(f"Distance to destination: {distance_to_dest:.2f} km")
    logger.info(f"Pickup index on route: {pickup_index}")

    # Return the results for additional analysis
    return {
        "overlap_percentage": overlap_percentage,
        "nearest_dropoff": nearest_dropoff,
        "matching_score": matching_score,
        "is_suitable_match": overlap_percentage >= MIN_OVERLAP_THRESHOLD,
        "optimal_dropoff": optimal_dropoff,
        "distance_to_dest": distance_to_dest,
        "pickup_index": pickup_index
    }

def test_custom_case():
    """
    Test with a simplified case where we know the expected behavior.
    """
    # Simple case: Driver going from Point A to Point C, Rider from Point A to Point D
    # Point B is where their routes diverge
    # A -- B -- C
    #      \
    #       -- D
    
    # Coordinates in (lng, lat) format
    point_a = [-80.419, 37.248]  # Starting point for both
    point_b = [-80.417, 37.247]  # Divergence point
    point_c = [-80.423, 37.231]  # Driver's destination
    point_d = [-80.450, 37.214]  # Rider's destination
    
    driver_start = point_a
    driver_end = point_c
    rider_pickup = point_a
    rider_dropoff = point_d
    
    logger.info("Testing simplified case:")
    logger.info(f"Driver: {driver_start} -> {driver_end}")
    logger.info(f"Rider: {rider_pickup} -> {rider_dropoff}")
    
    # Test route overlap
    overlap_percentage, nearest_dropoff = calculate_route_overlap(
        driver_start, driver_end, rider_pickup, rider_dropoff
    )
    
    logger.info(f"Simplified case - Overlap: {overlap_percentage:.2f}%")
    if nearest_dropoff:
        logger.info(f"Nearest dropoff: {nearest_dropoff.get('coordinates')}")

    # Test matching score
    matching_score = calculate_matching_score(
        overlap_percentage, 5, 3, 1
    )
    logger.info(f"Matching score: {matching_score:.2f}/100")

    return {
        "overlap_percentage": overlap_percentage,
        "nearest_dropoff": nearest_dropoff,
        "matching_score": matching_score
    }

def test_fixed_coordinates():
    """
    Test with the exact coordinates provided by the user.
    """
    # Driver route
    driver_start = [-80.4189968, 37.2489617]  # Start coordinates
    driver_end = [-80.42368099120901, 37.231654]  # End coordinates
    
    # Rider route 
    rider_pickup = [-80.4189968, 37.2489617]  # Same start as driver
    rider_dropoff = [-80.4501677, 37.2144643]  # Different destination
    
    logger.info("\nTesting with exact coordinates from user:")
    logger.info(f"Driver: {driver_start} -> {driver_end}")
    logger.info(f"Rider: {rider_pickup} -> {rider_dropoff}")
    
    # Calculate route overlap
    overlap_percentage, nearest_dropoff = calculate_route_overlap(
        driver_start, driver_end, rider_pickup, rider_dropoff
    )
    
    logger.info(f"Calculated overlap percentage: {overlap_percentage:.2f}%")
    if nearest_dropoff:
        logger.info(f"Nearest dropoff point: {nearest_dropoff.get('coordinates')}")
        logger.info(f"Distance to destination: {nearest_dropoff.get('distance_to_destination'):.2f} km")
    
    # Calculate matching score with common parameters
    time_diff = 5  # 5 minutes difference
    matching_score = calculate_matching_score(
        overlap_percentage, time_diff, 3, 1
    )
    
    logger.info(f"Matching score: {matching_score:.2f}/100")
    
    # Determine if this would be considered a match
    MIN_OVERLAP_THRESHOLD = 35.0
    if overlap_percentage >= MIN_OVERLAP_THRESHOLD:
        logger.info("🟢 This is a suitable match according to our algorithm.")
    else:
        logger.info("🔴 This is NOT a suitable match according to our algorithm.")
    
    return {
        "overlap_percentage": overlap_percentage,
        "nearest_dropoff": nearest_dropoff,
        "matching_score": matching_score,
        "is_suitable_match": overlap_percentage >= MIN_OVERLAP_THRESHOLD
    }

if __name__ == "__main__":
    logger.info("Starting ride matching algorithm test...")
    
    # Test with fixed coordinates from the user
    test_fixed_coordinates()
    
    # Test with extracted route coordinates
    test_ride_matching_with_real_routes()
    
    # Test with simplified case
    test_custom_case()
    
    logger.info("\nTest completed.") 