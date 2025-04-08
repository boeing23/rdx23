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
  DialogActions
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SearchIcon from '@mui/icons-material/Search';
import OpenRouteMap from './OpenRouteMap';

const RequestRide = () => {
  const navigate = useNavigate();
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState(null);
  const [dropoffCoordinates, setDropoffCoordinates] = useState(null);
  const [seatsNeeded, setSeatsNeeded] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [departureTime, setDepartureTime] = useState(null);
  const [success, setSuccess] = useState(null);
  const [matchDetails, setMatchDetails] = useState(null);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const isSubmitting = useRef(false);

  const ORS_API_KEY = "5b3ce3597851110001cf62482c1ae097a0b848ef81a1e5085aa27c1f";

  const handleLocationSearch = async (location, isPickup) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`
      );
      
      if (response.data && response.data[0]) {
        const { lat, lon, display_name } = response.data[0];
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
      setError('Error searching for location. Please try again.');
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
      const data = await response.json();
      console.log('Response data:', data);

      // If request was successful
      if (response.ok) {
        console.log('Request was successful');
        
        // If match details exist in the response
        if (data.match_details) {
          console.log('Found match details:', data.match_details);
          
          // No ride_request in the response, but match_details exists
          // Add proper structure to matchDetails with ride_id from the response
          const structuredMatchDetails = {
            ...data.match_details,
            // Store the ride ID explicitly 
            ride_id: data.match_details.ride_id,
            // Add proper structure for vehicle_details
            vehicle_details: {
              year: data.match_details.vehicle?.year || '',
              make: data.match_details.vehicle?.make || '',
              model: data.match_details.vehicle?.model || '',
              color: data.match_details.vehicle?.color || '',
              license_plate: data.match_details.vehicle?.license_plate || '',
              max_passengers: data.match_details.vehicle?.max_passengers || 1
            },
            // Set driver contact info if missing
            driver_email: data.match_details.driver?.email || '',
            driver_phone: data.match_details.driver?.phone_number || '',
            // Add ride_details for consistency
            ride_details: {
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
          console.log('Updated matchDetails:', structuredMatchDetails);
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
      
      // Safely parse the JSON from localStorage with error handling
      let currentMatch;
      try {
        const storedMatch = localStorage.getItem('currentMatch');
        currentMatch = storedMatch ? JSON.parse(storedMatch) : null;
      } catch (err) {
        console.error('Error parsing currentMatch from localStorage:', err);
        setError('Invalid ride data. Please try requesting a new ride.');
        return;
      }
      
      console.log('Current match data:', currentMatch);
      
      if (!currentMatch || !currentMatch.ride_id) {
        console.error('No ride ID found in current match:', currentMatch);
        setError('No ride ID found. Please try again.');
        return;
      }

      console.log('Accepting match with ride ID:', currentMatch.ride_id);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accept/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ride_id: currentMatch.ride_id })
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
      
      if (!currentMatch || !currentMatch.ride_id) {
        setError('No ride ID found. Please try again.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/reject/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ride_id: currentMatch.ride_id })
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Request a Ride
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <form onSubmit={handleSubmit}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Pickup Location"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
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
                    }}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Dropoff Location"
                    value={dropoffLocation}
                    onChange={(e) => setDropoffLocation(e.target.value)}
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
                    }}
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <DateTimePicker
                      label="Departure Time"
                      value={departureTime}
                      onChange={setDepartureTime}
                      renderInput={(params) => <TextField {...params} fullWidth />}
                    />
                  </LocalizationProvider>
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Number of Seats Needed</InputLabel>
                    <Select
                      value={seatsNeeded}
                      label="Number of Seats Needed"
                      onChange={(e) => setSeatsNeeded(e.target.value)}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <MenuItem key={num} value={num}>
                          {num}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    fullWidth
                    disabled={loading}
                  >
                    {loading ? 'Requesting...' : 'Request Ride'}
                  </Button>
                </Grid>
              </Grid>
            </form>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 3 }}>
            {pickupCoordinates && dropoffCoordinates ? (
              <OpenRouteMap
                pickupLocation={pickupLocation}
                dropoffLocation={dropoffLocation}
                pickupCoordinates={pickupCoordinates}
                dropoffCoordinates={dropoffCoordinates}
              />
            ) : (
              <Box
                sx={{
                  height: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'grey.100',
                  borderRadius: 1
                }}
              >
                <Typography color="text.secondary">
                  Enter pickup and dropoff locations to see the route
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
      
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="h6" gutterBottom>
                  Driver Details
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography>Name: {matchDetails.driver_name}</Typography>
                  <Typography>Email: {matchDetails.driver_email}</Typography>
                  <Typography>Phone: {matchDetails.driver_phone}</Typography>
                </Box>
              </Box>
              
              <Box>
                <Typography variant="h6" gutterBottom>
                  Vehicle Details
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography>
                    {matchDetails.vehicle_details?.year || ''} {matchDetails.vehicle_details?.make || ''} {matchDetails.vehicle_details?.model || ''}
                  </Typography>
                  <Typography>Color: {matchDetails.vehicle_details?.color || ''}</Typography>
                  <Typography>License Plate: {matchDetails.vehicle_details?.license_plate || ''}</Typography>
                  <Typography>Max Passengers: {matchDetails.vehicle_details?.max_passengers || ''}</Typography>
                </Box>
              </Box>
              
              <Box>
                <Typography variant="h6" gutterBottom>
                  Ride Details
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography>From: {matchDetails.ride_details?.start_location || ''}</Typography>
                  <Typography>To: {matchDetails.ride_details?.end_location || ''}</Typography>
                  <Typography>
                    Departure: {matchDetails.ride_details?.departure_time ? new Date(matchDetails.ride_details.departure_time).toLocaleString() : ''}
                  </Typography>
                  <Typography>Available Seats: {matchDetails.ride_details?.available_seats || ''}</Typography>
                </Box>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMatchDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default RequestRide; 