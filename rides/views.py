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
    # Convert from (longitude, latitude) to (latitude, longitude) for great_circle
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

def find_optimal_point(route, target_point):
    """Find optimal point along a route closest to target point using vector projection"""
    min_dist = float('inf')
    optimal_point = None
    
    for i in range(len(route) - 1):
        p1, p2 = route[i], route[i+1]
        
        # Vector calculations
        vec = (p2[0]-p1[0], p2[1]-p1[1])
        vec_target = (target_point[0]-p1[0], target_point[1]-p1[1])
        
        # Projection calculation
        t = (vec_target[0]*vec[0] + vec_target[1]*vec[1]) / (vec[0]**2 + vec[1]**2 + 1e-8)
        t = max(0, min(1, t))
        closest = (p1[0] + t*vec[0], p1[1] + t*vec[1])
        
        try:
            dist = calculate_distance(closest, target_point)
            if dist < min_dist:
                min_dist = dist
                optimal_point = closest
        except Exception as e:
            logger.error(f"Error calculating distance: {str(e)}")
            continue
    
    return optimal_point, min_dist

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
                logger.error(f"Error in calculating distance for overlap: {str(e)}")
                continue
    
    return (proximity_count / len(route1)) * 100 if route1 else 0

def calculate_route_overlap(driver_start, driver_end, rider_pickup, rider_dropoff):
    """
    Calculate the route overlap between driver and rider routes.
    Returns:
        tuple: (overlap_percentage, optimal_dropoff_point, optimal_pickup_point)
    """
    try:
        # Generate driver's route
        logger.info(f"Calculating route overlap with inputs:")
        logger.info(f"  Driver start: {driver_start}, Driver end: {driver_end}")
        logger.info(f"  Rider pickup: {rider_pickup}, Rider dropoff: {rider_dropoff}")
        
        driver_route = generate_route(driver_start, driver_end)
        if not driver_route:
            logger.error("Failed to generate driver route")
            return 0, None, None
        
        # Generate rider's route
        rider_route = generate_route(rider_pickup, rider_dropoff)
        if not rider_route:
            logger.error("Failed to generate rider route")
            return 0, None, None
        
        # Find optimal pickup and dropoff points
        optimal_pickup_point, pickup_dist = find_optimal_point(driver_route, rider_pickup)
        optimal_dropoff_point, dropoff_dist = find_optimal_point(driver_route, rider_dropoff)
        
        logger.info(f"Calculated optimal pickup point: {optimal_pickup_point}")
        logger.info(f"Calculated optimal dropoff point: {optimal_dropoff_point}")
        
        # Calculate driver-to-rider overlap
        driver_to_rider_overlap = calculate_segment_overlap(driver_route, rider_route)
        
        # Calculate rider-to-driver overlap
        rider_to_driver_overlap = calculate_segment_overlap(rider_route, driver_route)
        
        # Take average of the two overlap measures
        overlap_percentage = (driver_to_rider_overlap + rider_to_driver_overlap) / 2
        
        # Format the optimal points as dictionaries for JSON storage
        formatted_pickup_point = None
        formatted_dropoff_point = None
        
        if optimal_pickup_point:
            try:
                pickup_address = get_address_from_coordinates(optimal_pickup_point[0], optimal_pickup_point[1])
                formatted_pickup_point = {
                    'longitude': float(optimal_pickup_point[0]),
                    'latitude': float(optimal_pickup_point[1]),
                    'address': pickup_address or "Optimal pickup point",
                    'distance_from_rider': float(pickup_dist)
                }
            except Exception as e:
                logger.error(f"Error formatting pickup point: {str(e)}")
                # Basic fallback format
                formatted_pickup_point = {
                    'longitude': float(optimal_pickup_point[0]),
                    'latitude': float(optimal_pickup_point[1]),
                    'address': "Optimal pickup point",
                    'distance_from_rider': float(pickup_dist)
                }
            
        if optimal_dropoff_point:
            try:
                dropoff_address = get_address_from_coordinates(optimal_dropoff_point[0], optimal_dropoff_point[1])
                formatted_dropoff_point = {
                    'longitude': float(optimal_dropoff_point[0]),
                    'latitude': float(optimal_dropoff_point[1]),
                    'address': dropoff_address or "Optimal dropoff point",
                    'distance_from_rider': float(dropoff_dist)
                }
            except Exception as e:
                logger.error(f"Error formatting dropoff point: {str(e)}")
                # Basic fallback format
                formatted_dropoff_point = {
                    'longitude': float(optimal_dropoff_point[0]),
                    'latitude': float(optimal_dropoff_point[1]),
                    'address': "Optimal dropoff point", 
                    'distance_from_rider': float(dropoff_dist)
                }
        
        logger.info(f"Calculated route overlap: {overlap_percentage:.2f}%")
        logger.info(f"Formatted optimal pickup point: {formatted_pickup_point}")
        logger.info(f"Formatted optimal dropoff point: {formatted_dropoff_point}")
        
        return overlap_percentage, formatted_dropoff_point, formatted_pickup_point
        
    except Exception as e:
        logger.error(f"Error in calculate_route_overlap: {str(e)}")
        logger.error(f"Full exception details:")
        logger.exception("Exception details")
        return 0, None, None

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
    def check_pending_requests(ride):
        """Check for pending requests that might match this ride"""
        try:
            # Find pending requests that might match this ride
            pending_requests = PendingRideRequest.objects.filter(
                status='PENDING',
                departure_time__gte=timezone.now()
            )

            for pending_request in pending_requests:
                # Calculate route overlap
                overlap_percentage = calculate_route_overlap(
                    (ride.start_longitude, ride.start_latitude),
                    (ride.end_longitude, ride.end_latitude),
                    (pending_request.pickup_longitude, pending_request.pickup_latitude),
                    (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                )

                # If there's significant overlap, propose this ride as a match
                if overlap_percentage >= 60:  # Minimum 60% overlap required
                    # Update the pending request
                    pending_request.status = 'MATCH_PROPOSED'
                    pending_request.proposed_ride = ride
                    pending_request.save()

                    # Create notification for the rider
                    Notification.objects.create(
                        recipient=pending_request.rider,
                        notification_type='MATCH_PROPOSED',
                        message=f"We found a potential ride match from {ride.start_location} to {ride.end_location}",
                        pending_request=pending_request
                    )

        except Exception as e:
            logger.error(f"Error checking pending requests: {str(e)}")

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
                return Response({"error": "pending_request_id is required"}, status=status.HTTP_400_BAD_REQUEST)

            pending_request = get_object_or_404(PendingRideRequest, id=pending_request_id)
            
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
            
            if pending_request.status == 'MATCH_PROPOSED' and pending_request.proposed_ride:
                try:
                    # Get coordinates for rider and driver
                    driver_start = (pending_request.proposed_ride.start_longitude, pending_request.proposed_ride.start_latitude)
                    driver_end = (pending_request.proposed_ride.end_longitude, pending_request.proposed_ride.end_latitude)
                    rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                    rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                    
                    # Calculate route overlap which returns optimal points
                    overlap_percentage, optimal_dropoff_point, optimal_pickup_point = calculate_route_overlap(
                        driver_start, driver_end, rider_pickup, rider_dropoff
                    )
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
                    "optimal_dropoff_point": optimal_dropoff_point
                } if pending_request.status == 'MATCH_PROPOSED' else None,
                "notifications": NotificationSerializer(notifications, many=True).data
            })

        except Exception as e:
            logger.error(f"Error checking pending status: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class RideRequestViewSet(viewsets.ModelViewSet):
    serializer_class = RideRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Get ride requests for the current user"""
        user = self.request.user
        return RideRequest.objects.filter(Q(rider=user) | Q(ride__driver=user))

    @action(detail=False, methods=['get'])
    def accepted(self, request):
        """Get accepted ride requests for the current user"""
        user = self.request.user
        ride_requests = RideRequest.objects.filter(
            (Q(rider=user) | Q(ride__driver=user)) & 
            Q(status='ACCEPTED')
        ).select_related('ride', 'rider', 'ride__driver')
        
        serializer = self.get_serializer(ride_requests, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create a new ride request"""
        try:
            # Log incoming request for debugging
            logger.info(f"RideRequest create: Received data: {request.data}")
            
            # Check if ride ID is present
            ride_id = request.data.get('ride')
            if not ride_id:
                return Response(
                    {"error": "Ride ID is required"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Validate request data
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
    
            # Get ride object
            try:
                ride = Ride.objects.get(pk=ride_id)
            except Ride.DoesNotExist:
                return Response(
                    {"error": "Ride not found"},
                    status=status.HTTP_404_NOT_FOUND
                )
    
            # Check if ride has available seats
            if ride.available_seats < serializer.validated_data.get('seats_needed', 1):
                return Response(
                    {"error": "Not enough available seats"},
                    status=status.HTTP_400_BAD_REQUEST
                )
    
            # Create the ride request
            ride_request = serializer.save(rider=request.user)
            
            # Calculate optimal pickup and dropoff points
            optimal_pickup_point = None
            optimal_dropoff_point = None
            
            try:
                # Get coordinates for rider and driver
                driver_start = (ride.start_longitude, ride.start_latitude)
                driver_end = (ride.end_longitude, ride.end_latitude)
                rider_pickup = (
                    serializer.validated_data.get('pickup_longitude') or request.data.get('pickup_longitude'),
                    serializer.validated_data.get('pickup_latitude') or request.data.get('pickup_latitude')
                )
                rider_dropoff = (
                    serializer.validated_data.get('dropoff_longitude') or request.data.get('dropoff_longitude'),
                    serializer.validated_data.get('dropoff_latitude') or request.data.get('dropoff_latitude')
                )
                
                # Calculate route overlap which returns optimal points
                overlap_percentage, optimal_dropoff_point, optimal_pickup_point = calculate_route_overlap(
                    driver_start, driver_end, rider_pickup, rider_dropoff
                )
                logger.info(f"Calculated optimal pickup point: {optimal_pickup_point}")
                logger.info(f"Calculated optimal dropoff point: {optimal_dropoff_point}")
                
                # Store the optimal points in the ride request
                ride_request.optimal_pickup_point = optimal_pickup_point
                ride_request.nearest_dropoff_point = optimal_dropoff_point
                ride_request.save()
                
            except Exception as e:
                logger.error(f"Error calculating optimal points: {str(e)}")
                # Continue with the request even if calculation fails
            
            # Create notification for the driver
            driver_notification = Notification.objects.create(
                recipient=ride.driver,
                notification_type='RIDE_REQUEST',
                message=f"{request.user.get_full_name()} has requested to join your ride from {ride.start_location} to {ride.end_location}",
                ride_request=ride_request
            )
    
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
                    "departure_time": ride.departure_time.isoformat() if ride.departure_time else None,
                    "created_at": timezone.now().isoformat(),
                    "vehicle_make": getattr(ride.driver, 'vehicle_make', ''),
                    "vehicle_model": getattr(ride.driver, 'vehicle_model', ''),
                    "vehicle_color": getattr(ride.driver, 'vehicle_color', ''),
                    "vehicle_year": getattr(ride.driver, 'vehicle_year', ''),  # Add vehicle year
                    "license_plate": getattr(ride.driver, 'license_plate', ''),
                    "optimal_pickup_point": optimal_pickup_point,
                    "optimal_dropoff_point": optimal_dropoff_point
                },
                "ride_request": serializer.data,
                "notification_sent": True,
                "notification_id": driver_notification.id
            }, status=status.HTTP_201_CREATED)
    
        except Exception as e:
            logger.error(f"Error creating ride request: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to create ride request: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def accept_match(self, request):
        """Accept a proposed ride match"""
        try:
            pending_request_id = request.data.get('pending_request_id')
            if not pending_request_id:
                return Response({"error": "pending_request_id is required"}, status=status.HTTP_400_BAD_REQUEST)

            logger.info(f"Accepting match with pending_request_id: {pending_request_id}")
            
            # First check if this is a PendingRideRequest ID
            try:
                pending_request = PendingRideRequest.objects.get(id=pending_request_id)
                logger.info(f"Found pending request with ID {pending_request_id}")
            
                # Verify the user is the rider
                if pending_request.rider != request.user:
                    raise PermissionDenied("You can only accept your own ride requests")

                # Check if the request is in MATCH_PROPOSED state
                if pending_request.status != 'MATCH_PROPOSED':
                    return Response(
                        {"error": f"This request is not in a state to be accepted. Current status: {pending_request.status}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # Get the proposed ride
                proposed_ride = pending_request.proposed_ride
                if not proposed_ride:
                    return Response(
                        {"error": "No proposed ride found for this request"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Calculate optimal pickup and dropoff points
                optimal_pickup_point = None
                optimal_dropoff_point = None
                
                try:
                    # Get coordinates for rider and driver
                    driver_start = (proposed_ride.start_longitude, proposed_ride.start_latitude)
                    driver_end = (proposed_ride.end_longitude, proposed_ride.end_latitude)
                    rider_pickup = (pending_request.pickup_longitude, pending_request.pickup_latitude)
                    rider_dropoff = (pending_request.dropoff_longitude, pending_request.dropoff_latitude)
                    
                    # Calculate route overlap which returns optimal points
                    overlap_percentage, optimal_dropoff_point, optimal_pickup_point = calculate_route_overlap(
                        driver_start, driver_end, rider_pickup, rider_dropoff
                    )
                    logger.info(f"Calculated optimal pickup point: {optimal_pickup_point}")
                    logger.info(f"Calculated optimal dropoff point: {optimal_dropoff_point}")
                except Exception as e:
                    logger.error(f"Error calculating optimal points for match: {str(e)}")
                    logger.exception("Full exception details")
                    # Continue with the request even if calculation fails

                # Log the points before creating the ride request
                logger.info(f"Creating RideRequest with optimal_pickup_point={optimal_pickup_point}, nearest_dropoff_point={optimal_dropoff_point}")

                # Create a RideRequest with the optimal points
                ride_request = RideRequest.objects.create(
                    rider=pending_request.rider,
                    ride=proposed_ride,
                    pickup_location=pending_request.pickup_location,
                    dropoff_location=pending_request.dropoff_location,
                    pickup_latitude=pending_request.pickup_latitude,
                    pickup_longitude=pending_request.pickup_longitude,
                    dropoff_latitude=pending_request.dropoff_latitude,
                    dropoff_longitude=pending_request.dropoff_longitude,
                    departure_time=pending_request.departure_time,
                    seats_needed=pending_request.seats_needed,
                    status='ACCEPTED',  # Directly set to ACCEPTED since this is an acceptance
                    optimal_pickup_point=optimal_pickup_point,
                    nearest_dropoff_point=optimal_dropoff_point
                )
                
                # Double-check that the optimal points were saved
                ride_request.refresh_from_db()
                logger.info(f"Saved RideRequest with ID {ride_request.id}")
                logger.info(f"Saved optimal_pickup_point: {ride_request.optimal_pickup_point}")
                logger.info(f"Saved nearest_dropoff_point: {ride_request.nearest_dropoff_point}")

                # Update the pending request status
                pending_request.status = 'MATCHED'
                pending_request.matched_ride_request = ride_request
                pending_request.save()
                
                # Decrement the available seats in the ride
                proposed_ride.available_seats -= pending_request.seats_needed
                proposed_ride.save()

                # Create notifications and send emails
                try:
                    create_match_notifications(ride_request)
                    logger.info(f"Created notifications for ride request {ride_request.id}")
                    
                    # Send email notifications
                    send_ride_match_emails(ride_request)
                    logger.info(f"Sent email notifications for ride request {ride_request.id}")
                except Exception as e:
                    logger.error(f"Error creating notifications or sending emails: {str(e)}")
                    logger.exception("Full exception details")

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
                        "vehicle_make": getattr(proposed_ride.driver, 'vehicle_make', ''),
                        "vehicle_model": getattr(proposed_ride.driver, 'vehicle_model', ''),
                        "vehicle_color": getattr(proposed_ride.driver, 'vehicle_color', ''),
                        "vehicle_year": getattr(proposed_ride.driver, 'vehicle_year', ''),
                        "license_plate": getattr(proposed_ride.driver, 'license_plate', '')
                    }
                })
                
            except PendingRideRequest.DoesNotExist:
                # If no PendingRideRequest was found, check if this is a RideRequest ID
                logger.info(f"No PendingRideRequest with ID {pending_request_id}, checking if this is a RideRequest ID")
                
                try:
                    # Try to find a RideRequest with this ID
                    ride_request = RideRequest.objects.get(id=pending_request_id)
                    
                    # Verify the user is the rider
                    if ride_request.rider != request.user:
                        raise PermissionDenied("You can only accept your own ride requests")
                    
                    # Check if the ride request is already in the right state
                    if ride_request.status == 'ACCEPTED':
                        logger.info(f"RideRequest {pending_request_id} is already accepted")
                        return Response({
                            "status": "success",
                            "message": "This ride request is already accepted",
                            "ride_request": RideRequestSerializer(ride_request).data
                        })
                    
                    # Update the ride request status
                    ride_request.status = 'ACCEPTED'
                    ride_request.save()
                    
                    # Create notification for the rider
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
                    # If neither PendingRideRequest nor RideRequest was found with this ID
                    logger.error(f"No PendingRideRequest or RideRequest found with ID {pending_request_id}")
                    return Response(
                        {"error": f"No ride request found with ID {pending_request_id}"},
                        status=status.HTTP_404_NOT_FOUND
                    )

        except Exception as e:
            logger.error(f"Error accepting match: {str(e)}")
            logger.exception("Full exception details:")
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
    """
    try:
        from django.db import connection
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
        logger.error(f"Error fixing notification field names: {str(e)}")

# Run the fix on module import
fix_notification_field_names()

def send_ride_match_emails(ride_request):
    """
    Send email notifications to both driver and rider when a ride match is created.
    
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
        
        # Compose rider email
        rider_subject = f"Your ride request has been matched!"
        rider_message = f"""
        Hello {rider.first_name},
        
        Great news! Your ride request has been matched with a driver.
        
        Ride Details:
        - Driver: {driver.first_name} {driver.last_name}
        - From: {ride_request.pickup_location}
        - To: {ride_request.dropoff_location}
        - Date/Time: {ride.departure_time.strftime('%m/%d/%Y at %I:%M %p')}
        - Vehicle: {driver.vehicle_make} {driver.vehicle_model}, {driver.vehicle_color}
        - License Plate: {driver.license_plate}
        
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
        - Date/Time: {ride.departure_time.strftime('%m/%d/%Y at %I:%M %p')}
        - Pickup Location: {ride_request.pickup_location}
        - Dropoff Location: {ride_request.dropoff_location}
        
        Rider Contact: {rider.email}
        
        Have a safe trip!
        
        Best regards,
        The Ridex Team
        """
        
        # Send emails
        from django.core.mail import send_mail
        
        # Send to rider
        send_mail(
            subject=rider_subject,
            message=rider_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[rider.email],
            fail_silently=False,
        )
        logger.info(f"Sent match notification email to rider {rider.email}")
        
        # Send to driver
        send_mail(
            subject=driver_subject,
            message=driver_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[driver.email],
            fail_silently=False,
        )
        logger.info(f"Sent match notification email to driver {driver.email}")
        
    except Exception as e:
        logger.error(f"Error sending ride match emails: {str(e)}")
        logger.exception("Full exception details")
