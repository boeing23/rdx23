import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';

// Google Maps script loader with error handling
const loadGoogleMapsScript = (callback) => {
  if (window.google && window.google.maps) {
    callback();
    return;
  }

  const API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY'; // Replace with your actual API key in .env
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places,geometry`;
  script.async = true;
  script.defer = true;
  
  script.onload = () => {
    callback();
  };
  
  script.onerror = () => {
    console.error('Failed to load Google Maps API');
  };
  
  document.head.appendChild(script);
};

const MapComponent = ({ 
  pickupLocation, 
  dropoffLocation,
  pickupCoordinates, 
  dropoffCoordinates,
  optimizedPickupCoordinates,
  optimizedDropoffCoordinates,
  showUserLocation = true
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [distanceToPickup, setDistanceToPickup] = useState(null);
  const [timeToPickup, setTimeToPickup] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const markersRef = useRef([]);
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  
  // Parse coordinates, accepting different formats
  const parseCoordinates = useCallback((coords) => {
    if (!coords) return null;
    
    // If coords is already a {lat, lng} object
    if (coords.lat !== undefined && coords.lng !== undefined) {
      return { lat: parseFloat(coords.lat), lng: parseFloat(coords.lng) };
    }
    
    // If coords is [lng, lat] array (GeoJSON format)
    if (Array.isArray(coords) && coords.length === 2) {
      return { lat: parseFloat(coords[1]), lng: parseFloat(coords[0]) };
    }
    
    // If coords is a {latitude, longitude} object
    if (coords.latitude !== undefined && coords.longitude !== undefined) {
      return { lat: parseFloat(coords.latitude), lng: parseFloat(coords.longitude) };
    }
    
    // If coords is a string "lat,lng"
    if (typeof coords === 'string' && coords.includes(',')) {
      const [lat, lng] = coords.split(',').map(parseFloat);
      return { lat, lng };
    }
    
    return null;
  }, []);
  
  // Get user's current location using browser geolocation
  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(userPos);
      },
      (err) => {
        console.error("Error getting user location:", err);
        setError("Unable to get your current location. " + err.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, []);
  
  // Initialize Google Maps when script loads
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;
    
    try {
      setLoading(true);
      
      // Create map instance
      const pickup = parseCoordinates(optimizedPickupCoordinates || pickupCoordinates);
      const dropoff = parseCoordinates(optimizedDropoffCoordinates || dropoffCoordinates);
      
      if (!pickup || !dropoff) {
        setError("Invalid location coordinates");
        setLoading(false);
        return;
      }
      
      // Create the map centered between pickup and dropoff
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(pickup);
      bounds.extend(dropoff);
      
      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 12,
        mapTypeId: 'roadmap',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });
      
      map.fitBounds(bounds);
      googleMapRef.current = map;
      
      // Add markers for pickup and dropoff
      const pickupMarker = new window.google.maps.Marker({
        position: pickup,
        map: map,
        title: "Pickup Location",
        label: "P",
        animation: window.google.maps.Animation.DROP
      });
      
      const dropoffMarker = new window.google.maps.Marker({
        position: dropoff,
        map: map,
        title: "Dropoff Location",
        label: "D",
        animation: window.google.maps.Animation.DROP
      });
      
      markersRef.current.push(pickupMarker, dropoffMarker);
      
      // Add info windows
      const pickupInfoWindow = new window.google.maps.InfoWindow({
        content: `<div style="padding: 10px;"><strong>Pickup:</strong> ${pickupLocation}</div>`
      });
      
      const dropoffInfoWindow = new window.google.maps.InfoWindow({
        content: `<div style="padding: 10px;"><strong>Dropoff:</strong> ${dropoffLocation}</div>`
      });
      
      pickupMarker.addListener('click', () => {
        pickupInfoWindow.open(map, pickupMarker);
      });
      
      dropoffMarker.addListener('click', () => {
        dropoffInfoWindow.open(map, dropoffMarker);
      });
      
      // Set up directions service
      directionsServiceRef.current = new window.google.maps.DirectionsService();
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#3f51b5',
          strokeWeight: 5,
          strokeOpacity: 0.7
        }
      });
      
      directionsRendererRef.current.setMap(map);
      
      // Calculate and display route between pickup and dropoff
      directionsServiceRef.current.route(
        {
          origin: pickup,
          destination: dropoff,
          travelMode: 'DRIVING',
        },
        (response, status) => {
          if (status === 'OK') {
            directionsRendererRef.current.setDirections(response);
          } else {
            console.error(`Directions request failed: ${status}`);
          }
        }
      );
      
      setMapLoaded(true);
      setLoading(false);
    } catch (err) {
      console.error("Error initializing map:", err);
      setError("Failed to initialize map. Please try again later.");
      setLoading(false);
    }
  }, [pickupCoordinates, dropoffCoordinates, optimizedPickupCoordinates, optimizedDropoffCoordinates, pickupLocation, dropoffLocation, parseCoordinates]);
  
  // Get distance from user to pickup location
  const calculateDistanceToPickup = useCallback(() => {
    if (!userLocation || !mapLoaded || !window.google || !directionsServiceRef.current) return;
    
    const pickup = parseCoordinates(optimizedPickupCoordinates || pickupCoordinates);
    if (!pickup) return;
    
    // Use the Distance Matrix API to get precise distance and time
    const service = new window.google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [userLocation],
        destinations: [pickup],
        travelMode: 'DRIVING',
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
          const distance = response.rows[0].elements[0].distance.text;
          const duration = response.rows[0].elements[0].duration.text;
          
          setDistanceToPickup(distance);
          setTimeToPickup(duration);
          
          // Add user location marker if it doesn't exist
          if (markersRef.current.length === 2) {
            const userMarker = new window.google.maps.Marker({
              position: userLocation,
              map: googleMapRef.current,
              title: "Your Location",
              label: "YOU",
              animation: window.google.maps.Animation.DROP,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                scale: 8
              }
            });
            
            markersRef.current.push(userMarker);
            
            // Extend bounds to include user location
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(userLocation);
            bounds.extend(pickup);
            googleMapRef.current.fitBounds(bounds);
            
            // Show route from user to pickup
            const userToPickupRenderer = new window.google.maps.DirectionsRenderer({
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: '#4CAF50',
                strokeWeight: 4,
                strokeOpacity: 0.6,
                icons: [{
                  icon: { path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                  repeat: '100px'
                }]
              }
            });
            
            userToPickupRenderer.setMap(googleMapRef.current);
            
            directionsServiceRef.current.route(
              {
                origin: userLocation,
                destination: pickup,
                travelMode: 'DRIVING',
              },
              (response, status) => {
                if (status === 'OK') {
                  userToPickupRenderer.setDirections(response);
                }
              }
            );
          }
        }
      }
    );
  }, [userLocation, mapLoaded, pickupCoordinates, optimizedPickupCoordinates, parseCoordinates]);
  
  // Load Google Maps script
  useEffect(() => {
    loadGoogleMapsScript(() => {
      initMap();
    });
    
    return () => {
      // Clean up markers when component unmounts
      if (markersRef.current) {
        markersRef.current.forEach(marker => {
          if (marker) marker.setMap(null);
        });
      }
    };
  }, [initMap]);
  
  // Get user location when component mounts
  useEffect(() => {
    if (showUserLocation) {
      getUserLocation();
    }
  }, [showUserLocation, getUserLocation]);
  
  // Calculate distance when user location and map are both ready
  useEffect(() => {
    if (userLocation && mapLoaded) {
      calculateDistanceToPickup();
    }
  }, [userLocation, mapLoaded, calculateDistanceToPickup]);
  
  if (error) {
    return (
      <Alert severity="error" sx={{ my: 2 }}>
        {error}
      </Alert>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" height="100%">
          <CircularProgress />
        </Box>
      )}
      
      <Box ref={mapRef} sx={{ width: '100%', height: 400, borderRadius: 1, mb: 2 }} />
      
      {mapLoaded && distanceToPickup && timeToPickup && (
        <Paper elevation={1} sx={{ p: 2, borderRadius: 1, mb: 2, bgcolor: '#f5f5f5' }}>
          <Typography variant="body1">
            <strong>Distance to pickup:</strong> {distanceToPickup}
          </Typography>
          <Typography variant="body1">
            <strong>Estimated time to pickup:</strong> {timeToPickup}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default MapComponent; 