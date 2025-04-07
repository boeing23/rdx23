import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';
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
  
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SearchIcon from '@mui/icons-material/Search';
import { getUserCurrentLocation, DEFAULT_LOCATION, geocodeWithPriority } from '../utils/locationUtils';

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
  const isSubmitting = useRef(false);

  const ORS_API_KEY = "5b3ce3597851110001cf62482c1ae097a0b848ef81a1e5085aa27c1f";
  
  // Get user's location on component mount
  useEffect(() => {
    const fetchUserLocation = async () => {
      const location = await getUserCurrentLocation();
      setUserLocation(location || DEFAULT_LOCATION);
    };
    
    fetchUserLocation();
  }, []);

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
        `https://api.openrouteservice.org/v2/directions/driving-car`,
        {
          params: {
            api_key: ORS_API_KEY,
            start: `${pickupCoordinates.lng},${pickupCoordinates.lat}`,
            end: `${dropoffCoordinates.lng},${dropoffCoordinates.lat}`
          },
          headers: {
            'Accept': 'application/geo+json;charset=UTF-8',
            'Content-Type': 'application/json'
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
      
      // First, find available rides to get a ride ID
      console.log('Searching for available rides...');
      const ridesResponse = await fetch(`${API_BASE_URL}/api/rides/rides/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let rideId = null;
      
      if (ridesResponse.ok) {
        const ridesData = await ridesResponse.json();
        console.log('Available rides found:', ridesData.length);
        
        if (ridesData.length > 0) {
          // Select the first available ride
          rideId = ridesData[0].id;
          console.log('Selected ride ID:', rideId);
        } else {
          console.log('No available rides found');
          setError('No available rides found. Please try again later.');
          setLoading(false);
          isSubmitting.current = false;
          return;
        }
      } else {
        console.log('Failed to fetch rides');
        // Continue anyway, but log the issue
      }
      
      // Prepare request data with the ride ID if found
      const requestData = {
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        pickup_latitude: pickupCoordinates.lat,
        pickup_longitude: pickupCoordinates.lng,
        dropoff_latitude: dropoffCoordinates.lat,
        dropoff_longitude: dropoffCoordinates.lng,
        departure_time: departureTime.toISOString(),
        seats_needed: parseInt(seatsNeeded)
      };
      
      // Add ride ID if we found one
      if (rideId) {
        requestData.ride = rideId;
      }

      console.log('Submitting ride request with data:', requestData);

      // Make API request
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
        console.log('Unable to parse response text as JSON, using text response instead');
        setError('Server returned invalid JSON response. Please try again.');
        setLoading(false);
        isSubmitting.current = false;
        return;
      }

      // If request was successful
      if (response.ok) {
        console.log('Request was successful');
        
        // If match details exist in the response
        if (data.match_details) {
          console.log('Found match details:', data.match_details);
          console.log('Found ride request:', data.ride_request);
          
          // Add proper structure to matchDetails
          const structuredMatchDetails = {
            ...data.match_details,
            ride_request: data.ride_request,
            // Add proper structure for vehicle_details
            vehicle_details: {
              year: data.match_details.vehicle_year || '',
              make: data.match_details.vehicle_make || '',
              model: data.match_details.vehicle_model || '',
              color: data.match_details.vehicle_color || '',
              license_plate: data.match_details.license_plate || '',
              max_passengers: data.match_details.max_passengers || 1
            },
            // Set driver contact info if missing
            driver_email: data.match_details.driver_email || data.ride_request.ride_details?.driver?.email || '',
            driver_phone: data.match_details.driver_phone || data.ride_request.ride_details?.driver?.phone_number || '',
            // Add ride_details for consistency
            ride_details: data.ride_request.ride_details || {
              start_location: data.match_details.pickup || '',
              end_location: data.match_details.dropoff || '',
              departure_time: data.match_details.departure_time || new Date().toISOString(),
              available_seats: 1
            }
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
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const handleAcceptMatch = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Safely parse the JSON from localStorage with improved error handling
      let currentMatch;
      try {
        const storedMatch = localStorage.getItem('currentMatch');
        console.log('Raw stored match from localStorage:', storedMatch);
        
        if (!storedMatch) {
          throw new Error('No match data found in localStorage');
        }
        
        // Check if it's already an object (improperly stored)
        if (typeof storedMatch === 'object') {
          console.warn('Match data already an object, not a string. Using directly.');
          currentMatch = storedMatch;
        } else {
          // Normal case - parse the JSON string
          currentMatch = JSON.parse(storedMatch);
        }
      } catch (err) {
        console.error('Error parsing currentMatch from localStorage:', err);
        
        // Try to save a valid JSON string (recovery attempt)
        try {
          if (matchDetails) {
            console.log('Attempting recovery using matchDetails from state');
            currentMatch = matchDetails;
            localStorage.setItem('currentMatch', JSON.stringify(matchDetails));
          }
        } catch (recoveryErr) {
          console.error('Recovery attempt failed:', recoveryErr);
        }
        
        if (!currentMatch) {
          setError('Invalid ride data. Please try requesting a new ride.');
          return;
        }
      }
      
      console.log('Current match data:', currentMatch);
      
      if (!currentMatch || !currentMatch.ride_request) {
        console.error('No ride request found in current match:', currentMatch);
        setError('No ride request found. Please try again.');
        return;
      }

      console.log('Accepting match with ride request ID:', currentMatch.ride_request.id);
      
      // Use the correct endpoint URL
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${currentMatch.ride_request.id}/accept_match/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Check if response is valid JSON
      let data;
      const responseText = await response.text();
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        console.error('Response text:', responseText);
        setError('Server returned invalid response. Please try again.');
        return;
      }

      console.log('Accept match response:', data);

      if (response.ok) {
        // Clear the current match from localStorage since it's been accepted
        try {
          localStorage.removeItem('currentMatch');
        } catch (err) {
          console.error('Error removing currentMatch from localStorage:', err);
          // Continue despite error
        }
        
        setShowMatchDialog(false);
        setSuccess('Ride accepted successfully!');
        
        // Add a timestamp to force a refresh of the AcceptedRides component
        const timestamp = new Date().getTime();
        navigate(`/accepted-rides?t=${timestamp}`);
      } else {
        setError(data.error || 'Failed to accept ride. Please try again.');
      }
    } catch (err) {
      console.error('Error accepting match:', err);
      setError('Failed to accept ride. Please try again.');
    }
  };

  const handleRejectMatch = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Safely parse the JSON from localStorage with error handling
      let currentMatch;
      try {
        const storedMatch = localStorage.getItem('currentMatch');
        currentMatch = storedMatch ? JSON.parse(storedMatch) : null;
      } catch (err) {
        console.error('Error parsing currentMatch from localStorage:', err);
        setError('Invalid ride data. Please close this dialog and try again.');
        return;
      }
      
      if (!currentMatch || !currentMatch.ride_request) {
        setError('No match found. Please try again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${currentMatch.ride_request.id}/reject_match/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSuccess('Ride request rejected. You can try requesting another ride.');
        setShowMatchDialog(false);
        localStorage.removeItem('currentMatch'); // Clean up after rejection
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to reject ride request. Please try again.');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Network error. Please try again.');
    }
  };

  // Add debugging for state changes
  useEffect(() => {
    console.log('State changed - showMatchDialog:', showMatchDialog);
    console.log('State changed - matchDetails:', matchDetails);
  }, [showMatchDialog, matchDetails]);

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
        <DialogTitle>
          <Typography variant="h5" component="div">
            Ride Match Found!
          </Typography>
        </DialogTitle>
        <DialogContent>
          {matchDetails ? (
            <>
              <Typography variant="h6" gutterBottom>
                Driver Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Name:</strong> {matchDetails.driver_name || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Email:</strong> {matchDetails.driver_email || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Phone:</strong> {matchDetails.driver_phone || 'Not provided'}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="h6" sx={{ mt: 2 }} gutterBottom>
                Vehicle Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Make:</strong> {matchDetails.vehicle_details?.make || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Model:</strong> {matchDetails.vehicle_details?.model || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Color:</strong> {matchDetails.vehicle_details?.color || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>License Plate:</strong> {matchDetails.vehicle_details?.license_plate || 'Not provided'}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="h6" sx={{ mt: 2 }} gutterBottom>
                Ride Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Pickup Location:</strong> {matchDetails.ride_details?.start_location || matchDetails.pickup || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Dropoff Location:</strong> {matchDetails.ride_details?.end_location || matchDetails.dropoff || 'Not provided'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Departure Time:</strong> {new Date(matchDetails.ride_details?.departure_time || matchDetails.departure_time).toLocaleString()}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Available Seats:</strong> {matchDetails.ride_details?.available_seats || 1}
                  </Typography>
                </Grid>
              </Grid>

              <Typography variant="h6" sx={{ mt: 2 }} gutterBottom>
                Pickup & Drop-off Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Requested Pickup:</strong> {matchDetails.pickup || 'Not provided'}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Optimal Pickup:</strong> {matchDetails.ride_request?.optimal_pickup_point ? 
                      `${matchDetails.ride_request.optimal_pickup_point.latitude.toFixed(6)}, ${matchDetails.ride_request.optimal_pickup_point.longitude.toFixed(6)}` : 
                      'Not available'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body1">
                    <strong>Requested Dropoff:</strong> {matchDetails.dropoff || 'Not provided'}
                  </Typography>
                  <Typography variant="body1">
                    <strong>Optimal Dropoff:</strong> {matchDetails.ride_request?.nearest_dropoff_point ? 
                      `${matchDetails.ride_request.nearest_dropoff_point.latitude.toFixed(6)}, ${matchDetails.ride_request.nearest_dropoff_point.longitude.toFixed(6)}` : 
                      'Not available'}
                  </Typography>
                </Grid>
              </Grid>
            </>
          ) : (
            <Typography variant="body1" color="error">
              No match details available. Please try requesting a new ride.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMatchDialog(false)}>Close</Button>
          <Button onClick={handleAcceptMatch} variant="contained" color="primary">
            Accept Ride
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RequestRide; 