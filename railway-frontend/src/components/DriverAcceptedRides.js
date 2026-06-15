import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  Button,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import { Schedule, LocationOn, Person, Phone, Email, Event, AccessTime, Cancel, CheckCircle, DirectionsCar, Refresh, EventSeat } from '@mui/icons-material';
import { API_BASE_URL } from '../config';
import { format } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

// Fix Leaflet marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});

const DriverAcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [openCompleteDialog, setOpenCompleteDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [driverDetails, setDriverDetails] = useState(null);

  const fetchAcceptedRides = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to view your trips');
        setLoading(false);
        return;
      }

      const cleanToken = token.trim().replace(/^['"](.*)['"]$/, '$1');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
      
      try {
        console.log(`Fetching accepted rides from: ${API_BASE_URL}/api/rides/rides/`);
        
        const response = await fetch(`${API_BASE_URL}/api/rides/rides/`, {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        if (!response.ok) {
          console.error(`API response error: ${response.status} ${response.statusText}`);
          setError(`Failed to fetch accepted rides: ${response.status}`);
          setLoading(false);
          return;
        } 

        const data = await response.json();
        
        // DEBUG: Log the raw response structure to examine the fields
        console.log('---------------- DEBUGGING API RESPONSE ----------------');
        console.log('Raw API response data structure:', Array.isArray(data) ? 'Array of ' + data.length + ' items' : typeof data);
        
        // Check the first item in detail if available
        if (Array.isArray(data) && data.length > 0) {
          const firstRide = data[0];
          console.log('First ride object keys:', Object.keys(firstRide));
          console.log('First ride optimal_pickup_point:', firstRide.optimal_pickup_point);
          console.log('First ride nearest_dropoff_point:', firstRide.nearest_dropoff_point);
          console.log('First ride coordinates:', {
            pickup: {
              direct: { lat: firstRide.pickup_latitude, lng: firstRide.pickup_longitude },
              fromAPI: firstRide.optimal_pickup_point
            },
            dropoff: {
              direct: { lat: firstRide.dropoff_latitude, lng: firstRide.dropoff_longitude },
              fromAPI: firstRide.nearest_dropoff_point
            }
          });

          // Check location data
          console.log('Location data check:', {
            pickup_location: firstRide.pickup_location,
            dropoff_location: firstRide.dropoff_location,
            start_location: firstRide.start_location,
            end_location: firstRide.end_location,
            nested_ride: firstRide.ride ? {
              start: firstRide.ride.start_location,
              end: firstRide.ride.end_location
            } : 'No nested ride object'
          });
        }
        console.log('-------------------------------------------------------');
        
        if (!Array.isArray(data)) {
          console.error('Expected array but got:', typeof data, data);
          setError('Received invalid data format from the server');
          setAcceptedRides([]);
          setLoading(false);
          return;
        }
        
        const processedRides = data.map(ride => {
          console.log(`Processing ride ${ride.id}:`, {
            raw: ride,
            pickup: {
              direct: { lat: ride.pickup_latitude, lng: ride.pickup_longitude },
              optimal: ride.optimal_pickup_point,
              info: ride.optimal_pickup_info
            },
            dropoff: {
              direct: { lat: ride.dropoff_latitude, lng: ride.dropoff_longitude },
              nearest: ride.nearest_dropoff_point,
              info: ride.nearest_dropoff_info
            }
          });

          // DEBUG: Inspect the original API response structure to find why optimal points are missing
          console.log(`DEBUG: Ride ${ride.id} available fields:`, Object.keys(ride));
          
          // Check if the optimal points exist but under different field names
          const allPossibleFields = {
            pickup: [
              'optimal_pickup_point', 'optimal_pickup', 'pickup_optimal_point', 
              'pickup_point', 'start_optimal', 'optimized_pickup'
            ],
            dropoff: [
              'nearest_dropoff_point', 'nearest_dropoff', 'dropoff_nearest_point',
              'dropoff_point', 'end_nearest', 'optimized_dropoff'
            ]
          };
          
          let foundOptimalPickup = null;
          let foundNearestDropoff = null;
          
          // Check all possible field names
          for (const field of allPossibleFields.pickup) {
            if (ride[field] && typeof ride[field] === 'object') {
              console.log(`DEBUG: Found potential optimal pickup in field "${field}":`, ride[field]);
              foundOptimalPickup = ride[field];
              break;
            }
          }
          
          for (const field of allPossibleFields.dropoff) {
            if (ride[field] && typeof ride[field] === 'object') {
              console.log(`DEBUG: Found potential nearest dropoff in field "${field}":`, ride[field]);
              foundNearestDropoff = ride[field];
              break;
            }
          }
          
          // Check if coordinates might be nested inside another object
          if (!foundOptimalPickup && ride.pickup && typeof ride.pickup === 'object') {
            console.log(`DEBUG: Checking for optimal pickup inside 'pickup' object:`);
            for (const field of allPossibleFields.pickup) {
              if (ride.pickup[field] && typeof ride.pickup[field] === 'object') {
                console.log(`DEBUG: Found nested optimal pickup in pickup.${field}:`, ride.pickup[field]);
                foundOptimalPickup = ride.pickup[field];
                break;
              }
            }
          }
          
          if (!foundNearestDropoff && ride.dropoff && typeof ride.dropoff === 'object') {
            console.log(`DEBUG: Checking for nearest dropoff inside 'dropoff' object:`);
            for (const field of allPossibleFields.dropoff) {
              if (ride.dropoff[field] && typeof ride.dropoff[field] === 'object') {
                console.log(`DEBUG: Found nested nearest dropoff in dropoff.${field}:`, ride.dropoff[field]);
                foundNearestDropoff = ride.dropoff[field];
                break;
              }
            }
          }
          
          // Continue with existing processing
          let pickupLat = ride.pickup_latitude || ride.start_latitude;
          let pickupLng = ride.pickup_longitude || ride.start_longitude;
          let dropoffLat = ride.dropoff_latitude || ride.end_latitude;
          let dropoffLng = ride.dropoff_longitude || ride.end_longitude;

          // Check for optimal pickup point
          if ((!pickupLat || !pickupLng) && ride.optimal_pickup_point) {
            if (typeof ride.optimal_pickup_point.latitude === 'number' && 
                typeof ride.optimal_pickup_point.longitude === 'number') {
              pickupLat = ride.optimal_pickup_point.longitude;
              pickupLng = ride.optimal_pickup_point.latitude;
              console.log(`Using optimal pickup point for ride ${ride.id}:`, {
                lat: pickupLat,
                lng: pickupLng
              });
            }
          }

          // Check for nearest dropoff point
          if ((!dropoffLat || !dropoffLng) && ride.nearest_dropoff_point) {
            if (typeof ride.nearest_dropoff_point.latitude === 'number' && 
                typeof ride.nearest_dropoff_point.longitude === 'number') {
              dropoffLat = ride.nearest_dropoff_point.longitude;
              dropoffLng = ride.nearest_dropoff_point.latitude;
              console.log(`Using nearest dropoff point for ride ${ride.id}:`, {
                lat: dropoffLat,
                lng: dropoffLng
              });
            }
          }

          // Check for coordinates in info objects
          if ((!pickupLat || !pickupLng) && ride.optimal_pickup_info?.coordinates) {
            if (Array.isArray(ride.optimal_pickup_info.coordinates) && 
                ride.optimal_pickup_info.coordinates.length >= 2) {
              pickupLng = ride.optimal_pickup_info.coordinates[0];
              pickupLat = ride.optimal_pickup_info.coordinates[1];
              console.log(`Using optimal pickup info for ride ${ride.id}:`, {
                lat: pickupLat,
                lng: pickupLng
              });
            }
          }

          if ((!dropoffLat || !dropoffLng) && ride.nearest_dropoff_info?.coordinates) {
            if (Array.isArray(ride.nearest_dropoff_info.coordinates) && 
                ride.nearest_dropoff_info.coordinates.length >= 2) {
              dropoffLng = ride.nearest_dropoff_info.coordinates[0];
              dropoffLat = ride.nearest_dropoff_info.coordinates[1];
              console.log(`Using nearest dropoff info for ride ${ride.id}:`, {
                lat: dropoffLat,
                lng: dropoffLng
              });
            }
          }

          if (!pickupLat || !pickupLng) {
            console.warn(`Missing pickup coordinates for ride ${ride.id}`);
          }
          if (!dropoffLat || !dropoffLng) {
            console.warn(`Missing dropoff coordinates for ride ${ride.id}`);
          }

          // Create fallback optimal points if we found alternative fields or use direct coordinates
          let optimal_pickup_point = ride.optimal_pickup_point || foundOptimalPickup;
          let nearest_dropoff_point = ride.nearest_dropoff_point || foundNearestDropoff;
          
          // If still no optimal points but we have coordinates, create fallbacks
          if (!optimal_pickup_point && pickupLat && pickupLng) {
            console.log(`DEBUG: Creating fallback optimal_pickup_point for ride ${ride.id}`);
            optimal_pickup_point = {
              latitude: pickupLng, // API swaps lat/lng
              longitude: pickupLat,
              address: ride.pickup_location || "Pickup Location",
              distance: 0
            };
          }
          
          if (!nearest_dropoff_point && dropoffLat && dropoffLng) {
            console.log(`DEBUG: Creating fallback nearest_dropoff_point for ride ${ride.id}`);
            nearest_dropoff_point = {
              latitude: dropoffLng, // API swaps lat/lng
              longitude: dropoffLat,
              address: ride.dropoff_location || "Dropoff Location",
              distance: 0
            };
          }

          // Preserve all coordinate-related fields
          return {
            ...ride,
            pickup_latitude: pickupLat,
            pickup_longitude: pickupLng,
            dropoff_latitude: dropoffLat,
            dropoff_longitude: dropoffLng,
            optimal_pickup_point: optimal_pickup_point,
            optimal_pickup_info: ride.optimal_pickup_info,
            nearest_dropoff_point: nearest_dropoff_point,
            nearest_dropoff_info: ride.nearest_dropoff_info,
            rider_id: ride.rider_id || (ride.rider && ride.rider.id) || null,
            rider_details: ride.rider_details || null
          };
        });

        setAcceptedRides(processedRides);
        setError('');
        setLoading(false);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
        setError(`Error: ${err.message || 'Something went wrong'}`);
      setLoading(false);
    }
  };

  // Fetch pending ride requests to show drivers what riders are waiting
  const fetchPendingRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        return;
      }

      // Clean the token (remove quotes or spaces)
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      
      console.log(`Fetching pending ride requests from: ${API_BASE_URL}/api/rides/pending-requests/`);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/pending-requests/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('Failed to fetch pending requests:', response.status);
        return;
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('Expected array but got:', typeof data, data);
        return;
      }
      
      // Sort by priority (waiting time)
      const sortedRequests = data.sort((a, b) => {
        // Sort by submission time (oldest first for FIFO priority)
        return new Date(a.created_at) - new Date(b.created_at);
      });
      
      console.log(`Found ${sortedRequests.length} pending ride requests`);
      setPendingRequests(sortedRequests);
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    }
  };

  useEffect(() => {
    fetchAcceptedRides();
    fetchPendingRequests();
    
    // Set up polling for pending ride requests
    const pendingRequestsInterval = setInterval(() => {
      fetchPendingRequests();
    }, 60000); // Every minute
    
    // Listen for new ride request events from the notification system
    const handleNewRideRequests = () => {
      console.log('New ride requests detected, refreshing...');
      fetchPendingRequests();
    };
    
    window.addEventListener('newRideRequests', handleNewRideRequests);
    
    return () => {
      clearInterval(pendingRequestsInterval);
      window.removeEventListener('newRideRequests', handleNewRideRequests);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setLoading(true);
    setError('');
    fetchAcceptedRides();
  };

  const handleRideClick = async (ride) => {
    console.log("Selected ride data:", {
      id: ride.id,
      status: ride.status,
      pickup_location: ride.pickup_location,
      dropoff_location: ride.dropoff_location,
      rider: ride.rider,
      rider_id: ride.rider_id,
      rider_details: ride.rider_details,
      driver_id: ride.driver_id,
      driver: ride.driver,
      ride_obj: ride.ride
    });

    // DEBUG: More detailed logging for coordinate data
    console.log("DEBUG: Selected ride coordinate data:", {
      direct_coordinates: {
        pickup: { lat: ride.pickup_latitude, lng: ride.pickup_longitude },
        dropoff: { lat: ride.dropoff_latitude, lng: ride.dropoff_longitude }
      },
      optimal_pickup: ride.optimal_pickup_point,
      nearest_dropoff: ride.nearest_dropoff_point,
      optimal_info: ride.optimal_pickup_info,
      nearest_info: ride.nearest_dropoff_info
    });
    
    let updatedRide = { ...ride };
    let shouldUpdateRide = false;
    
    // Ensure we have pickup/dropoff locations from the nested ride object if not available directly
    if (!updatedRide.pickup_location && updatedRide.ride && updatedRide.ride.start_location) {
      console.log(`DEBUG: Using nested start_location: ${updatedRide.ride.start_location}`);
      updatedRide.pickup_location = updatedRide.ride.start_location;
      shouldUpdateRide = true;
    } else if (!updatedRide.pickup_location) {
      // Try to get pickup location from the address in optimal_pickup_point
      if (updatedRide.optimal_pickup_point && updatedRide.optimal_pickup_point.address) {
        console.log(`DEBUG: Using address from optimal_pickup_point: ${updatedRide.optimal_pickup_point.address}`);
        updatedRide.pickup_location = updatedRide.optimal_pickup_point.address;
        shouldUpdateRide = true;
      } else {
        console.warn("DEBUG: No pickup location available from any source");
      }
    }
    
    if (!updatedRide.dropoff_location && updatedRide.ride && updatedRide.ride.end_location) {
      console.log(`DEBUG: Using nested end_location: ${updatedRide.ride.end_location}`);
      updatedRide.dropoff_location = updatedRide.ride.end_location;
      shouldUpdateRide = true;
    } else if (!updatedRide.dropoff_location) {
      // Try to get dropoff location from the address in nearest_dropoff_point
      if (updatedRide.nearest_dropoff_point && updatedRide.nearest_dropoff_point.address) {
        console.log(`DEBUG: Using address from nearest_dropoff_point: ${updatedRide.nearest_dropoff_point.address}`);
        updatedRide.dropoff_location = updatedRide.nearest_dropoff_point.address;
        shouldUpdateRide = true;
      } else {
        console.warn("DEBUG: No dropoff location available from any source");
      }
    }
    
    // If the optimal pickup point is missing but we have direct coordinates, create a fallback
    if (!updatedRide.optimal_pickup_point && updatedRide.pickup_latitude && updatedRide.pickup_longitude) {
      console.log("DEBUG: Creating fallback optimal_pickup_point from direct coordinates");
      updatedRide.optimal_pickup_point = {
        latitude: updatedRide.pickup_longitude, // API swaps lat/lng
        longitude: updatedRide.pickup_latitude,
        address: updatedRide.pickup_location || "Pickup Location",
        distance: 0
      };
      shouldUpdateRide = true;
    }
    
    // If the nearest dropoff point is missing but we have direct coordinates, create a fallback
    if (!updatedRide.nearest_dropoff_point && updatedRide.dropoff_latitude && updatedRide.dropoff_longitude) {
      console.log("DEBUG: Creating fallback nearest_dropoff_point from direct coordinates");
      updatedRide.nearest_dropoff_point = {
        latitude: updatedRide.dropoff_longitude, // API swaps lat/lng
        longitude: updatedRide.dropoff_latitude,
        address: updatedRide.dropoff_location || "Dropoff Location",
        distance: 0
      };
      shouldUpdateRide = true;
    }
    
    // Try to extract rider ID from various sources if not already set
    if (!updatedRide.rider_id) {
      if (updatedRide.rider && updatedRide.rider.id) {
        updatedRide.rider_id = updatedRide.rider.id;
        shouldUpdateRide = true;
      } else if (typeof updatedRide.rider === 'number') {
        updatedRide.rider_id = updatedRide.rider;
        shouldUpdateRide = true;
      }
    }
    
    // If the ride doesn't have complete driver info but has a driver ID, fetch it
    if (ride.driver_id && (!ride.driver || !ride.driver.full_name)) {
      try {
        console.log(`Fetching complete driver details for ID: ${ride.driver_id}`);
        const driverDetail = await fetchDriverDetails(ride.driver_id);
        
        if (driverDetail) {
          // Update driver details
          updatedRide = {
            ...updatedRide,
            driver: {
              ...updatedRide.driver,
              ...driverDetail
            }
          };
          shouldUpdateRide = true;
        }
      } catch (err) {
        console.error('Error fetching driver details:', err);
      }
    }
    
    // If rider_details exists, use that info directly for the rider field
    if (ride.rider_details && !ride.rider) {
      updatedRide.rider = {
        ...ride.rider_details,
        id: ride.rider_details.id,
        full_name: ride.rider_details.full_name,
        email: ride.rider_details.email,
        phone_number: ride.rider_details.phone_number
      };
      shouldUpdateRide = true;
    }
    // If the ride doesn't have complete rider info but has a rider ID, fetch it
    else if (ride.rider_id && (!ride.rider_details) && (!ride.rider || typeof ride.rider === 'number' || !ride.rider.first_name)) {
      try {
        console.log(`Fetching complete rider details for ID: ${ride.rider_id}`);
        const riderDetail = await fetchRiderDetails(ride.rider_id);
        
        if (riderDetail) {
          // Update rider details
          updatedRide = {
            ...updatedRide,
            rider: {
              ...updatedRide.rider,
              ...riderDetail,
              full_name: riderDetail.full_name || 
                          `${riderDetail.first_name || ''} ${riderDetail.last_name || ''}`.trim()
            }
          };
          shouldUpdateRide = true;
        }
      } catch (err) {
        console.error('Error fetching rider details:', err);
      }
    }
    
    // Update the ride in the list if needed
    if (shouldUpdateRide) {
      console.log("DEBUG: Updating ride with new data:", {
        pickup_location: updatedRide.pickup_location,
        dropoff_location: updatedRide.dropoff_location,
        has_optimal_pickup: !!updatedRide.optimal_pickup_point,
        has_nearest_dropoff: !!updatedRide.nearest_dropoff_point
      });
      
      setAcceptedRides(prevRides => 
        prevRides.map(r => r.id === ride.id ? updatedRide : r)
      );
    }
    
    // Select the updated ride
    setSelectedRide(updatedRide);
  };

  const getStatusChip = (status) => {
    switch (status) {
      case 'ACCEPTED':
        return <Chip label="Accepted" color="success" size="small" />;
      case 'COMPLETED':
        return <Chip label="Completed" color="primary" size="small" />;
      case 'CANCELLED':
        return <Chip label="Cancelled" color="error" size="small" />;
      default:
        return <Chip label={status} color="default" size="small" />;
    }
  };

  const handleCancelRide = async (rideRequestId) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to cancel a ride');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/cancel/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to cancel ride');
      }

      fetchAcceptedRides();
    } catch (err) {
      console.error('Error cancelling ride:', err);
      setError('Failed to cancel ride. Please try again.');
    }
  };

  const handleCompleteRide = async (rideRequestId) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to complete a ride');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/complete/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to complete ride');
      }

      fetchAcceptedRides();
    } catch (err) {
      console.error('Error completing ride:', err);
      setError('Failed to complete ride. Please try again.');
    }
  };

  const getFullName = (user) => {
    if (!user) return 'Unknown User';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
  };

  // Helper function to check and use rider_details
  const getRiderInfo = (ride) => {
    if (ride.rider_details && ride.rider_details.full_name) {
      return ride.rider_details;
    }
    
    return ride.rider;
  };

  // Helper function to extract driver info from ride object
  const getDriverInfo = (ride) => {
    // Try to get driver from different places in the ride object
    let driverId = null;
    
    // Check direct driver object
    if (ride.driver && typeof ride.driver === 'object' && ride.driver.id) {
      return ride.driver;
    } 
    // Check direct driver ID
    else if (ride.driver && typeof ride.driver === 'number') {
      driverId = ride.driver;
    }
    // Check if driver is nested in ride.ride
    else if (ride.ride && ride.ride.driver) {
      driverId = ride.ride.driver;
    }
    // Check if we only have driver_id
    else if (ride.driver_id) {
      driverId = ride.driver_id;
    }
    
    // If we only have an ID, return a minimal object
    if (driverId) {
      return { id: driverId };
    }
    
    return null;
  };

  const getPhoneNumber = (user) => {
    return user?.phone_number || 'Not provided';
  };

  const getEmail = (user) => {
    return user?.email || 'Not provided';
  };

  const formatDate = (dateString) => {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  const handleOpenCancelDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCancelDialog(true);
  };

  const handleCloseCancelDialog = () => {
    setOpenCancelDialog(false);
  };

  const handleOpenCompleteDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCompleteDialog(true);
  };

  const handleCloseCompleteDialog = () => {
    setOpenCompleteDialog(false);
  };

  const fetchDriverDetails = async (driverId) => {
    try {
      if (!driverId) return null;
      
      const token = localStorage.getItem('token');
      if (!token) return null;

      // Clean the token (define cleanToken within this function scope)
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      
      console.log(`Fetching driver name for ID: ${driverId}`);
      
      // Use the users API endpoint to get driver name
      const response = await axios.get(`${API_BASE_URL}/api/users/${driverId}/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        console.log('Driver name fetched:', response.data);
        return response.data; // This contains name and other user details
      }
    } catch (err) {
      console.error(`Error fetching driver ${driverId} name:`, err);
    }
    return null;
  };

  // Fetch rider details using rider_id
  const fetchRiderDetails = async (riderId) => {
    try {
      if (!riderId) return null;
      
      const token = localStorage.getItem('token');
      if (!token) return null;

      // Clean the token
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      
      console.log(`Fetching rider details for ID: ${riderId}`);
      
      // Use the users API endpoint to get rider details
      const response = await axios.get(`${API_BASE_URL}/api/users/${riderId}/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        console.log('Rider details fetched:', response.data);
        return response.data;
      }
    } catch (err) {
      console.error(`Error fetching rider ${riderId} details:`, err);
    }
    return null;
  };

  // Render pending ride requests section
  const renderPendingRequests = () => {
    if (pendingRequests.length === 0) {
      return null;
    }
    
    return (
      <Paper sx={{ p: 3, mb: 4, borderRadius: '12px' }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <Person sx={{ mr: 1 }} /> Pending Ride Requests ({pendingRequests.length})
        </Typography>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          These riders are waiting for a driver. Consider offering a ride to help them out!
        </Alert>
        
        <List>
          {pendingRequests.map((request, index) => {
            // Calculate waiting time
            const waitingTime = Math.round((new Date() - new Date(request.created_at)) / (1000 * 60));
            const isPriority = waitingTime > 10; // More than 10 minutes is priority
            
            return (
              <Paper 
                key={request.id} 
                elevation={1} 
                sx={{ 
                  mb: 2, 
                  p: 2, 
                  borderLeft: isPriority ? '4px solid #f44336' : '1px solid #e0e0e0',
                  backgroundColor: index === 0 ? '#f9f9f9' : 'white' // Highlight first in queue
                }}
              >
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      From: {request.pickup_location}
                    </Typography>
                    <Typography variant="body2">
                      To: {request.dropoff_location}
                    </Typography>
                    <Typography variant="body2">
                      Departure: {formatDate(request.departure_time)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2">
                      <EventSeat sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                      Seats needed: {request.seats_needed}
                    </Typography>
                    <Typography variant="body2">
                      <AccessTime sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                      Waiting for: {waitingTime} minutes
                    </Typography>
                    
                    {index === 0 && (
                      <Chip 
                        label="First in Queue" 
                        color="primary" 
                        size="small" 
                        sx={{ mt: 1 }} 
                      />
                    )}
                    
                    {isPriority && (
                      <Chip 
                        label="Priority Request" 
                        color="error" 
                        size="small" 
                        sx={{ mt: 1, ml: index === 0 ? 1 : 0 }} 
                      />
                    )}
                    
                    <Box sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        onClick={() => window.location.href = '/offer-ride'}
                      >
                        Offer a Ride
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            );
          })}
        </List>
      </Paper>
    );
  };

  // Debugging steps
  const sampleRide = {
    id: 1,
    rider_details: {
      id: 101,
      full_name: "Yashodhan Hakke",
      first_name: "Yashodhan",
      last_name: "Hakke",
      email: "yashodhan@example.com",
      phone_number: "123-456-7890"
    },
    rider: {
      id: 101,
      first_name: "Yashodhan",
      last_name: "Hakke",
      email: "yashodhan@example.com",
      phone_number: "123-456-7890"
    },
    pickup_location: "123 Main St",
    dropoff_location: "456 Elm St",
    departure_time: "2023-10-10T14:00:00Z",
    status: "ACCEPTED"
  };

  const riderInfo = getRiderInfo(sampleRide);
  console.log("Rider Info:", riderInfo);

  const fullName = getFullName(riderInfo);
  console.log("Full Name:", fullName);

  // Helper function to extract coordinates consistently
  const extractCoordinates = (ride, type = 'pickup') => {
    console.log(`Extracting ${type} coordinates for ride ${ride.id}:`, {
      direct: type === 'pickup' 
        ? { lat: ride.pickup_latitude, lng: ride.pickup_longitude }
        : { lat: ride.dropoff_latitude, lng: ride.dropoff_longitude },
      optimal: type === 'pickup' ? ride.optimal_pickup_point : ride.nearest_dropoff_point,
      info: type === 'pickup' ? ride.optimal_pickup_info : ride.nearest_dropoff_info
    });

    // Get direct coordinates as primary source
    let lat, lng;
    if (type === 'pickup') {
      lat = ride.pickup_latitude;
      lng = ride.pickup_longitude;
    } else {
      lat = ride.dropoff_latitude;
      lng = ride.dropoff_longitude;
    }

    // Validate direct coordinates before proceeding
    const hasDirectCoords = typeof lat === 'number' && typeof lng === 'number' && 
      !isNaN(lat) && !isNaN(lng) && 
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    
    // Get optimal/nearest point
    const point = type === 'pickup' ? ride.optimal_pickup_point : ride.nearest_dropoff_point;
    
    // Check if point exists and has valid coordinates
    if (point && typeof point.latitude === 'number' && typeof point.longitude === 'number') {
      // Check if the distance is reasonable (API reports distance in meters)
      // Skip using this point if distance > 5km or if distance is suspiciously large
      const pointHasValidDistance = typeof point.distance === 'number' && point.distance < 5000;
      
      // Calculate rough distance if direct coordinates are available (using Haversine formula)
      let calculatedDistance = null;
      if (hasDirectCoords) {
        // Remember the API swaps lat/lng, so use point.longitude as lat and point.latitude as lng
        const pointLat = point.longitude;
        const pointLng = point.latitude;
        
        // Calculate distance between points using Haversine formula (rough approximation)
        const toRad = value => value * Math.PI / 180;
        const R = 6371000; // Earth radius in meters
        const dLat = toRad(pointLat - lat);
        const dLon = toRad(pointLng - lng);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat)) * Math.cos(toRad(pointLat)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        calculatedDistance = R * c; // Distance in meters
        
        console.log(`DEBUG: Calculated distance between direct and ${type} optimal point:`, {
          direct: { lat, lng },
          optimal: { lat: pointLat, lng: pointLng },
          apiDistance: point.distance,
          calculatedDistance
        });
      }
      
      // Use point only if distance is valid or we can't calculate it
      if (pointHasValidDistance || (calculatedDistance !== null && calculatedDistance < 5000)) {
        // API returns coordinates as {latitude: lng, longitude: lat}
        const pointLat = point.longitude;
        const pointLng = point.latitude;
        
        // Validate point coordinates
        if (pointLat >= -90 && pointLat <= 90 && pointLng >= -180 && pointLng <= 180) {
          console.log(`Using ${type} point coordinates:`, { lat: pointLat, lng: pointLng });
          return { lat: pointLat, lng: pointLng };
        } else {
          console.warn(`Invalid ${type} point coordinates:`, { lat: pointLat, lng: pointLng });
        }
      } else {
        console.warn(`${type} optimal point is too far away (${point.distance || calculatedDistance}m), using direct coordinates instead`);
      }
    }
    
    // Try coordinates from info object if available
    const info = type === 'pickup' ? ride.optimal_pickup_info : ride.nearest_dropoff_info;
    if (info && Array.isArray(info.coordinates) && info.coordinates.length >= 2) {
      // Coordinates array is [longitude, latitude]
      const infoLng = info.coordinates[0];
      const infoLat = info.coordinates[1];
      
      // Validate info coordinates
      if (infoLat >= -90 && infoLat <= 90 && infoLng >= -180 && infoLng <= 180) {
        console.log(`Using ${type} info coordinates:`, { lat: infoLat, lng: infoLng });
        return { lat: infoLat, lng: infoLng };
      } else {
        console.warn(`Invalid ${type} info coordinates:`, { lat: infoLat, lng: infoLng });
      }
    }

    // Fallback to direct coordinates if they're valid
    if (hasDirectCoords) {
      console.log(`Using direct ${type} coordinates:`, { lat, lng });
      return { lat, lng };
    }
    
    // All options exhausted, no valid coordinates
    console.warn(`No valid ${type} coordinates found:`, { lat, lng });
    return null;
  };

  // Helper function to check if coordinates are valid
  const hasValidCoordinates = (coords) => {
    return coords && typeof coords.lat === 'number' && typeof coords.lng === 'number' &&
           !isNaN(coords.lat) && !isNaN(coords.lng) &&
           coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180;
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          My Trips
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
          <CircularProgress size={40} sx={{ mr: 2 }} />
          <Typography>Loading your trips...</Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          My Trips
        </Typography>
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <Button 
                color="inherit" 
                size="small" 
                startIcon={isRetrying ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
                onClick={handleRetry}
                disabled={isRetrying}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
          <Typography variant="h5" gutterBottom>
            Unable to load your trips
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            We encountered a problem while trying to fetch your trip information. This could be due to:
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Network connectivity issues" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Server maintenance" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Session timeout" />
            </ListItem>
          </List>
          <Box sx={{ mt: 2 }}>
            <Button 
              variant="contained" 
              color="primary"
              onClick={handleRetry}
              startIcon={isRetrying ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
              disabled={isRetrying}
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pt: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        My Trips
      </Typography>

      {/* Render pending ride requests at the top */}
      {renderPendingRequests()}

      {acceptedRides.length === 0 ? (
        <Paper elevation={2} sx={{ p: 4, borderRadius: '12px', mt: 3, textAlign: 'center' }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center',
            py: 4
          }}>
            <DirectionsCar sx={{ fontSize: 80, color: '#861F41', mb: 2, opacity: 0.8 }} />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41' }}>
              No passengers yet? Your car is waiting!
            </Typography>
            <Typography variant="body1" gutterBottom color="text.secondary" sx={{ maxWidth: 600, mb: 3 }}>
              You haven't accepted any ride requests yet. Check out the available requests and start driving!
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => window.location.href = '/rides'}
              sx={{ 
                borderRadius: '12px',
                py: 1.5,
                px: 4,
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: '#861F41', 
                '&:hover': { bgcolor: '#5e0d29' }
              }}
            >
              Find Passengers
            </Button>
          </Box>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* List of rides */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ maxHeight: '70vh', overflow: 'auto' }}>
              <List>
                {acceptedRides.map((ride) => (
                  <ListItem
                    key={ride.id}
                    button
                    selected={selectedRide?.id === ride.id}
                    onClick={() => handleRideClick(ride)}
                  >
                    <ListItemIcon>
                      <Avatar>
                        <Person />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={getFullName(getRiderInfo(ride))}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(ride.departure_time)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {ride.pickup_location} → {ride.dropoff_location}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      {getStatusChip(ride.status)}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* Ride details */}
          <Grid item xs={12} md={8}>
            {selectedRide ? (
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Ride Details</Typography>
                    {selectedRide.status === 'ACCEPTED' && (
                      <Box>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<Cancel />}
                          onClick={() => handleOpenCancelDialog(selectedRide)}
                          sx={{ mr: 1 }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<CheckCircle />}
                          onClick={() => handleOpenCompleteDialog(selectedRide)}
                        >
                          Complete
                        </Button>
                      </Box>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom fontWeight="bold" color="primary">
                        Passenger Information
                      </Typography>
                      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Person sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body1" fontWeight="medium">
                            {selectedRide.rider_details?.full_name || getFullName(getRiderInfo(selectedRide)) || 'Unknown Passenger'}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Phone sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body1">
                            {selectedRide.rider_details?.phone_number || getPhoneNumber(getRiderInfo(selectedRide)) !== 'Not provided' ? (
                              <Button 
                                size="small" 
                                startIcon={<Phone fontSize="small" />}
                                variant="outlined"
                                onClick={() => window.open(`tel:${selectedRide.rider_details?.phone_number || getPhoneNumber(getRiderInfo(selectedRide))}`, '_blank')}
                              >
                                {selectedRide.rider_details?.phone_number || getPhoneNumber(getRiderInfo(selectedRide))}
                              </Button>
                            ) : (
                              'Phone number not provided'
                            )}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Email sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body1">
                            {selectedRide.rider_details?.email || getEmail(getRiderInfo(selectedRide)) !== 'Not provided' ? (
                              <Button 
                                size="small" 
                                startIcon={<Email fontSize="small" />}
                                variant="outlined"
                                onClick={() => window.open(`mailto:${selectedRide.rider_details?.email || getEmail(getRiderInfo(selectedRide))}`, '_blank')}
                              >
                                {selectedRide.rider_details?.email || getEmail(getRiderInfo(selectedRide))}
                              </Button>
                            ) : (
                              'Email not provided'
                            )}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <EventSeat sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body1">
                            <Chip 
                              label={`${selectedRide.seats_needed} seat${selectedRide.seats_needed !== 1 ? 's' : ''} requested`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Typography>
                        </Box>
                      </Paper>
                    </Grid>

                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom fontWeight="bold" color="primary">
                        Trip Details
                      </Typography>
                      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                              <LocationOn sx={{ mr: 1, mt: 0.5, color: 'green' }} />
                              <Box>
                                <Typography variant="body2" color="text.secondary">Pickup Location:</Typography>
                                <Typography variant="body1" fontWeight="medium">{selectedRide.pickup_location}</Typography>
                                <Button 
                                  size="small" 
                                  sx={{ mt: 0.5 }}
                                  startIcon={<LocationOn fontSize="small" />}
                                  variant="outlined"
                                  color="success"
                                  onClick={() => {
                                    const pickupCoords = extractCoordinates(selectedRide, 'pickup');
                                    if (hasValidCoordinates(pickupCoords)) {
                                      window.open(`https://maps.google.com/?q=${pickupCoords.lat},${pickupCoords.lng}`, '_blank');
                                    } else {
                                      console.error('Invalid pickup coordinates for maps link');
                                    }
                                  }}
                                >
                                  Open in Maps
                                </Button>
                              </Box>
                            </Box>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                              <LocationOn sx={{ mr: 1, mt: 0.5, color: 'error.main' }} />
                              <Box>
                                <Typography variant="body2" color="text.secondary">Dropoff Location:</Typography>
                                <Typography variant="body1" fontWeight="medium">{selectedRide.dropoff_location}</Typography>
                                <Button 
                                  size="small" 
                                  sx={{ mt: 0.5 }}
                                  startIcon={<LocationOn fontSize="small" />}
                                  variant="outlined"
                                  color="error"
                                  onClick={() => {
                                    const dropoffCoords = extractCoordinates(selectedRide, 'dropoff');
                                    if (hasValidCoordinates(dropoffCoords)) {
                                      window.open(`https://maps.google.com/?q=${dropoffCoords.lat},${dropoffCoords.lng}`, '_blank');
                                    } else {
                                      console.error('Invalid dropoff coordinates for maps link');
                                    }
                                  }}
                                >
                                  Open in Maps
                                </Button>
                              </Box>
                            </Box>
                          </Grid>
                        </Grid>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, mt: 2 }}>
                          <Event sx={{ mr: 1, color: 'primary.main' }} />
                          <Typography variant="body1">Date: {formatDate(selectedRide.departure_time)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                          <Button 
                            fullWidth
                            variant="contained" 
                            color="primary"
                            startIcon={<DirectionsCar />}
                            onClick={() => {
                              const pickupCoords = extractCoordinates(selectedRide, 'pickup');
                              const dropoffCoords = extractCoordinates(selectedRide, 'dropoff');
                              
                              console.log('Coordinates for driving directions:', {
                                pickup: pickupCoords,
                                dropoff: dropoffCoords
                              });

                              if (hasValidCoordinates(pickupCoords) && hasValidCoordinates(dropoffCoords)) {
                                window.open(
                                  `https://www.google.com/maps/dir/?api=1&origin=${pickupCoords.lat},${pickupCoords.lng}&destination=${dropoffCoords.lat},${dropoffCoords.lng}&travelmode=driving`,
                                  '_blank'
                                );
                              } else {
                                console.error('Invalid coordinates for driving directions');
                              }
                            }}
                          >
                            Get Driving Directions
                          </Button>
                        </Box>
                      </Paper>
                    </Grid>

                    {/* Add Route Map */}
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom fontWeight="bold" color="primary">
                        Route Map
                      </Typography>
                      <Paper elevation={1} sx={{ p: 0, overflow: 'hidden' }}>
                        <Box sx={{ height: '300px', width: '100%', overflow: 'hidden' }}>
                          {(() => {
                            if (!selectedRide) return null;

                            // Extract coordinates using helper function
                            const pickupCoords = extractCoordinates(selectedRide, 'pickup');
                            const dropoffCoords = extractCoordinates(selectedRide, 'dropoff');

                            console.log('Final coordinates for map:', {
                              pickup: pickupCoords,
                              dropoff: dropoffCoords
                            });

                            // Only render map if we have valid coordinates
                            if (!hasValidCoordinates(pickupCoords) || !hasValidCoordinates(dropoffCoords)) {
                              return (
                                <Box sx={{ 
                                  height: '100%', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  bgcolor: '#f5f5f5'
                                }}>
                                  <Typography color="text.secondary">
                                    Map cannot be displayed - Invalid or missing coordinates
                                  </Typography>
                                </Box>
                              );
                            }
                            
                            // Calculate center point
                            const centerLat = (pickupCoords.lat + dropoffCoords.lat) / 2;
                            const centerLng = (pickupCoords.lng + dropoffCoords.lng) / 2;
                            
                            return (
                              <MapContainer 
                                center={[centerLat, centerLng]} 
                                zoom={13} 
                                style={{ height: '100%', width: '100%' }}
                              >
                                <TileLayer
                                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <Marker position={[pickupCoords.lat, pickupCoords.lng]}>
                                  <Popup>
                                    <strong>Pickup:</strong> {selectedRide.pickup_location}
                                  </Popup>
                                </Marker>
                                <Marker position={[dropoffCoords.lat, dropoffCoords.lng]}>
                                  <Popup>
                                    <strong>Dropoff:</strong> {selectedRide.dropoff_location}
                                  </Popup>
                                </Marker>
                                <Polyline 
                                  positions={[[pickupCoords.lat, pickupCoords.lng], [dropoffCoords.lat, dropoffCoords.lng]]}
                                  color="#861F41"
                                  weight={4}
                                />
                              </MapContainer>
                            );
                          })()}
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography>Select a ride to view details</Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {/* Cancel Dialog */}
      <Dialog open={openCancelDialog} onClose={handleCloseCancelDialog}>
        <DialogTitle>Cancel Ride</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to cancel this ride? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCancelDialog}>No, Keep It</Button>
          <Button
            onClick={() => {
              handleCancelRide(selectedRide.id);
              handleCloseCancelDialog();
            }}
            color="error"
            variant="contained"
          >
            Yes, Cancel It
          </Button>
        </DialogActions>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={openCompleteDialog} onClose={handleCloseCompleteDialog}>
        <DialogTitle>Complete Ride</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to mark this ride as completed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCompleteDialog}>No, Keep It</Button>
          <Button
            onClick={() => {
              handleCompleteRide(selectedRide.id);
              handleCloseCompleteDialog();
            }}
            color="primary"
            variant="contained"
          >
            Yes, Complete It
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DriverAcceptedRides; 