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

logger = logging.getLogger(__name__)

# Initialize geolocator
geolocator = Nominatim(user_agent="carpool_app")

# OpenRouteService API Key
ORS_API_KEY = "5b3ce3597851110001cf62482c1ae097a0b848ef81a1e5085aa27c1f"

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
    Returns tuple of (overlap_percentage, nearest_dropoff_point)
    """
    try:
        # Generate routes
        driver_route = generate_route(driver_start, driver_end, num_points=20)
        rider_route = generate_route(rider_pickup, rider_dropoff, num_points=20)
        
        # Convert to (lat, lng) format for calculations
        driver_route_lat_lng = [(lat, lng) for lng, lat in driver_route]
        rider_route_lat_lng = [(lat, lng) for lng, lat in rider_route]
        rider_pickup_lat_lng = (rider_pickup[1], rider_pickup[0])
        rider_dropoff_lat_lng = (rider_dropoff[1], rider_dropoff[0])
        
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
        
        # Estimate the driver's route distance
        driver_distance = 0
        for i in range(len(driver_route_lat_lng) - 1):
            driver_distance += great_circle(driver_route_lat_lng[i], driver_route_lat_lng[i+1]).kilometers
        
        # Calculate pickup and dropoff distances
        pickup_distance = great_circle(rider_pickup_lat_lng, driver_route_lat_lng[pickup_index]).kilometers
        dropoff_distance = distance_to_dest  # Already calculated
        
        # Calculate overlap using distance ratios and proximity
        # Basic idea: higher overlap when dropoff is close to destination and pickup is along driver's route
        
        # Maximum allowed distances for 100% overlap score component
        MAX_PICKUP_DIST = 2.0  # km
        MAX_DROPOFF_DIST = 3.0  # km
        
        # Calculate proximity scores (0-100)
        pickup_score = max(0, 100 - (pickup_distance * 100 / MAX_PICKUP_DIST))
        dropoff_score = max(0, 100 - (dropoff_distance * 100 / MAX_DROPOFF_DIST))
        
        # Direction alignment - calculate dot product of route vectors
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
        
        # Combine scores with weights
        overlap_percentage = (
            0.4 * direction_score +
            0.3 * pickup_score +
            0.3 * dropoff_score
        )
        
        logger.info(f"Direction score: {direction_score:.2f}%, " +
                   f"Pickup score: {pickup_score:.2f}%, " +
                   f"Dropoff score: {dropoff_score:.2f}%, " +
                   f"Final overlap: {overlap_percentage:.2f}%")
        
        # Convert optimal_dropoff back to (lng, lat) format for storage
        if optimal_dropoff:
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
    Generate a route between start and end points with num_points.
    This is a simplified version - in production you would use a routing service.
    
    Parameters:
    start: (lng, lat) tuple
    end: (lng, lat) tuple
    num_points: Number of points to generate along the route
    
    Returns:
    route: List of (lng, lat) coordinates
    """
    route = []
    for i in range(num_points):
        fraction = i / (num_points - 1)
        lng = start[0] + fraction * (end[0] - start[0])
        lat = start[1] + fraction * (end[1] - start[1])
        route.append((lng, lat))
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
    Calculate a comprehensive matching score.
    
    Factors considered:
    - Route overlap
    - Time proximity
    - Seat availability
    """
    overlap_score = overlap_percentage
    time_score = max(0, 100 - (time_diff * 20))  # Less penalty for time difference
    seat_score = min(100, (available_seats / seats_needed) * 100)
    
    # Weighted scoring (can be adjusted)
    matching_score = (
        0.5 * overlap_score + 
        0.3 * time_score + 
        0.2 * seat_score
    )
    
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
    queryset = Ride.objects.all()
    serializer_class = RideSerializer
    permission_classes = [permissions.IsAuthenticated, IsDriverOrReadOnly]

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return RideDetailSerializer
        return RideSerializer

    def perform_create(self, serializer):
        ride = serializer.save(driver=self.request.user)
        
        # After creating a ride, check for pending ride requests that might match
        self.check_pending_requests(ride)
    
    def check_pending_requests(self, ride):
        """Check for pending ride requests that might match the new ride"""
        logger.info(f"Checking pending requests for ride {ride.id}")
        
        # Get ride details
        driver_start = (ride.start_longitude, ride.start_latitude)
        driver_end = (ride.end_longitude, ride.end_latitude)
        
        # Get all pending requests
        pending_requests = PendingRideRequest.objects.filter(status='PENDING')
        
        # Track all matching riders with their dropoff distance
        matching_riders = []
        
        for pending_request in pending_requests:
            try:
                # Skip if ride doesn't have enough seats
                if ride.available_seats < pending_request.seats_needed:
                    continue
                
                # Get rider pickup and dropoff coordinates
                rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                
                # Calculate route overlap
                overlap_percentage, nearest_point = calculate_route_overlap(
                    driver_start, driver_end, rider_pickup, rider_dropoff
                )
                
                logger.info(f"Pending request {pending_request.id} route overlap: {overlap_percentage}%")
                
                # If there's a good match (40% or more overlap), add to matching riders
                if overlap_percentage >= 40:
                    logger.info(f"Found match for pending request {pending_request.id} with ride {ride.id}")
                    
                    # Add to matching riders with distance info
                    if nearest_point:
                        matching_riders.append({
                            'request': pending_request,
                            'overlap': overlap_percentage,
                            'distance_to_dest': nearest_point['distance_to_destination'],
                            'nearest_point': nearest_point
                        })
            except Exception as e:
                logger.error(f"Error processing pending request {pending_request.id}: {str(e)}")
                continue
        
        # Sort matching riders by distance to destination (ascending)
        matching_riders.sort(key=lambda x: x['distance_to_dest'])
        
        # Process the best matches first (up to ride's available seats)
        available_seats = ride.available_seats
        for match in matching_riders:
            if available_seats < match['request'].seats_needed:
                # Skip if not enough seats
                continue
                
            pending_request = match['request']
            nearest_point = match['nearest_point']
            
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
            except Exception as e:
                logger.error(f"Failed to send email notification for ride match: {str(e)}")
            
            # Update available seats
            available_seats -= pending_request.seats_needed
            
            # Update pending request status
            pending_request.status = 'MATCHED'
            pending_request.save()
            
            # Break if no more seats
            if available_seats <= 0:
                break

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
        Find suitable rides for a ride request with more relaxed matching criteria.
        """
        logger.info("Starting to find suitable rides with relaxed criteria")
        
        # Get available rides
        available_rides = Ride.objects.filter(
            Q(status='SCHEDULED') &
            Q(available_seats__gte=ride_request_data['seats_needed']) &
            Q(departure_time__gte=timezone.now())
        )
        
        logger.info(f"Found {available_rides.count()} scheduled rides with available seats")
        
        suitable_rides = []
        
        for ride in available_rides:
            # Basic compatibility checks
            if ride.available_seats < ride_request_data['seats_needed']:
                continue
            
            # Time compatibility (within 15 minutes instead of 5)
            time_diff = abs((ride.departure_time - ride_request_data['departure_time']).total_seconds() / 60)
            logger.info(f"Ride ID {ride.id} time difference: {time_diff} minutes")
            
            if time_diff > 15:  # Increased from 5 to 15 minutes
                logger.info(f"Ride ID {ride.id} excluded due to time difference ({time_diff} > 15 minutes)")
                continue
            
            # Calculate route overlap using more simplified method
            driver_start = (ride.start_longitude, ride.start_latitude)
            driver_end = (ride.end_longitude, ride.end_latitude)
            rider_pickup = (ride_request_data['pickup_longitude'], ride_request_data['pickup_latitude'])
            rider_dropoff = (ride_request_data['dropoff_longitude'], ride_request_data['dropoff_latitude'])
            
            overlap_percentage, nearest_point = calculate_route_overlap(
                driver_start, driver_end, rider_pickup, rider_dropoff
            )
            
            logger.info(f"Ride ID {ride.id} route overlap: {overlap_percentage}%")
            
            # More lenient route matching criteria (40% instead of 60%)
            if overlap_percentage >= 40:  # Decreased from 60% to 40%
                matching_score = calculate_matching_score(
                    overlap_percentage, 
                    time_diff, 
                    ride.available_seats,
                    ride_request_data['seats_needed']
                )
                
                logger.info(f"Ride ID {ride.id} matching score: {matching_score}")
                
                suitable_rides.append({
                    'ride': ride,
                    'overlap_percentage': overlap_percentage,
                    'matching_score': matching_score,
                    'time_diff': time_diff,
                    'nearest_dropoff_point': nearest_point
                })
            else:
                logger.info(f"Ride ID {ride.id} excluded due to low route overlap ({overlap_percentage}% < 40%)")
        
        # Sort rides by matching score (descending)
        suitable_rides.sort(key=lambda x: x['matching_score'], reverse=True)
        
        logger.info(f"Final suitable rides count: {len(suitable_rides)}")
        if suitable_rides:
            best_match = max(suitable_rides, key=lambda x: x['matching_score'])
            logger.info(f"Best match: Ride ID {best_match['ride'].id} with score {best_match['matching_score']}")
        
        return suitable_rides

    def create(self, request, *args, **kwargs):
        try:
            logger.info("Starting ride request creation")
            logger.info(f"Request data: {request.data}")
            
            # Validate the serializer
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            
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
                    
                    logger.info(f"Created pending ride request: {pending_request.id}")
                    
                    # Create a notification for the rider
                    Notification.objects.create(
                        recipient=request.user,
                        message=f"No rides found matching your criteria. Your request has been saved and we'll notify you if a match is found before your departure time.",
                        notification_type="RIDE_PENDING"
                    )
                    
                    return Response({
                        'status': 'pending',
                        'has_match': False,
                        'message': 'No suitable rides found at the moment. Your request has been saved and we will notify you if a match is found later.'
                    }, status=status.HTTP_202_ACCEPTED)
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
            
            # Create the ride request with the matched ride
            ride_request = serializer.save(
                rider=request.user,
                ride=matched_ride,
                status='PENDING',
                nearest_dropoff_point=best_match['nearest_dropoff_point']
            )
            
            logger.info(f"Created ride request: {ride_request.id}")
            
            # Check if notifications already exist to prevent duplicates
            existing_notifications = Notification.objects.filter(
                Q(recipient=ride_request.rider, ride_request=ride_request, notification_type='RIDE_MATCH')
            )
            
            if not existing_notifications.exists():
                # Create a notification for the rider with match details
                Notification.objects.create(
                    recipient=ride_request.rider,
                    sender=matched_ride.driver,
                    message=f"Found a matching ride! Driver: {matched_ride.driver.first_name} {matched_ride.driver.last_name}",
                    ride=matched_ride,
                    ride_request=ride_request,
                    notification_type='RIDE_MATCH'
                )
            
            # Send email notification only to the rider
            try:
                send_ride_match_notification(ride_request, notify_driver=False)
            except Exception as e:
                logger.error(f"Failed to send email notification for ride match: {str(e)}")
            
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
                        'available_seats': matched_ride.available_seats,
                        'price_per_seat': matched_ride.price_per_seat
                    }
                }
            }
            
            logger.info("Response data prepared:")
            logger.info(f"Response data: {response_data}")
            
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

        ride_request.status = 'ACCEPTED'
        ride_request.save()

        # Update available seats
        ride = ride_request.ride
        ride.available_seats -= ride_request.seats_needed
        ride.save()

        # Create notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            message=f"Your ride request for {ride_request.ride.start_location} to {ride_request.ride.end_location} has been accepted",
            notification_type="REQUEST_ACCEPTED",
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
        
        # Update the status to ACCEPTED
        logger.info(f"Updating ride request {pk} status to ACCEPTED")
        ride_request.status = 'ACCEPTED'
        ride_request.save()
        
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
        """Mark a ride as completed (driver only)"""
        ride_request = self.get_object()
        
        # Only the driver can complete a ride
        if request.user != ride_request.ride.driver:
            raise PermissionDenied("Only the driver can mark a ride as completed")
        
        # Only complete if it's in ACCEPTED status
        if ride_request.status != 'ACCEPTED':
            raise ValidationError("Only accepted rides can be marked as completed")
        
        # Update status to COMPLETED
        ride_request.status = 'COMPLETED'
        ride_request.save()
        
        # Create notification for the rider
        Notification.objects.create(
            recipient=ride_request.rider,
            sender=ride_request.ride.driver,
            message=f"Your ride with {ride_request.ride.driver.first_name} {ride_request.ride.driver.last_name} has been marked as completed",
            ride=ride_request.ride,
            ride_request=ride_request,
            notification_type='RIDE_COMPLETED'
        )
        
        return Response({'status': 'ride completed'})

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
