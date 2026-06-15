import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, getCsrfToken } from '../config';
import { 
  Box, 
  Container, 
  Typography, 
  TextField, 
  Button, 
  Alert,
  Grid,
  Paper,
  InputAdornment,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  AlertTitle,
  LinearProgress,
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SearchIcon from '@mui/icons-material/Search';
import { getUserCurrentLocation, DEFAULT_LOCATION, geocodeWithPriority } from '../utils/locationUtils';
import { format } from 'date-fns';
import { Person, DirectionsCar, Schedule, LocationOn } from '@mui/icons-material';

const formatCoordinates = (point) => {
  if (!point) return 'Not available';
  
  // Handle tuple/array format [lng, lat] or [lat, lng]
  if (Array.isArray(point)) {
    return `${Number(point[0]).toFixed(6)}, ${Number(point[1]).toFixed(6)}`;
  }
  
  // Handle object format with lat/lng or latitude/longitude
  if (typeof point === 'object') {
    const lat = point.latitude || point.lat;
    const lng = point.longitude || point.lng;
    if (lat && lng) {
      return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    }
  }
  
  // If it's a string, return as is
  if (typeof point === 'string') {
    return point;
  }
  
  return 'Invalid format';
};

// Add the missing formatDate function
const formatDate = (dateString) => {
  try {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy h:mm a');
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString || 'Not available';
  }
};

const RequestRide = () => {
  const navigate = useNavigate();
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState(null);
  const [dropoffCoordinates, setDropoffCoordinates] = useState(null);
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [departureTime, setDepartureTime] = useState(null);
  const [success, setSuccess] = useState(null);
  const [matchDetails, setMatchDetails] = useState(null);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [matchCheckInterval, setMatchCheckInterval] = useState(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const isSubmitting = useRef(false);

  const ORS_API_KEY = "5b3ce3597851110001cf624801023b6aa336fd58721bded0bb76d9b4a0cab221421d96d9f30c2613";
  
  // Get user's location on component mount
  useEffect(() => {
    const fetchUserLocation = async () => {
      const location = await getUserCurrentLocation();
      setUserLocation(location || DEFAULT_LOCATION);
    };
    
    fetchUserLocation();
  }, []);

  // Clean up the interval when component unmounts
  useEffect(() => {
    return () => {
      if (matchCheckInterval) {
        clearInterval(matchCheckInterval);
      }
    };
  }, [matchCheckInterval]);

  const handleLocationSearch = async (location, isPickup) => {
    try {
      setLocationLoading(true);
      setError('');
      
      // Use the geocoder with proximity bias
      const geocodeResult = await geocodeWithPriority(location, userLocation);
      
      if (geocodeResult) {
        const { lat, lon, display_name } = geocodeResult;
        if (isPickup) {
          setPickupLocation(display_name);
          setPickupCoordinates({ lat: parseFloat(lat), lng: parseFloat(lon) });
        } else {
          setDropoffLocation(display_name);
          setDropoffCoordinates({ lat: parseFloat(lat), lng: parseFloat(lon) });
        }
      } else {
        setError('Location not found. Please try a different address.');
      }
    } catch (err) {
      console.error('Error searching for location:', err);
      setError('Error searching for location. Please try again.');
    } finally {
      setLocationLoading(false);
    }
  };

  useEffect(() => {
    if (pickupCoordinates && dropoffCoordinates) {
      fetchRoute();
    }
  }, [pickupCoordinates, dropoffCoordinates]);

  const fetchRoute = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/rides/directions/`,
        {
          params: {
            api_key: ORS_API_KEY,
            start: `${pickupCoordinates.lng},${pickupCoordinates.lat}`,
            end: `${dropoffCoordinates.lng},${dropoffCoordinates.lat}`
          },
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
      setRouteData(response.data);
    } catch (err) {
      console.error('Error fetching route:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Use a ref to prevent multiple submissions
    if (isSubmitting.current) {
      console.log('Already submitting, ignoring additional click');
      return;
    }
    
    isSubmitting.current = true;
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      // Validation
      if (!pickupLocation || !dropoffLocation || !departureTime || !seatsNeeded) {
        setError('Please fill in all required fields');
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to request a ride');
        setLoading(false);
        isSubmitting.current = false;
        return;
      }
      
      // Validate token format
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          console.error('Invalid token format');
          localStorage.removeItem('token'); // Clear invalid token
          setError('Your session has expired. Please log in again.');
          setLoading(false);
          isSubmitting.current = false;
          return;
        }

        // Check token expiration
        const tokenData = JSON.parse(atob(tokenParts[1]));
        const expirationTime = tokenData.exp * 1000; // Convert to milliseconds
        
        if (Date.now() >= expirationTime) {
          console.error('Token has expired');
          localStorage.removeItem('token');
          setError('Your session has expired. Please log in again.');
          setLoading(false);
          isSubmitting.current = false;
          return;
        }
      } catch (error) {
        console.error('Error validating token:', error);
        localStorage.removeItem('token');
        setError('Invalid session. Please log in again.');
        setLoading(false);
        isSubmitting.current = false;
        return;
      }
      
      // First, find available rides to get a ride ID
      console.log('Searching for available rides...');
      let rideId = null;
      
      try {
        console.log('Making request to:', `${API_BASE_URL}/api/rides/rides/`);
        console.log('Using token:', token.substring(0, 10) + '...');
        
        const ridesResponse = await fetch(`${API_BASE_URL}/api/rides/rides/`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': window.location.origin
          },
          credentials: 'include',
          mode: 'cors'
        });

        // Get the raw response text first
        const rawResponseText = await ridesResponse.text();
        console.log('Raw rides response:', rawResponseText);
        
        let ridesData;
        try {
          ridesData = JSON.parse(rawResponseText);
          console.log('Parsed rides data:', ridesData);
        } catch (parseError) {
          console.error('Failed to parse rides response:', parseError);
          throw new Error('Invalid JSON response from rides endpoint');
        }

        // Handle both array and paginated results format
        const rides = Array.isArray(ridesData) ? ridesData : (ridesData.results || []);
        console.log('Available rides:', rides);

        if (rides.length === 0) {
          throw new Error('NO_RIDES_AVAILABLE');
        }

        // Select the first available ride
        const selectedRide = rides[0];
        console.log('Selected ride:', selectedRide);

        if (!selectedRide || !selectedRide.id) {
          throw new Error('Invalid ride data');
        }

        // Prepare request data with the correct ride_id parameter
        const requestData = {
          ride_id: selectedRide.id.toString(),
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          pickup_latitude: pickupCoordinates.lat,
          pickup_longitude: pickupCoordinates.lng,
          dropoff_latitude: dropoffCoordinates.lat,
          dropoff_longitude: dropoffCoordinates.lng,
          departure_time: departureTime.toISOString(),
          seats_needed: parseInt(seatsNeeded)
        };

        console.log('Submitting ride request with data:', JSON.stringify(requestData, null, 2));

        // Make the ride request
        const response = await fetch(`${API_BASE_URL}/api/rides/requests/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': window.location.origin
          },
          credentials: 'include',
          mode: 'cors',
          body: JSON.stringify(requestData)
        });

        console.log('Response status:', response.status);
        console.log('Response URL:', response.url);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Debug the raw response text before parsing
        const responseText = await response.text();
        console.log('Raw response text:', responseText);
        
        // Try to parse the JSON response
        let data;
        try {
          data = JSON.parse(responseText);
          console.log('Parsed response data:', data);
        } catch (parseError) {
          console.error('Error parsing response JSON:', parseError);
          throw new Error('Server returned invalid JSON response');
        }

        if (!response.ok) {
          // Handle specific error cases
          if (data.error && data.error.includes('Ride ID is required')) {
            console.error('Ride ID error despite having valid ID:', selectedRide.id);
            throw new Error('Server rejected ride ID. Please try again.');
          }
          throw new Error(data.error || 'Failed to create ride request');
        }

        // If request was successful
        if (response.ok) {
          console.log('Request was successful');
          
          // If match details exist in the response
          if (data.match_details) {
            console.log('Found match details:', data.match_details);
            console.log('Response data contains pending_request_id:', data.pending_request_id);
            
            // Create structured match details that includes both match_details and the ride data
            const structuredMatchDetails = {
              ...data.match_details,
              // Store all possible IDs we might need later
              ride_id: data.match_details.ride_id || data.ride?.id,
              pending_request_id: data.pending_request_id || data.match_details.pending_request_id,
              request_id: data.id || data.ride_request?.id,
              
              // Add vehicle details safely
              vehicle_details: {
                year: data.match_details.vehicle_year || data.ride?.driver?.vehicle_year || '',
                make: data.match_details.vehicle_make || data.ride?.driver?.vehicle_make || '',
                model: data.match_details.vehicle_model || data.ride?.driver?.vehicle_model || '',
                color: data.match_details.vehicle_color || data.ride?.driver?.vehicle_color || '',
                license_plate: data.match_details.license_plate || data.ride?.driver?.license_plate || '',
                max_passengers: data.match_details.max_passengers || 1
              },
              
              // Set driver contact info directly from the response data
              driver_name: data.match_details.driver_name || data.ride?.driver?.full_name || data.driver?.full_name || '',
              driver_email: data.match_details.driver_email || data.ride?.driver?.email || data.driver?.email || '',
              driver_phone: data.match_details.driver_phone || data.ride?.driver?.phone_number || data.driver?.phone_number || '',
              
              // Add ride_details combining data from multiple possible sources
              ride_details: {
                start_location: data.match_details.pickup || data.ride?.start_location || '',
                end_location: data.match_details.dropoff || data.ride?.end_location || '',
                departure_time: data.match_details.departure_time || data.ride?.departure_time || new Date().toISOString(),
                available_seats: data.match_details.available_seats || data.ride?.available_seats || 1
              },
              
              // Add field to track the entire response for debugging
              full_response_data: data
            };
            
            // Update state with properly structured data
            setMatchDetails(structuredMatchDetails);
            setShowMatchDialog(true);
            setSuccess('Found a matching ride! Please review the details below.');
            
            // Save properly structured data to localStorage as a string
            try {
              localStorage.setItem('currentMatch', JSON.stringify(structuredMatchDetails));
            } catch (err) {
              console.error('Error saving match to localStorage:', err);
            }
            
            // Clear form
            setPickupLocation('');
            setDropoffLocation('');
            setPickupCoordinates(null);
            setDropoffCoordinates(null);
            setDepartureTime(null);
            setSeatsNeeded(1);
            
            console.log('Set showMatchDialog to:', true);
            console.log('Updated matchDetails with ride request:', structuredMatchDetails);
          } else {
            console.log('No match details found in response');
            setError('No matching rides found. Please try different locations or times.');
          }
        } else if (data.status === 'error' && data.has_match === false) {
          // This is a known "error" state - no matching rides found
          console.log('No matching rides found:', data.error);
          
          // If a pending request was created, start polling for matches
          if (data.pending_request_id) {
            const pendingRequestId = data.pending_request_id; // Store this in a local variable
            console.log('Starting to poll for matches with pending request ID:', pendingRequestId);
            
            // Show that the request was saved
            setSuccess('Your ride request has been saved. We\'ll notify you when a matching ride becomes available.');
            
            // Start polling for matches every 30 seconds
            const pollInterval = setInterval(async () => {
              try {
                console.log('Checking for ride matches...');
                const matchResponse = await fetch(`${API_BASE_URL}/api/rides/rides/pending_status/?pending_request_id=${pendingRequestId}`, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                
                if (!matchResponse.ok) {
                  console.log('Failed to check for matches:', matchResponse.status);
                  return;
                }
                
                const matchData = await matchResponse.json();
                console.log('Match check response:', matchData);
                
                // If a match has been proposed
                if (matchData.has_match && matchData.match_details) {
                  console.log('Match found!', matchData.match_details);
                  
                  // Clear the polling interval
                  clearInterval(pollInterval);
                  
                  // Update the UI to show the match
                  const enhancedMatchDetails = {
                    ...matchData.match_details,
                    pending_request_id: pendingRequestId  // Use the stored pendingRequestId
                  };
                  setMatchDetails(enhancedMatchDetails);
                  setShowMatchDialog(true);
                  
                  // Save the match details to localStorage
                  try {
                    localStorage.setItem('currentMatch', JSON.stringify(enhancedMatchDetails));
                  } catch (err) {
                    console.error('Error saving match to localStorage:', err);
                  }
                  
                  // Play a sound or show a notification
                  try {
                    // Create a notification
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification('Ride Match Found!', {
                        body: 'We found a ride that matches your request. Click to view details.',
                        icon: '/logo192.png'
                      });
                    }
                    
                    // Play a sound
                    const audio = new Audio('/notification.mp3');
                    audio.play().catch(e => console.log('Could not play notification sound:', e));
                  } catch (e) {
                    console.error('Error with notification:', e);
                  }
                }
              } catch (e) {
                console.error('Error checking for matches:', e);
              }
            }, 30000); // Check every 30 seconds
            
            // Store the interval ID so we can clear it if the component unmounts
            setMatchCheckInterval(pollInterval);
            
            // Clear the interval when the component unmounts
            return () => {
              if (pollInterval) {
                clearInterval(pollInterval);
              }
            };
          } else {
            setError(
              <div>
                <Typography variant="body1" gutterBottom>
                  <strong>No matching rides found at the moment.</strong>
                </Typography>
                <Typography variant="body2" gutterBottom>
                  We've saved your request and will notify you if a matching ride becomes available before your departure time.
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Your request will be automatically matched if:
                </Typography>
                <ul>
                  <li>A driver offers a ride within 15 minutes of your departure time</li>
                  <li>The route overlaps with your requested locations by at least 40%</li>
                  <li>There are enough seats available</li>
                </ul>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  You can also try:
                </Typography>
                <ul>
                  <li>Choosing a different departure time</li>
                  <li>Selecting different pickup or dropoff locations</li>
                  <li>Reducing the number of seats needed</li>
                  <li>Checking back later as more drivers become available</li>
                </ul>
              </div>
            );
          }
        } else {
          // Handle other error cases
          console.error('Request failed:', data);
          
          if (data.error) {
            setError(data.error);
          } else if (data.non_field_errors) {
            setError(data.non_field_errors[0]);
          } else {
            setError('Failed to create ride request. Please try again.');
          }
        }
      } catch (err) {
        console.error('Error:', err);
        setError('Network error. Please try again.');
      }
    } catch (error) {
      console.error('Error in ride request process:', error);
      
      // Handle specific error cases
      if (error.message === 'NO_RIDES_AVAILABLE') {
        // Create a pending ride request instead
        console.log('No rides available, creating pending request');
        const pendingRequestData = {
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          pickup_latitude: pickupCoordinates.lat,
          pickup_longitude: pickupCoordinates.lng,
          dropoff_latitude: dropoffCoordinates.lat,
          dropoff_longitude: dropoffCoordinates.lng,
          departure_time: departureTime.toISOString(),
          seats_needed: parseInt(seatsNeeded),
          priority_timestamp: new Date().toISOString() // Add timestamp for priority queue
        };
        
        try {
          console.log('Creating pending ride request...');
          
          // Define token here
          const token = localStorage.getItem('token');
          
          const pendingResponse = await fetch(`${API_BASE_URL}/api/rides/pending-requests/`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Origin': window.location.origin
            },
            credentials: 'include',
            mode: 'cors',
            body: JSON.stringify(pendingRequestData)
          });
          
          console.log('Pending request response:', pendingResponse.status);
          const pendingResponseText = await pendingResponse.text();
          console.log('Pending response text:', pendingResponseText);
          
          if (!pendingResponse.ok) {
            if (pendingResponse.status === 401 || pendingResponse.status === 403) {
              localStorage.removeItem('token');
              throw new Error('Your session has expired. Please log in again.');
            }
            throw new Error(`Failed to create pending ride request: ${pendingResponseText}`);
          }
          
          const pendingData = JSON.parse(pendingResponseText);
          console.log('Pending request created:', pendingData);
          
          // Enable more frequent checking for matches when in pending mode
          const currentToken = localStorage.getItem('token'); // Store token at this level so it's available in the closure
          const pollInterval = setInterval(async () => {
            try {
              console.log('Checking for ride matches...');
              const matchResponse = await fetch(`${API_BASE_URL}/api/rides/pending-status/?pending_request_id=${pendingData.id}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${currentToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (!matchResponse.ok) {
                console.log('Failed to check for matches:', matchResponse.status);
                return;
              }
              
              const matchData = await matchResponse.json();
              console.log('Match check response:', matchData);
              
              // Show queue position if available
              if (matchData.queue_position) {
                setSuccess(`Your ride request is saved. You are #${matchData.queue_position} in line for the next available ride.`);
              }
              
              // If a match has been proposed
              if (matchData.has_match && matchData.match_details) {
                console.log('Match found!', matchData.match_details);
                
                // Clear the polling interval
                clearInterval(pollInterval);
                
                // Update the UI to show the match
                const enhancedMatchDetails = {
                  ...matchData.match_details,
                  pending_request_id: pendingData.id
                };
                setMatchDetails(enhancedMatchDetails);
                setShowMatchDialog(true);
                
                // Save the match details to localStorage
                try {
                  localStorage.setItem('currentMatch', JSON.stringify(enhancedMatchDetails));
                } catch (err) {
                  console.error('Error saving match to localStorage:', err);
                }
                
                // Play a sound or show a notification
                try {
                  // Create a notification
                  if ('Notification' in window) {
                    if (Notification.permission === 'granted') {
                      new Notification('Ride Match Found!', {
                        body: 'We found a ride that matches your request. Click to view details.',
                        icon: '/logo192.png'
                      });
                    } else if (Notification.permission !== 'denied') {
                      // Request permission
                      Notification.requestPermission().then(permission => {
                        if (permission === 'granted') {
                          new Notification('Ride Match Found!', {
                            body: 'We found a ride that matches your request. Click to view details.',
                            icon: '/logo192.png'
                          });
                        }
                      });
                    }
                  }
                  
                  // Play a sound
                  const audio = new Audio('/notification.mp3');
                  audio.play().catch(e => console.log('Could not play notification sound:', e));
                } catch (e) {
                  console.error('Error with notification:', e);
                }
              }
            } catch (e) {
              console.error('Error checking for matches:', e);
            }
          }, 15000); // Check every 15 seconds instead of 30
          
          // Store the interval ID so we can clear it if the component unmounts
          setMatchCheckInterval(pollInterval);
          
          setSuccess('Your ride request has been saved. We will notify you when a matching ride becomes available.');
          setLoading(false);
          isSubmitting.current = false;
          return () => {
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          };
        } catch (pendingError) {
          console.error('Error creating pending request:', pendingError);
          throw new Error(`Failed to create pending request: ${pendingError.message}`);
        }
      } else if (error.message.includes('session has expired')) {
        // Handle expired session
        setError('Your session has expired. Please log in again.');
        // Redirect to login page
        navigate('/login');
      } else {
        setError(`Failed to process ride request: ${error.message}`);
      }
      setLoading(false);
      isSubmitting.current = false;
      return;
    }
  };

  const handleAcceptMatch = async () => {
    try {
      setIsAccepting(true);
      const token = localStorage.getItem('token');
      const csrfToken = getCsrfToken();
      
      console.log('Full matchDetails object:', matchDetails);
      
      // Get the pending request ID from matchDetails - check multiple possible locations
      const pendingRequestId = matchDetails.pending_request_id || 
                              (matchDetails.full_response_data?.pending_request_id);
      
      if (!pendingRequestId) {
        console.error('No pending_request_id found to accept this ride. Match details:', matchDetails);
        setError('Missing required ID to accept this ride. Please try again or request a new ride.');
        setIsAccepting(false);
        return;
      }
      
      console.log('Accepting match with pending_request_id:', pendingRequestId);
      
      // Changed from /api/rides/requests/accept/ to /api/rides/requests/accept_match/
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accept_match/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-CSRFToken': csrfToken,
          'Accept': 'application/json'
        },
        credentials: 'include',
        // Only send the pending_request_id parameter as the backend expects it
        body: JSON.stringify({ pending_request_id: pendingRequestId.toString() })
      });
      
      // Log the full response for debugging
      console.log('Accept match response status:', response.status);
      console.log('Accept match response URL:', response.url);
      
      const responseText = await response.text();
      console.log('Raw accept match response:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed accept match response:', data);
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        setError('Server returned an invalid response. Please try again.');
        setIsAccepting(false);
        return;
      }

      if (response.ok) {
        // Clear the current match from localStorage since it's been accepted
        localStorage.removeItem('currentMatch');
        setShowMatchDialog(false);
        setSuccess('Ride accepted successfully!');
        
        // Reset accepting state before navigating
        setIsAccepting(false);
        
        // Redirect to accepted rides page with a timestamp to force refresh
        const timestamp = new Date().getTime();
        navigate(`/accepted-rides?t=${timestamp}`);
      } else {
        setError(data.error || data.detail || 'Failed to accept ride. Please try again.');
        setIsAccepting(false);
      }
    } catch (err) {
      console.error('Error accepting match:', err);
      setError('Failed to accept ride. Please try again.');
      setIsAccepting(false);
    }
  };

  const handleRejectMatch = async () => {
    try {
      setIsRejecting(true);
      const token = localStorage.getItem('token');
      const csrfToken = getCsrfToken();
      
      console.log('Full matchDetails object for rejection:', matchDetails);
      
      // Get the pending request ID from matchDetails - check multiple possible locations
      const pendingRequestId = matchDetails.pending_request_id || 
                               matchDetails.full_response_data?.pending_request_id;
      
      // If we don't find a pending_request_id, we need to use an alternative ID
      const idToUse = pendingRequestId || matchDetails.id || matchDetails.ride_id;
      
      if (!idToUse) {
        console.error('No ID found to reject this ride. Match details:', matchDetails);
        setError('Missing required ID to reject this ride. Please try again or request a new ride.');
        setIsRejecting(false);
        return;
      }
      
      console.log('Rejecting match with ID:', idToUse, 'Type:', pendingRequestId ? 'pending_request_id' : 'ride_id');
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/reject_match/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-CSRFToken': csrfToken,
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ pending_request_id: idToUse.toString() })
      });

      // Log the full response for debugging
      console.log('Reject match response status:', response.status);
      console.log('Reject match response URL:', response.url);
      
      const responseText = await response.text();
      console.log('Raw reject match response:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed reject match response:', data);
      } catch (e) {
        console.error('Failed to parse rejection response as JSON:', e);
        setError('Server returned an invalid response. Please try again.');
        setIsRejecting(false);
        return;
      }

      if (response.ok) {
        // Clear the current match from localStorage since it's been rejected
        localStorage.removeItem('currentMatch');
        setShowMatchDialog(false);
        setSuccess('Ride rejected. We will find you another match.');
        // Reset rejecting state after successful operation
        setIsRejecting(false);
      } else {
        setError(data.error || data.detail || 'Failed to reject ride. Please try again.');
        setIsRejecting(false);
      }
    } catch (err) {
      console.error('Error rejecting match:', err);
      setError('Failed to reject ride. Please try again.');
      setIsRejecting(false);
    }
  };

  // Add debugging for state changes
  useEffect(() => {
    console.log('State changed - showMatchDialog:', showMatchDialog);
    console.log('State changed - matchDetails:', matchDetails);
  }, [showMatchDialog, matchDetails]);

  const getOptimalPickupDetails = () => {
    // Get pickup data from all possible sources
    const pickupData = matchDetails.optimal_pickup_point || 
      (matchDetails.ride_request && matchDetails.ride_request.optimal_pickup_point) ||
      (matchDetails.ride_request && matchDetails.ride_request.optimal_pickup_info);
    
    if (!pickupData) {
      return <Typography variant="body2" color="text.secondary">No optimal pickup data available</Typography>;
    }
    
    // Handle string format
    let parsedData = pickupData;
    if (typeof pickupData === 'string') {
      try {
        parsedData = JSON.parse(pickupData);
      } catch (e) {
        console.error('Error parsing pickup data:', e);
        return <Typography variant="body2" color="text.secondary">Error parsing pickup data</Typography>;
      }
    }
    
    // Extract data with fallbacks
    const address = parsedData.address || 'Address not available';
    const latitude = parsedData.latitude || (parsedData.coordinates && parsedData.coordinates[0]);
    const longitude = parsedData.longitude || (parsedData.coordinates && parsedData.coordinates[1]);
    const distance = parsedData.distance_from_rider;
    
    return (
      <>
        <Typography variant="body2">{address}</Typography>
        {distance && (
          <Typography variant="body2" color="text.secondary">
            {(distance / 1000).toFixed(2)} km from requested pickup
          </Typography>
        )}
        {latitude && longitude && (
          <Button 
            size="small" 
            variant="outlined"
            sx={{ mt: 0.5, fontSize: '0.7rem' }}
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank')}
          >
            View on Maps
          </Button>
        )}
      </>
    );
  };

  const getOptimalDropoffDetails = () => {
    // Get dropoff data from all possible sources
    const dropoffData = matchDetails.optimal_dropoff_point || 
      (matchDetails.ride_request && matchDetails.ride_request.nearest_dropoff_point) ||
      (matchDetails.ride_request && matchDetails.ride_request.nearest_dropoff_info);
    
    if (!dropoffData) {
      return <Typography variant="body2" color="text.secondary">No optimal dropoff data available</Typography>;
    }
    
    // Handle string format
    let parsedData = dropoffData;
    if (typeof dropoffData === 'string') {
      try {
        parsedData = JSON.parse(dropoffData);
      } catch (e) {
        console.error('Error parsing dropoff data:', e);
        return <Typography variant="body2" color="text.secondary">Error parsing dropoff data</Typography>;
      }
    }
    
    // Extract data with fallbacks
    const address = parsedData.address || 'Address not available';
    const latitude = parsedData.latitude || (parsedData.coordinates && parsedData.coordinates[0]);
    const longitude = parsedData.longitude || (parsedData.coordinates && parsedData.coordinates[1]);
    const distance = parsedData.distance_from_rider;
    
    return (
      <>
        <Typography variant="body2">{address}</Typography>
        {distance && (
          <Typography variant="body2" color="text.secondary">
            {(distance / 1000).toFixed(2)} km from requested dropoff
          </Typography>
        )}
        {latitude && longitude && (
          <Button 
            size="small" 
            variant="outlined"
            sx={{ mt: 0.5, fontSize: '0.7rem' }}
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank')}
          >
            View on Maps
          </Button>
        )}
      </>
    );
  };

  return (
    <Container sx={{ px: 4, py: 3 }}>
      <Box sx={{ 
        textAlign: 'center', 
        mb: 4, 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%'
      }}>
        <Typography variant="h4" className="page-title" gutterBottom align="center">
          Request a Ride
        </Typography>
        <Typography variant="subtitle1" color="textSecondary" gutterBottom sx={{ textAlign: 'center' }}>
          Enter your ride details and we'll match you with available drivers
        </Typography>
      </Box>

      {error && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 4, borderRadius: '12px' }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Pickup Location"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                placeholder="e.g., 232 Pheasant Run Drive, Blacksburg, VA"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleLocationSearch(pickupLocation, true)}
                        edge="end"
                      >
                        <SearchIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: { borderRadius: '12px' }
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Dropoff Location"
                value={dropoffLocation}
                onChange={(e) => setDropoffLocation(e.target.value)}
                placeholder="e.g., Lane Stadium, Blacksburg, VA"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleLocationSearch(dropoffLocation, false)}
                        edge="end"
                      >
                        <SearchIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: { borderRadius: '12px' }
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateTimePicker
                  label="Desired Departure Time"
                  value={departureTime}
                  onChange={(newValue) => setDepartureTime(newValue)}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true,
                      sx: { '& .MuiOutlinedInput-root': { borderRadius: '12px' } }
                    },
                    popper: {
                      sx: { zIndex: 1300 }
                    }
                  }}
                  closeOnSelect={false}
                  minDateTime={new Date()}
                />
              </LocalizationProvider>
            </Grid>

            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                type="number"
                label="Number of Seats Needed"
                value={seatsNeeded}
                onChange={(e) => setSeatsNeeded(parseInt(e.target.value))}
                inputProps={{ min: 1 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
              />
            </Grid>

            {routeData && (
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: '12px' }}>
                  <Typography variant="h6" gutterBottom>
                    Route Information
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Distance: {(routeData.features[0].properties.segments[0].distance * 0.000621371).toFixed(2)} miles
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Duration: {Math.round(routeData.features[0].properties.segments[0].duration / 60)} minutes
                  </Typography>
                </Paper>
              </Grid>
            )}

            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                disabled={loading || !pickupCoordinates || !dropoffCoordinates || !departureTime}
                sx={{ 
                  borderRadius: '12px',
                  py: 1.5,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {loading ? 'Requesting...' : 'Request Ride'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>

      <Dialog 
        open={showMatchDialog} 
        onClose={() => {
          console.log('Dialog closed by user');
          setShowMatchDialog(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <Box sx={{ px: 3, pt: 3 }}>
          <Typography variant="h5" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
            Ride Match Found!
          </Typography>
          <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2 }}>
            Review the details below and confirm your ride
          </Typography>
        </Box>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          ) : matchDetails ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Driver Details */}
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                  <Person sx={{ mr: 1 }} /> Driver Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Name:</Typography>
                    <Typography variant="body2">{matchDetails.driver_name}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Contact:</Typography>
                    <Typography variant="body2">
                      {matchDetails.driver_email || 'Email not available'}
                    </Typography>
                    <Typography variant="body2">
                      {matchDetails.driver_phone || 'Phone not available'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
              
              {/* Vehicle Details */}
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                  <DirectionsCar sx={{ mr: 1 }} /> Vehicle Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Vehicle:</Typography>
                    <Typography variant="body2">
                      {matchDetails.vehicle_details?.year || matchDetails.vehicle_year || ''} {' '}
                      {matchDetails.vehicle_details?.make || matchDetails.vehicle_make || ''} {' '}
                      {matchDetails.vehicle_details?.model || matchDetails.vehicle_model || ''}
                    </Typography>
                    <Typography variant="body2">
                      Color: {matchDetails.vehicle_details?.color || matchDetails.vehicle_color || 'Not specified'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>License Plate:</Typography>
                    <Typography variant="body2">
                      {matchDetails.vehicle_details?.license_plate || matchDetails.license_plate || 'Not available'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
              
              {/* Trip Details */}
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                  <Schedule sx={{ mr: 1 }} /> Trip Details
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>From:</Typography>
                    <Typography variant="body2">
                      {matchDetails.pickup || matchDetails.ride_details?.start_location || 'Starting location'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>To:</Typography>
                    <Typography variant="body2">
                      {matchDetails.dropoff || matchDetails.ride_details?.end_location || 'Destination'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Departure Time:</Typography>
                    <Typography variant="body2">
                      {matchDetails.departure_time ? 
                        new Date(matchDetails.departure_time).toLocaleString() : 
                        'Not specified'}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
              
              {/* Pickup and Dropoff Locations */}
              <Paper elevation={1} sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>
                  <LocationOn sx={{ mr: 1 }} /> Pickup & Dropoff Points
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Optimal Pickup Point:
                    </Typography>
                    {getOptimalPickupDetails()}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Optimal Dropoff Point:
                    </Typography>
                    {getOptimalDropoffDetails()}
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          ) : (
            <Typography variant="body1" color="error">
              No match details available. Please try requesting a new ride.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button 
            onClick={() => setShowMatchDialog(false)} 
            color="secondary" 
            disabled={isAccepting || isRejecting}
          >
            Close
          </Button>
          <Button 
            onClick={handleRejectMatch} 
            color="error" 
            variant="outlined" 
            sx={{ ml: 1 }}
            disabled={isAccepting || isRejecting}
            startIcon={isRejecting ? <CircularProgress size={20} /> : null}
          >
            {isRejecting ? 'Declining...' : 'Decline Ride'}
          </Button>
          <Button 
            onClick={handleAcceptMatch} 
            variant="contained" 
            color="primary" 
            sx={{ ml: 1 }}
            startIcon={isAccepting ? <CircularProgress size={20} /> : <DirectionsCar />}
            disabled={isAccepting || isRejecting}
          >
            {isAccepting ? 'Accepting...' : 'Accept Ride'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RequestRide; 