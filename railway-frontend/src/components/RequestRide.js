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
  CircularProgress
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
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to request a ride');
        return;
      }

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
          
          // Update state to trigger modal display
          setMatchDetails({
            ...data.match_details,
            ride_request: data.ride_request
          });
          setShowMatchDialog(true);
          setSuccess('Found a matching ride! Please review the details below.');
          
          // Save both match_details and ride_request to localStorage
          localStorage.setItem('currentMatch', JSON.stringify({
            ...data.match_details,
            ride_request: data.ride_request
          }));
          
          // Clear form
          setPickupLocation('');
          setDropoffLocation('');
          setPickupCoordinates(null);
          setDropoffCoordinates(null);
          setDepartureTime(null);
          setSeatsNeeded(1);
          
          console.log('Set showMatchDialog to:', true);
          console.log('Updated matchDetails with ride request:', {
            ...data.match_details,
            ride_request: data.ride_request
          });
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
      const currentMatch = JSON.parse(localStorage.getItem('currentMatch'));
      
      console.log('Current match data:', currentMatch);
      
      if (!currentMatch || !currentMatch.ride_request) {
        console.error('No ride request found in current match:', currentMatch);
        setError('No ride request found. Please try again.');
        return;
      }

      console.log('Accepting match with ride request ID:', currentMatch.ride_request.id);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${currentMatch.ride_request.id}/accept_match/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Accept match response:', data);

      if (response.ok) {
        // Clear the current match from localStorage since it's been accepted
        localStorage.removeItem('currentMatch');
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
      const currentMatch = JSON.parse(localStorage.getItem('currentMatch'));
      
      if (!currentMatch) {
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
                    }
                  }}
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
              <Typography>Name: {matchDetails.driver_name}</Typography>
              <Typography>Email: {matchDetails.driver_email}</Typography>
              <Typography>Phone: {matchDetails.driver_phone}</Typography>
              
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Vehicle Details
              </Typography>
              <Typography>
                {matchDetails.vehicle_details.year} {matchDetails.vehicle_details.make} {matchDetails.vehicle_details.model}
              </Typography>
              <Typography>Color: {matchDetails.vehicle_details.color}</Typography>
              <Typography>License Plate: {matchDetails.vehicle_details.license_plate}</Typography>
              <Typography>Max Passengers: {matchDetails.vehicle_details.max_passengers}</Typography>
              
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Ride Details
              </Typography>
              <Typography>From: {matchDetails.ride_details.start_location}</Typography>
              <Typography>To: {matchDetails.ride_details.end_location}</Typography>
              <Typography>
                Departure: {new Date(matchDetails.ride_details.departure_time).toLocaleString()}
              </Typography>
              <Typography>Available Seats: {matchDetails.ride_details.available_seats}</Typography>
            </>
          ) : (
            <Typography>Loading match details...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRejectMatch} color="error">
            Reject
          </Button>
          <Button onClick={handleAcceptMatch} color="primary" variant="contained">
            Accept
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RequestRide; 