import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';

const OpenRouteMap = ({ 
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
  const mapInstanceRef = useRef(null);
  
  // Parse coordinates, accepting different formats
  const parseCoordinates = (coords) => {
    if (!coords) return null;
    
    // If coords is already a {lat, lng} object
    if (coords.lat !== undefined && coords.lng !== undefined) {
      return [coords.lng, coords.lat];
    }
    
    // If coords is [lng, lat] array (GeoJSON format)
    if (Array.isArray(coords) && coords.length === 2) {
      return coords;
    }
    
    // If coords is a {latitude, longitude} object
    if (coords.latitude !== undefined && coords.longitude !== undefined) {
      return [coords.longitude, coords.latitude];
    }
    
    // If coords is a string "lat,lng"
    if (typeof coords === 'string' && coords.includes(',')) {
      const [lat, lng] = coords.split(',').map(parseFloat);
      return [lng, lat];
    }
    
    return null;
  };
  
  // Get user's current location using browser geolocation
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userPos = [position.coords.longitude, position.coords.latitude];
        setUserLocation(userPos);
      },
      (err) => {
        console.error("Error getting user location:", err);
        setError("Unable to get your current location. " + err.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };
  
  // Initialize map using OpenRouteService
  const initMap = async () => {
    if (!mapRef.current) return;
    
    try {
      setLoading(true);
      
      const pickup = parseCoordinates(optimizedPickupCoordinates || pickupCoordinates);
      const dropoff = parseCoordinates(optimizedDropoffCoordinates || dropoffCoordinates);
      
      if (!pickup || !dropoff) {
        setError("Invalid location coordinates");
        setLoading(false);
        return;
      }
      
      // Load OpenLayers CSS and JS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/ol/ol.css';
      document.head.appendChild(link);
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/ol/ol.js';
      script.async = true;
      
      script.onload = async () => {
        const ol = window.ol;
        
        // Create map instance
        const map = new ol.Map({
          target: mapRef.current,
          layers: [
            new ol.layer.Tile({
              source: new ol.source.OSM()
            })
          ],
          view: new ol.View({
            center: ol.proj.fromLonLat([(pickup[0] + dropoff[0]) / 2, (pickup[1] + dropoff[1]) / 2]),
            zoom: 12
          })
        });
        
        mapInstanceRef.current = map;
        
        // Add markers for pickup and dropoff
        const pickupMarker = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat(pickup))
        });
        
        const dropoffMarker = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat(dropoff))
        });
        
        const vectorSource = new ol.source.Vector({
          features: [pickupMarker, dropoffMarker]
        });
        
        const vectorLayer = new ol.layer.Vector({
          source: vectorSource,
          style: new ol.style.Style({
            image: new ol.style.Icon({
              anchor: [0.5, 1],
              src: 'https://openlayers.org/en/latest/examples/data/icon.png'
            })
          })
        });
        
        map.addLayer(vectorLayer);
        
        // Get route between pickup and dropoff
        const response = await fetch(
          `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.REACT_APP_OPENROUTE_API_KEY}&start=${pickup[0]},${pickup[1]}&end=${dropoff[0]},${dropoff[1]}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch route');
        }
        
        const data = await response.json();
        
        // Add route to map
        const route = new ol.Feature({
          geometry: new ol.geom.LineString(
            data.features[0].geometry.coordinates.map(coord => ol.proj.fromLonLat(coord))
          )
        });
        
        const routeSource = new ol.source.Vector({
          features: [route]
        });
        
        const routeLayer = new ol.layer.Vector({
          source: routeSource,
          style: new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#3f51b5',
              width: 5
            })
          })
        });
        
        map.addLayer(routeLayer);
        
        // Fit map to show entire route
        const extent = routeSource.getExtent();
        map.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          maxZoom: 15
        });
        
        setMapLoaded(true);
        setLoading(false);
      };
      
      document.head.appendChild(script);
      
    } catch (err) {
      console.error("Error initializing map:", err);
      setError("Failed to initialize map. Please try again later.");
      setLoading(false);
    }
  };
  
  // Calculate distance from user to pickup location
  const calculateDistanceToPickup = async () => {
    if (!userLocation || !mapLoaded) return;
    
    const pickup = parseCoordinates(optimizedPickupCoordinates || pickupCoordinates);
    if (!pickup) return;
    
    try {
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${process.env.REACT_APP_OPENROUTE_API_KEY}&start=${userLocation[0]},${userLocation[1]}&end=${pickup[0]},${pickup[1]}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch distance');
      }
      
      const data = await response.json();
      
      // Convert meters to miles and seconds to minutes
      const distance = (data.features[0].properties.segments[0].distance / 1609.34).toFixed(1);
      const duration = Math.round(data.features[0].properties.segments[0].duration / 60);
      
      setDistanceToPickup(`${distance} miles`);
      setTimeToPickup(`${duration} minutes`);
      
    } catch (err) {
      console.error("Error calculating distance:", err);
    }
  };
  
  // Load map when component mounts
  useEffect(() => {
    initMap();
    
    return () => {
      // Clean up map instance when component unmounts
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
      }
    };
  }, []);
  
  // Get user location when component mounts
  useEffect(() => {
    if (showUserLocation) {
      getUserLocation();
    }
  }, [showUserLocation]);
  
  // Calculate distance when user location and map are both ready
  useEffect(() => {
    if (userLocation && mapLoaded) {
      calculateDistanceToPickup();
    }
  }, [userLocation, mapLoaded]);
  
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

export default OpenRouteMap; 