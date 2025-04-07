Fixed version of the file

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
            
            dist = get_route_driving_distance(closest_lng_lat, rider_pickup_lng_lat)
        except Exception as e:
            logger.warning(f"Failed to get driving distance, using great_circle: {str(e)}")
            dist = great_circle(closest, rider_pickup).kilometers
            
        if dist < min_pickup_dist:
            min_pickup_dist = dist
            pickup_index = i
            optimal_pickup = closest
