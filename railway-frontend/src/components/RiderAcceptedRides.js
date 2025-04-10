import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  CircularProgress,
  Divider
} from '@mui/material';
import { Schedule, LocationOn, Person, Phone, Email, Event, AccessTime, Cancel, Refresh, DirectionsCar, DriveEta, EventSeat } from '@mui/icons-material';
import { API_BASE_URL, getAuthHeader, getAuthHeadersWithContentType } from '../config';
import { format } from 'date-fns';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './RideTablet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native-web';
// Remove unnecessary imports
// import { Icon } from 'react-native-elements';

// Fix Leaflet marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});

const RiderAcceptedRides = () => {
  const navigate = useNavigate();
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const { authState } = useAuth();
  const [success, setSuccess] = useState('');

  const fetchAcceptedRides = async () => {
    setLoading(true);
    setError(null);
    setRetryable(false);
    
    try {
      console.log('Fetching accepted rides...');
      
      let response;
      try {
        // Log token before API call
        const token = localStorage.getItem('token');
        console.log('Token before API call:', token ? `${token.substring(0, 10)}...` : 'no token');
        console.log('Auth header for API call:', JSON.stringify(getAuthHeader()));
        
        response = await axios.get(`${API_BASE_URL}/api/rides/requests/accepted/`, {
          headers: getAuthHeader()
        });
        
        console.log('Accepted rides API call successful');
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        // Check the raw response format
        console.log('Response type:', typeof response.data);
        
        if (Array.isArray(response.data)) {
          console.log('Response is array with', response.data.length, 'items');
          
          // Check structure of the first item
          if (response.data.length > 0) {
            const sampleRide = response.data[0];
            console.log('Sample ride fields:', Object.keys(sampleRide));
            
            // Check specifically for problematic fields
            console.log('Has optimal_pickup_point?', 'optimal_pickup_point' in sampleRide);
            console.log('Optimal pickup value:', sampleRide.optimal_pickup_point);
            console.log('Type of optimal pickup:', typeof sampleRide.optimal_pickup_point);
            
            console.log('Has nearest_dropoff_point?', 'nearest_dropoff_point' in sampleRide);
            console.log('Nearest dropoff value:', sampleRide.nearest_dropoff_point);
            console.log('Type of nearest dropoff:', typeof sampleRide.nearest_dropoff_point);
            
            // Check driver info
            console.log('Has driver_id?', 'driver_id' in sampleRide);
            console.log('Driver ID value:', sampleRide.driver_id);
            
            console.log('Has driver_name?', 'driver_name' in sampleRide);
            console.log('Driver name value:', sampleRide.driver_name);
          }
        }
        
        console.log('Full accepted rides data:', JSON.stringify(response.data, null, 2));
      } catch (apiError) {
        console.error('API Error fetching accepted rides:', apiError);
        
        // More detailed error logging
        if (apiError.response) {
          console.error('Error status:', apiError.response.status);
          console.error('Error headers:', apiError.response.headers);
          console.error('Error data:', apiError.response.data);
        } else if (apiError.request) {
          console.error('No response received', apiError.request);
        } else {
          console.error('Error message:', apiError.message);
        }
        
        // If we get a 500 error, try using our fallback data structure
        if (apiError.response && apiError.response.status === 500) {
          console.log('Encountered 500 error, attempting to create fallback data');
          setRetryable(true);
          
          // Create fallback placeholder ride data
          const fallbackRides = [{
            id: 'fallback-1',
            status: 'ACCEPTED',
            ride_id: 'unknown',
            pickup_location: 'Unable to load from server',
            dropoff_location: 'Unable to load from server',
            departure_time: new Date().toISOString(),
            seats_needed: 1,
            driver: {
              id: null,
              first_name: '',
              last_name: '',
              full_name: 'Driver information unavailable',
              email: null,
              phone_number: null,
              vehicle_make: null,
              vehicle_model: null,
              vehicle_color: null,
              license_plate: null
            }
          }];
          
          setAcceptedRides(fallbackRides);
          throw new Error('Server returned 500 error - possible data format issue');
        }
        
        // Re-throw for normal error handling
        throw apiError;
      }
      
      // Map the response data based on its structure
      let mappedRides = [];
      
      if (Array.isArray(response.data)) {
        console.log('Response is array format (simplified fallback)');
        // This is the simplified fallback format returned by the backend
        mappedRides = response.data.map(ride => {
          console.log('Processing ride in simplified format:', ride);
          
          // Parse driver name into first and last name if available
          let firstName = '', lastName = '';
          if (ride.driver_name) {
            const nameParts = ride.driver_name.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          }
          
          // Create mapped object with all available driver info from API
          return {
            id: ride.id || `temp-${Math.random().toString(36).substring(2, 9)}`,
            status: ride.status || 'PENDING',
            ride_id: ride.ride_id || (ride.ride && ride.ride.id) || null,
            pickup_location: ride.pickup_location || 'Unknown location',
            dropoff_location: ride.dropoff_location || 'Unknown location',
            departure_time: ride.departure_time || new Date().toISOString(),
            seats_needed: ride.seats_needed || 1,
            ride_details: ride.ride || null, // Store the ride details
            // Extract coordinates from the API response
            pickup_latitude: ride.pickup_latitude || null,
            pickup_longitude: ride.pickup_longitude || null,
            dropoff_latitude: ride.dropoff_latitude || null,
            dropoff_longitude: ride.dropoff_longitude || null,
            driver: {
              id: ride.driver_id || (ride.ride && ride.ride.driver) || null,
              first_name: firstName,
              last_name: lastName,
              full_name: ride.driver_name || 'Unknown Driver',
              email: ride.driver_email || null,
              phone_number: ride.driver_phone || null,
              vehicle_make: ride.vehicle_make || null,
              vehicle_model: ride.vehicle_model || null,
              vehicle_color: ride.vehicle_color || null,
              vehicle_year: ride.vehicle_year || null,
              license_plate: ride.license_plate || null
            }
          };
        });
      } else if (response.data && typeof response.data === 'object') {
        console.log('Response appears to be in object format');
        // Handle single object response (convert to array)
        mappedRides = [safeMapRide(response.data)];
      } else {
        console.log('Response appears to be in standard array format');
        // Safely map all rides using our helper function
        mappedRides = Array.isArray(response.data) ? 
                      response.data.map(safeMapRide) : [];
      }
      
      console.log(`Processed ${mappedRides.length} rides`);
      
      // If no rides were found, create an empty state message
      if (mappedRides.length === 0) {
        setAcceptedRides([]);
        console.log('No rides found');
        return;
      }
      
      // Get the user IDs of all drivers
      const driverIds = mappedRides
        .filter(ride => {
          // Log each ride's driver info for debugging
          console.log(`Ride ${ride.id} driver info:`, {
            driver_obj: ride.driver,
            driver_id: ride.driver?.id,
            ride_obj: ride.ride,
            ride_driver_id: ride.ride?.driver
          });
          
          // Check both possible locations for driver ID
          return (ride.driver && ride.driver.id) || (ride.ride && ride.ride.driver);
        })
        .map(ride => ride.driver?.id || ride.ride?.driver)
        .filter(id => id !== null && id !== undefined);
      
      console.log('Driver IDs to fetch:', driverIds);
      
      // If we have driver IDs, fetch their full details individually
      if (driverIds.length > 0) {
        try {
          console.log('Fetching individual driver details using multi-strategy approach...');
          
          // Use Promise.all to fetch all driver details concurrently
          const driversPromises = driverIds.map(async (driverId) => {
            if (!driverId) return null;
            
            // Use our multi-strategy function
            const driverDetails = await fetchDriverDetails(driverId);
            
            if (driverDetails) {
              console.log(`Driver ${driverId} details fetched successfully`);
              return { id: driverId, details: driverDetails };
            } else {
              console.log(`Failed to fetch driver ${driverId} details with all strategies`);
              return { id: driverId, details: null };
            }
          });
          
          // Wait for all driver details to be fetched
          const driversResults = await Promise.all(driversPromises);
          
          // Update the rides with driver details
          for (const result of driversResults) {
            if (result && result.details) {
              // Update all rides with this driver
              mappedRides = mappedRides.map(ride => {
                if (ride.driver && ride.driver.id === result.id) {
                  const driverDetails = result.details;
                  return {
                    ...ride,
                    driver: {
                      ...ride.driver,
                      ...driverDetails,
                      // Keep the original full_name if it exists
                      full_name: ride.driver.full_name || 
                               `${driverDetails.first_name || ''} ${driverDetails.last_name || ''}`.trim() || 
                               'Unknown Driver'
                    }
                  };
                }
                return ride;
              });
            }
          }
          
          console.log('Driver details fetching complete');
        } catch (err) {
          console.error('Error in driver details fetch process:', err);
          // Continue with partial data rather than failing completely
        }
      }
      
      setAcceptedRides(mappedRides);
      console.log(`Final rides data with ${mappedRides.length} rides`);
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
      if (err.response) {
        console.error('Error response:', err.response.data);
        console.error('Status code:', err.response.status);
        
        // Special handling for 500 errors
        if (err.response.status === 500) {
          setError('The server encountered an error processing ride data. Basic information is displayed.');
          setRetryable(true);
        } else {
          setError(`Error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
          setRetryable(true);
        }
      } else {
        setError('Network error. Please check your connection.');
        setRetryable(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper function to safely map a ride object with fallbacks for all fields
  const safeMapRide = ride => {
    try {
      console.log('Processing ride with safeMapRide:', ride);
      
      // Check if ride object is null or undefined
      if (!ride) {
        console.warn('Null or undefined ride object encountered');
        return createEmptyRide();
      }
      
      // Safely handle potentially problematic JSON fields
      let safeOptimalPickup = null;
      let safeNearestDropoff = null;
      
      // Safety check for optimal_pickup_point
      if ('optimal_pickup_point' in ride) {
        console.log('Found optimal_pickup_point, type:', typeof ride.optimal_pickup_point);
        
        if (ride.optimal_pickup_point === null) {
          console.log('optimal_pickup_point is null');
          safeOptimalPickup = null;
        } else {
          try {
            // If it's a string, try to parse as JSON
            if (typeof ride.optimal_pickup_point === 'string') {
              if (ride.optimal_pickup_point.trim() === '') {
                console.log('optimal_pickup_point is empty string');
                safeOptimalPickup = null;
              } else {
                safeOptimalPickup = JSON.parse(ride.optimal_pickup_point);
                console.log('Successfully parsed optimal_pickup_point');
              }
            } else {
              // Use as-is if it's already an object
              safeOptimalPickup = ride.optimal_pickup_point;
            }
          } catch (jsonError) {
            console.error('Error parsing optimal_pickup_point:', jsonError);
            safeOptimalPickup = null;
          }
        }
      }
      
      // Safety check for nearest_dropoff_point
      if ('nearest_dropoff_point' in ride) {
        console.log('Found nearest_dropoff_point, type:', typeof ride.nearest_dropoff_point);
        
        if (ride.nearest_dropoff_point === null) {
          console.log('nearest_dropoff_point is null');
          safeNearestDropoff = null;
        } else {
          try {
            // If it's a string, try to parse as JSON
            if (typeof ride.nearest_dropoff_point === 'string') {
              if (ride.nearest_dropoff_point.trim() === '') {
                console.log('nearest_dropoff_point is empty string');
                safeNearestDropoff = null;
              } else {
                safeNearestDropoff = JSON.parse(ride.nearest_dropoff_point);
                console.log('Successfully parsed nearest_dropoff_point');
              }
            } else {
              // Use as-is if it's already an object
              safeNearestDropoff = ride.nearest_dropoff_point;
            }
          } catch (jsonError) {
            console.error('Error parsing nearest_dropoff_point:', jsonError);
            safeNearestDropoff = null;
          }
        }
      }
      
      // Check if ride_details and driver are populated
      const hasRideDetails = ride.ride_details && typeof ride.ride_details === 'object';
      const hasDriverInRideDetails = hasRideDetails && ride.ride_details.driver;
      
      // Get driver info from the most appropriate location
      const driver = hasDriverInRideDetails ? ride.ride_details.driver : 
                    (ride.driver ? ride.driver : 
                    (ride.driver_details ? ride.driver_details : null));
      
      console.log('Driver info available:', driver ? 'Yes' : 'No');
      
      // Create a safe driver object with fallbacks for all fields
      const safeDriver = driver || {};
      const driverObj = {
        id: safeDriver.id || null,
        first_name: safeDriver.first_name || '',
        last_name: safeDriver.last_name || '',
        full_name: safeDriver.full_name || 
                  `${safeDriver.first_name || ''} ${safeDriver.last_name || ''}`.trim() || 
                  'Unknown Driver',
        email: safeDriver.email || null,
        phone_number: safeDriver.phone_number || null,
        vehicle_make: safeDriver.vehicle_make || null,
        vehicle_model: safeDriver.vehicle_model || null,
        vehicle_color: safeDriver.vehicle_color || null,
        vehicle_year: safeDriver.vehicle_year || null,
        license_plate: safeDriver.license_plate || null
      };
      
      return {
        id: ride.id || `temp-${Math.random().toString(36).substring(2, 9)}`,
        status: ride.status || 'PENDING',
        ride_id: (ride.ride && ride.ride.id) || ride.ride_id || null,
        pickup_location: ride.pickup_location || 'Unknown location',
        dropoff_location: ride.dropoff_location || 'Unknown location',
        departure_time: ride.departure_time || new Date().toISOString(),
        seats_needed: ride.seats_needed || 1,
        ride_details: ride.ride_details || null,
        driver: driverObj,
        // Map coordinate fields from any available source
        pickup_latitude: ride.pickup_latitude || (safeOptimalPickup ? safeOptimalPickup.latitude : null),
        pickup_longitude: ride.pickup_longitude || (safeOptimalPickup ? safeOptimalPickup.longitude : null),
        dropoff_latitude: ride.dropoff_latitude || (safeNearestDropoff ? safeNearestDropoff.latitude : null),
        dropoff_longitude: ride.dropoff_longitude || (safeNearestDropoff ? safeNearestDropoff.longitude : null),
        // Keep original fields for backwards compatibility
        optimal_pickup_point: safeOptimalPickup,
        nearest_dropoff_point: safeNearestDropoff,
        optimal_pickup_info: ride.optimal_pickup_info || null,
        nearest_dropoff_info: ride.nearest_dropoff_info || null
      };
    } catch (e) {
      console.error('Error mapping ride:', e);
      // Return a safe fallback object if mapping fails
      return createEmptyRide();
    }
  };

  // Helper function to create an empty ride object
  const createEmptyRide = () => ({
    id: `temp-${Math.random().toString(36).substring(2, 9)}`,
    status: 'PENDING',
    ride_id: null,
    pickup_location: 'Data unavailable',
    dropoff_location: 'Data unavailable',
    departure_time: new Date().toISOString(),
    seats_needed: 1,
    driver: {
      id: null,
      first_name: '',
      last_name: '',
      full_name: 'Driver information unavailable',
      email: null,
      phone_number: null,
      vehicle_make: null,
      vehicle_model: null,
      vehicle_color: null,
      vehicle_year: null,
      license_plate: null
    }
  });

  // Add this function to help explore available API endpoints
  const exploreApiEndpoints = async (token) => {
    if (!token) return;
    
    const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
    const headers = {
      'Authorization': `Bearer ${cleanToken}`,
      'Content-Type': 'application/json'
    };
    
    try {
      // Check the API root
      console.log('Exploring API endpoints...');
      const rootResponse = await fetch(`${API_BASE_URL}/api/`, { headers });
      if (rootResponse.ok) {
        const rootData = await rootResponse.json();
        console.log('API root endpoints:', rootData);
      }
      
      // Check users endpoint
      const usersResponse = await fetch(`${API_BASE_URL}/api/users/`, { headers });
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        console.log('Users API response:', usersData);
        
        // If we have user objects, check the first one's structure
        if (Array.isArray(usersData) && usersData.length > 0) {
          console.log('Example user object structure:', Object.keys(usersData[0]));
        }
      }
    } catch (error) {
      console.error('Error exploring API:', error);
    }
  };

  // Add this to the useEffect to explore API on component mount
  useEffect(() => {
    console.log('RiderAcceptedRides - useEffect triggered');
    fetchAcceptedRides();
    
    // Debug token and authorization
    const token = localStorage.getItem('token');
    console.log('Auth token exists:', !!token);
    if (token) {
      console.log('Auth header format:', `Bearer ${token.substring(0, 10)}...`);
    }
  }, []);

  // Additional debug function to check API connectivity
  const testDriverDetailsEndpoint = async () => {
    try {
      console.log('Testing driver details endpoints...');
      console.log('Auth header:', JSON.stringify(getAuthHeader()));
      
      // Check if the auth token is valid
      const token = localStorage.getItem('token');
      console.log('Token exists:', !!token);
      if (token) {
        console.log('Token format check:', token.substring(0, 15) + '...');
      }
      
      // Try the API call for all users (likely to fail due to permissions)
      console.log('1. Testing GET request to /api/users/ (all users)...');
      try {
        const allUsersResponse = await axios.get(`${API_BASE_URL}/api/users/`, {
          headers: getAuthHeader()
        });
        
        console.log('✅ All users API call succeeded:', allUsersResponse.status);
        console.log('Users count:', allUsersResponse.data.length);
      } catch (allUsersErr) {
        console.error('❌ All users API call failed:', allUsersErr.message);
        if (allUsersErr.response) {
          console.error('Status:', allUsersErr.response.status);
          console.error('Data:', allUsersErr.response.data);
        }
      }
      
      // Try to get a specific driver (more likely to succeed)
      console.log('2. Testing GET request to /api/users/1/ (specific user)...');
      try {
        const singleUserResponse = await axios.get(`${API_BASE_URL}/api/users/1/`, {
          headers: getAuthHeader()
        });
        
        console.log('✅ Single user API call succeeded:', singleUserResponse.status);
        console.log('User data:', singleUserResponse.data);
        
        // Check for driver-related fields
        const user = singleUserResponse.data;
        const driverFields = ['vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate'];
        driverFields.forEach(field => {
          console.log(`Field "${field}" exists:`, field in user);
          if (field in user) {
            console.log(`Field "${field}" value:`, user[field]);
          }
        });
      } catch (singleUserErr) {
        console.error('❌ Single user API call failed:', singleUserErr.message);
        if (singleUserErr.response) {
          console.error('Status:', singleUserErr.response.status);
          console.error('Data:', singleUserErr.response.data);
        }
        
        // Try with a different user ID if the first fails
        console.log('Trying with user ID 2...');
        try {
          const altUserResponse = await axios.get(`${API_BASE_URL}/api/users/2/`, {
            headers: getAuthHeader()
          });
          console.log('✅ Alternative user API call succeeded:', altUserResponse.status);
        } catch (altErr) {
          console.error('❌ Alternative user API call also failed:', altErr.message);
        }
      }
      
      // Check auth token validity (logout endpoint should work)
      console.log('3. Testing user-related endpoint /api/users/me/ for auth check...');
      try {
        const meResponse = await axios.get(`${API_BASE_URL}/api/users/me/`, {
          headers: getAuthHeader()
        });
        console.log('✅ Current user API call succeeded:', meResponse.status);
        console.log('Current user:', meResponse.data);
      } catch (meErr) {
        console.error('❌ Current user API call failed:', meErr.message);
        if (meErr.response) {
          console.error('Status:', meErr.response.status);
          console.error('Data:', meErr.response.data);
        }
      }
      
      return true;
    } catch (err) {
      console.error('Error in API diagnostics:', err.message);
      return false;
    }
  };

  // Call the debug function to diagnose driver details issue
  useEffect(() => {
    if (acceptedRides.length > 0) {
      testDriverDetailsEndpoint();
    }
  }, [acceptedRides]);

  // Format the date for display
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Invalid date';
      }
      
      // Format the date with timezone
      const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      // Format the time with timezone
      const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      
      return {
        date: dateFormatter.format(date),
        time: timeFormatter.format(date)
      };
    } catch (e) {
      console.error('Error formatting date:', e);
      return { date: 'Invalid date', time: 'Invalid time' };
    }
  };

  const handleRetry = () => {
    setIsRetrying(true);
    setLoading(true);
    setError('');
    fetchAcceptedRides();
  };

  const handleRideClick = async (ride) => {
    console.log('Selected ride:', ride);
    
    // Check if driver info is incomplete
    const isDriverInfoIncomplete = !ride.driver || 
                                  !ride.driver.phone_number || 
                                  !ride.driver.vehicle_make || 
                                  !ride.driver.license_plate;
    
    if (isDriverInfoIncomplete && ride.driver && ride.driver.id) {
      try {
        console.log(`Fetching complete driver details for ID: ${ride.driver.id}`);
        
        // Get driver ID from the appropriate source
        const driverId = ride.driver.id;
        
        // Fetch user details from the users API
        const userResponse = await axios.get(`${API_BASE_URL}/api/users/${driverId}/`, {
          headers: getAuthHeader()
        });
        
        console.log('Fetched user details:', userResponse.data);
        
        // Create updated ride with complete driver information
        const updatedRide = {
          ...ride,
          driver: {
            ...ride.driver,
            ...userResponse.data
          }
        };
        
        // Update the ride in the list
        setAcceptedRides(acceptedRides.map(r => r.id === ride.id ? updatedRide : r));
        
        // Update selected ride
        setSelectedRide(updatedRide);
      } catch (err) {
        console.error('Error fetching driver details:', err);
        
        // Still select the ride even if fetching details failed
        setSelectedRide(ride);
      }
    } else {
      // If driver info is already complete, just select the ride
      setSelectedRide(ride);
    }
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

      console.log(`Cancelling ride request with ID: ${rideRequestId}`);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/cancel/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Get response data
      let responseData;
      try {
        const responseText = await response.text();
        responseData = responseText ? JSON.parse(responseText) : {};
        console.log("Cancel ride response:", responseData);
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        responseData = { error: "Could not parse server response" };
      }

      if (!response.ok) {
        const errorMessage = responseData.error || 'Failed to cancel ride';
        console.error(`Error cancelling ride (${response.status}):`, errorMessage);
        throw new Error(errorMessage);
      }

      // Success - show message and refresh ride list
      setSuccess("Your ride has been cancelled successfully");
      fetchAcceptedRides();
      return true;
    } catch (err) {
      console.error('Error cancelling ride:', err);
      setError(err.message || 'Failed to cancel ride. Please try again.');
      return false;
    }
  };

  const getFullName = (user) => {
    if (!user) return 'Unknown User';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
  };

  const getPhoneNumber = (user) => {
    return user?.phone_number || 'Not provided';
  };

  const getEmail = (user) => {
    return user?.email || 'Not provided';
  };

  const getDriverInfo = (ride) => {
    if (!ride) return null;
    
    // Try to get driver from ride_details.driver first
    if (ride.ride_details && ride.ride_details.driver) {
      console.log('Using driver from ride_details.driver');
      return ride.ride_details.driver;
    }
    
    // Then try ride.driver
    if (ride.driver) {
      console.log('Using driver from ride.driver');
      return ride.driver;
    }
    
    // Fallback for driver name only (simplified format)
    if (ride.driver_name) {
      console.log('Using driver_name fallback');
      
      // Create placeholder driver object
      const nameParts = ride.driver_name.split(' ');
      return {
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        full_name: ride.driver_name,
        email: ride.driver_email || 'Contact through support',
        phone_number: ride.driver_phone || 'Contact through app',
        vehicle_make: ride.vehicle_make || 'Available at pickup',
        vehicle_model: ride.vehicle_model || '',
        vehicle_color: ride.vehicle_color || '',
        vehicle_year: ride.vehicle_year || '',
        license_plate: ride.license_plate || 'Provided before pickup'
      };
    }
    
    console.warn('No driver info found');
    return {
      first_name: 'Unknown',
      last_name: 'User',
      full_name: 'Unknown User',
      email: null,
      phone_number: null,
      vehicle_make: null,
      vehicle_model: null,
      vehicle_color: null,
      vehicle_year: null,
      license_plate: null
    };
  };

  const getVehicleInfo = (driver) => {
    if (!driver) return 'Not provided';
    
    const make = driver.vehicle_make;
    const model = driver.vehicle_model;
    const color = driver.vehicle_color;
    const year = driver.vehicle_year;
    const plate = driver.license_plate;
    
    if (!make && !model && !color && !year && !plate) {
      return 'Vehicle details will be available at pickup';
    }
    
    let vehicleInfo = '';
    
    if (year) vehicleInfo += `${year} `;
    if (color) vehicleInfo += `${color} `;
    if (make) vehicleInfo += `${make} `;
    if (model) vehicleInfo += `${model}`;
    
    vehicleInfo = vehicleInfo.trim();
    
    if (plate) {
      vehicleInfo += vehicleInfo ? `, License: ${plate}` : `License: ${plate}`;
    }
    
    return vehicleInfo || 'Vehicle details will be available at pickup';
  };

  const handleOpenCancelDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCancelDialog(true);
  };

  const handleCloseCancelDialog = () => {
    setOpenCancelDialog(false);
  };

  // Remove direct link handling
  const handleCall = (phoneNumber) => {
    if (!phoneNumber) {
      alert('No Phone Number: The driver has not provided a phone number.');
      return;
    }
    window.open(`tel:${phoneNumber}`, '_blank');
  };

  const handleEmail = (email) => {
    if (!email) {
      alert('No Email: The driver has not provided an email address.');
      return;
    }
    window.open(`mailto:${email}`, '_blank');
  };

  const renderRideCard = (ride) => {
    const driver = ride.driver || {};
    const formatted = formatDate(ride.departure_time);
    
    // Log coordinates for debugging
    console.log(`Ride ${ride.id} coordinates:`, {
      pickup_lat: ride.pickup_latitude,
      pickup_lng: ride.pickup_longitude,
      dropoff_lat: ride.dropoff_latitude,
      dropoff_lng: ride.dropoff_longitude
    });
    
    return (
      <div className="ride-tablet">
        <div className="ride-tablet-content">
          <Box>
            <Typography variant="h6" align="center" gutterBottom>
              Trip #{ride.id}
            </Typography>
            <Chip 
              label={ride.status} 
              color={
                ride.status === 'ACCEPTED' ? "success" : 
                ride.status === 'PENDING' ? "warning" :
                ride.status === 'COMPLETED' ? "info" : "error"
              }
              size="small"
              sx={{ mb: 2 }}
            />
            <Divider sx={{ mb: 2 }} />
          </Box>
          
          <div className="ride-details">
            <div className="location-text">
              <LocationOn className="location-icon" />
              <Typography variant="subtitle1">
                From: {ride.pickup_location}
              </Typography>
            </div>
            <div className="location-text">
              <LocationOn className="location-icon" />
              <Typography variant="subtitle1">
                To: {ride.dropoff_location}
              </Typography>
            </div>
            
            <div className="ride-meta">
              <div className="time-details">
                <AccessTime className="time-icon" />
                <Typography variant="body2">
                  {formatted.date}
                  <br />
                  {formatted.time}
                </Typography>
              </div>
              
              <Box display="flex" alignItems="center">
                <EventSeat color="primary" sx={{ mr: 1 }} />
                <Chip 
                  label={`${ride.seats_needed} seat${ride.seats_needed !== 1 ? 's' : ''}`}
                  color="primary"
                  size="small"
                  variant="outlined"
                />
              </Box>
            </div>
            
            <Divider sx={{ my: 1 }} />
            
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Driver Information
              </Typography>
              
              <Box display="flex" alignItems="center" mb={0.5}>
                <Person sx={{ mr: 1, color: "#800000" }} />
                <Typography variant="body2">
                  {driver.full_name || 'Driver information unavailable'}
                </Typography>
              </Box>
              
              {driver.phone_number && (
                <Box display="flex" alignItems="center" mb={0.5}>
                  <Phone sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                  <Typography variant="body2">
                    {driver.phone_number}
                  </Typography>
                </Box>
              )}
              
              {driver.email && (
                <Box display="flex" alignItems="center" mb={0.5}>
                  <Email sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                  <Typography variant="body2">
                    {driver.email}
                  </Typography>
                </Box>
              )}
              
              {(driver.vehicle_make || driver.vehicle_model || driver.vehicle_color) && (
                <Box display="flex" alignItems="center" mb={0.5}>
                  <DirectionsCar sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                  <Typography variant="body2">
                    {[
                      driver.vehicle_color, 
                      driver.vehicle_make, 
                      driver.vehicle_model
                    ].filter(Boolean).join(' ')}
                    {driver.license_plate ? ` (${driver.license_plate})` : ''}
                  </Typography>
                </Box>
              )}
            </Box>
            
            {/* Route Map - Updated to use optimal pickup and nearest dropoff points */}
            {(
              (ride.optimal_pickup_point && ride.optimal_pickup_point.latitude && ride.optimal_pickup_point.longitude &&
              ride.nearest_dropoff_point && ride.nearest_dropoff_point.latitude && ride.nearest_dropoff_point.longitude) ? (
                <Box sx={{ mt: 2, height: '200px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                  <MapContainer 
                    center={[
                      (ride.optimal_pickup_point.latitude + ride.nearest_dropoff_point.latitude) / 2,
                      (ride.optimal_pickup_point.longitude + ride.nearest_dropoff_point.longitude) / 2
                    ]} 
                    zoom={13} 
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker 
                      position={[ride.optimal_pickup_point.latitude, ride.optimal_pickup_point.longitude]}
                    >
                      <Popup>Optimal Pickup: {ride.pickup_location}</Popup>
                    </Marker>
                    <Marker 
                      position={[ride.nearest_dropoff_point.latitude, ride.nearest_dropoff_point.longitude]}
                    >
                      <Popup>Nearest Dropoff: {ride.dropoff_location}</Popup>
                    </Marker>
                    <Polyline 
                      positions={[
                        [ride.optimal_pickup_point.latitude, ride.optimal_pickup_point.longitude],
                        [ride.nearest_dropoff_point.latitude, ride.nearest_dropoff_point.longitude]
                      ]}
                      color="#861F41"
                      weight={4}
                    />
                  </MapContainer>
                </Box>
              ) : (
                // Fallback to original rider coordinates if optimal points aren't available
                (ride.pickup_latitude && ride.pickup_longitude && ride.dropoff_latitude && ride.dropoff_longitude) ? (
                  <Box sx={{ mt: 2, height: '200px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                    <MapContainer 
                      center={[
                        (ride.pickup_latitude + ride.dropoff_latitude) / 2,
                        (ride.pickup_longitude + ride.dropoff_longitude) / 2
                      ]} 
                      zoom={13} 
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker 
                        position={[ride.pickup_latitude, ride.pickup_longitude]}
                      >
                        <Popup>Rider Pickup: {ride.pickup_location}</Popup>
                      </Marker>
                      <Marker 
                        position={[ride.dropoff_latitude, ride.dropoff_longitude]}
                      >
                        <Popup>Rider Dropoff: {ride.dropoff_location}</Popup>
                      </Marker>
                      <Polyline 
                        positions={[
                          [ride.pickup_latitude, ride.pickup_longitude],
                          [ride.dropoff_latitude, ride.dropoff_longitude]
                        ]}
                        color="#861F41"
                        weight={4}
                      />
                    </MapContainer>
                  </Box>
                ) : (
                  /* Fallback when no coordinates are available */
                  <Box sx={{ mt: 2, p: 2, border: '1px dashed #ccc', borderRadius: '4px', textAlign: 'center' }}>
                    <Typography variant="body2" color="textSecondary">
                      Map view not available for this ride.
                    </Typography>
                    <Button 
                      variant="outlined" 
                      size="small" 
                      sx={{ mt: 1 }}
                      startIcon={<LocationOn />}
                      onClick={() => window.open(`https://www.google.com/maps/dir/${ride.pickup_location}/${ride.dropoff_location}`, '_blank')}
                    >
                      View on Google Maps
                    </Button>
                  </Box>
                )
              )
            )}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
              {ride.status === 'ACCEPTED' && (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={() => {
                    setSelectedRide(ride);
                    setOpenCancelDialog(true);
                  }}
                  size="small"
                >
                  Cancel Trip
                </Button>
              )}
              
              {driver.phone_number && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => handleCall(driver.phone_number)}
                  size="small"
                  startIcon={<Phone />}
                >
                  Call
                </Button>
              )}
              
              {driver.email && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => handleEmail(driver.email)}
                  size="small"
                  startIcon={<Email />}
                >
                  Email
                </Button>
              )}
            </Box>
          </div>
        </div>
      </div>
    );
  };
  

  // Define the CancelRideDialog component
  const CancelRideDialog = ({ open, handleClose, ride, onCancelled }) => {
    const [cancelling, setCancelling] = useState(false);
    const [dialogError, setDialogError] = useState('');
  
    const handleCancelConfirm = async () => {
      if (!ride) return;
      
      setCancelling(true);
      setDialogError('');
      try {
        const result = await handleCancelRide(ride.id);
        if (result) {
          handleClose();
          if (onCancelled) onCancelled();
        } else {
          setDialogError('Failed to cancel the ride. Please try again.');
        }
      } catch (err) {
        console.error('Error in cancel confirmation:', err);
        setDialogError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setCancelling(false);
      }
    };
  
    return (
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Cancel Ride</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to cancel this ride? This action cannot be undone.
          </Typography>
          {ride && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">
                From: {ride.pickup_location}
              </Typography>
              <Typography variant="subtitle2">
                To: {ride.dropoff_location}
              </Typography>
              <Typography variant="subtitle2">
                {formatDate(ride.departure_time).date} at {formatDate(ride.departure_time).time}
              </Typography>
            </Box>
          )}
          
          {dialogError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {dialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={cancelling}>
            No, Keep It
          </Button>
          <Button 
            onClick={handleCancelConfirm} 
            color="secondary" 
            disabled={cancelling}
            startIcon={cancelling ? <CircularProgress size={20} /> : <Cancel />}
          >
            {cancelling ? 'Cancelling...' : 'Yes, Cancel Ride'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Function to intelligently fetch driver details using all available methods
  const fetchDriverDetails = async (driverId) => {
    if (!driverId) return null;
    
    console.log(`Attempting to fetch details for driver ID: ${driverId}`);
    
    // Try multiple strategies to get driver info
    try {
      // Strategy 1: Direct fetch using ID (most direct)
      console.log(`Strategy 1: Direct fetch by ID for driver ${driverId}`);
      try {
        const directResponse = await axios.get(`${API_BASE_URL}/api/users/${driverId}/`, {
          headers: getAuthHeader()
        });
        console.log(`✅ Direct fetch succeeded for driver ${driverId}`);
        return directResponse.data;
      } catch (err) {
        console.log(`❌ Direct fetch failed for driver ${driverId}:`, err.message);
        // Continue to next strategy
      }
      
      // Strategy 2: Check if this is the current user
      console.log(`Strategy 2: Checking if driver ${driverId} is the current user`);
      try {
        const meResponse = await axios.get(`${API_BASE_URL}/api/users/me/`, {
          headers: getAuthHeader()
        });
        
        // If this is the current user, return the data
        if (meResponse.data && meResponse.data.id == driverId) {
          console.log(`✅ Driver ${driverId} is the current user, using /me/ data`);
          return meResponse.data;
        } else {
          console.log(`Driver ${driverId} is not the current user`);
        }
      } catch (err) {
        console.log(`❌ /me/ endpoint failed:`, err.message);
        // Continue to next strategy
      }
      
      // Strategy 3: Look for a driver details specific endpoint
      console.log(`Strategy 3: Trying driver-specific endpoint for ${driverId}`);
      try {
        const driverResponse = await axios.get(`${API_BASE_URL}/api/drivers/${driverId}/`, {
          headers: getAuthHeader()
        });
        console.log(`✅ Driver endpoint succeeded for driver ${driverId}`);
        return driverResponse.data;
      } catch (err) {
        console.log(`❌ Driver endpoint failed for driver ${driverId}:`, err.message);
      }
      
      // No strategy worked
      console.log(`All strategies failed for driver ${driverId}`);
      return null;
    } catch (error) {
      console.error(`Error in fetchDriverDetails for driver ${driverId}:`, error);
      return null;
    }
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '60vh'
      }}>
        <CircularProgress size={40} sx={{ marginBottom: 2 }} />
        <Typography>Loading your trips...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <Alert 
          severity="error" 
          sx={{ marginBottom: 2, width: '100%' }}
          action={
            <Button
              color="inherit"
              size="small"
              disabled={isRetrying}
              onClick={() => {
                setIsRetrying(true);
                fetchAcceptedRides()
                  .finally(() => setIsRetrying(false));
              }}
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          }
        >
          {error}
        </Alert>
        
        {acceptedRides.length > 0 && (
          <Box sx={{ width: '100%', mt: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
              Showing limited information based on available data:
            </Typography>
            <Grid container spacing={3}>
              {acceptedRides.map(ride => (
                <Grid item xs={12} sm={6} md={4} key={ride.id}>
                  {renderRideCard(ride)}
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Box>
    );
  }

  if (acceptedRides.length === 0) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '60vh'
      }}>
        <Typography variant="h6" gutterBottom>You don't have any trips yet</Typography>
        <Typography variant="body1" color="textSecondary">
          When you request and get accepted for a ride, it will appear here.
        </Typography>
        <Button 
          variant="contained" 
          color="primary"
          sx={{ mt: 3 }}
          onClick={() => navigate('/rides')}
          startIcon={<DirectionsCar />}
        >
          Find Available Rides
        </Button>
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {success && (
        <Alert 
          severity="success" 
          sx={{ mb: 3 }}
          onClose={() => setSuccess('')}
        >
          {success}
        </Alert>
      )}
      
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={() => setError('')}
        >
          {error}
        </Alert>
      )}
      
      <Typography variant="h4" component="h1" gutterBottom>
        My Trips
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : acceptedRides.length > 0 ? (
        <Grid container spacing={3}>
          {acceptedRides.map(ride => (
            <Grid item xs={12} sm={6} md={4} key={ride.id}>
              {renderRideCard(ride)}
            </Grid>
          ))}
        </Grid>
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>
            You don't have any trips yet
          </Typography>
          <Typography variant="body1" color="textSecondary" paragraph>
            When you request and get accepted for a ride, it will appear here.
          </Typography>
          <Button 
            variant="contained" 
            color="primary"
            component={Link}
            to="/request-ride"
          >
            Find Available Rides
          </Button>
        </Paper>
      )}
      
      <CancelRideDialog 
        open={openCancelDialog} 
        handleClose={handleCloseCancelDialog} 
        ride={selectedRide} 
        onCancelled={() => {
          setSuccess("Your ride has been cancelled successfully");
          fetchAcceptedRides();
        }}
      />
    </Container>
  );
};

export default RiderAcceptedRides;