import React, { useState, useEffect } from 'react';
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
  CircularProgress
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SearchIcon from '@mui/icons-material/Search';
import { getUserCurrentLocation, DEFAULT_LOCATION, geocodeWithPriority } from '../utils/locationUtils';

const OfferRide = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    start_location: '',
    end_location: '',
    departure_time: null,
    available_seats: 1,
    start_latitude: 0,
    start_longitude: 0,
    end_latitude: 0,
    end_longitude: 0
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState({
    start: false,
    end: false
  });
  const [userLocation, setUserLocation] = useState(null);
  
  // Get user's location on component mount
  useEffect(() => {
    const fetchUserLocation = async () => {
      const location = await getUserCurrentLocation();
      setUserLocation(location || DEFAULT_LOCATION);
    };
    
    fetchUserLocation();
  }, []);

  const handleLocationSearch = async (location, isStart) => {
    try {
      setLocationLoading(true);
      setError('');
      
      // Use the geocoder with proximity bias
      const geocodeResult = await geocodeWithPriority(location, userLocation);
      
      if (geocodeResult) {
        const { lat, lon, display_name } = geocodeResult;
        if (isStart) {
          setFormData(prev => ({
            ...prev,
            start_location: display_name,
            start_latitude: parseFloat(lat),
            start_longitude: parseFloat(lon)
          }));
          setLocationStatus(prev => ({ ...prev, start: true }));
        } else {
          setFormData(prev => ({
            ...prev,
            end_location: display_name,
            end_latitude: parseFloat(lat),
            end_longitude: parseFloat(lon)
          }));
          setLocationStatus(prev => ({ ...prev, end: true }));
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

  const handleChange = (e) => {
    // Handle DateTimePicker events
    if (e instanceof Date) {
      setFormData(prev => ({
        ...prev,
        departure_time: e
      }));
      return;
    }

    // Handle regular form input events
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Reset location status when user types new location
    if (name === 'start_location') {
      setLocationStatus(prev => ({ ...prev, start: false }));
    } else if (name === 'end_location') {
      setLocationStatus(prev => ({ ...prev, end: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }

      // Validate required fields
      if (!formData.start_location || !formData.end_location || !formData.departure_time) {
        throw new Error('Please fill in all required fields.');
      }

      // Validate coordinates
      if (!locationStatus.start || !locationStatus.end) {
        throw new Error('Please search and select valid locations using the search buttons.');
      }

      // Validate numeric fields
      if (parseInt(formData.available_seats) < 1) {
        throw new Error('Available seats must be at least 1.');
      }

      // Validate departure time is in the future
      const departureTime = new Date(formData.departure_time);
      const now = new Date();
      if (departureTime <= now) {
        throw new Error('Departure time must be in the future.');
      }

      // Format the data for submission
      const submitData = {
        start_location: formData.start_location,
        end_location: formData.end_location,
        start_latitude: parseFloat(formData.start_latitude),
        start_longitude: parseFloat(formData.start_longitude),
        end_latitude: parseFloat(formData.end_latitude),
        end_longitude: parseFloat(formData.end_longitude),
        departure_time: departureTime.toISOString(),
        available_seats: parseInt(formData.available_seats)
      };

      console.log('Submitting ride data:', JSON.stringify(submitData, null, 2));

      const response = await axios.post(
        `${API_BASE_URL}/api/rides/rides/`,
        submitData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 201) {
        navigate('/rides');
      } else {
        throw new Error('Failed to create ride offer.');
      }
    } catch (err) {
      // Log the raw error object and response for detailed debugging
      console.error('Raw error object:', err);
      if (err.response) {
        console.error('Backend response data:', err.response.data);
        console.error('Backend response status:', err.response.status);
        console.error('Backend response headers:', err.response.headers);
      } else if (err.request) {
        console.error('Error request data:', err.request);
      }

      // Handle different types of errors
      if (err.response) {
        // Server responded with error
        const errorData = err.response.data;
        let errorMessage = 'Error creating ride offer. ';
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData === 'object' && errorData !== null) {
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.non_field_errors) {
            errorMessage = errorData.non_field_errors.join(', ');
          } else {
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : String(errors)}`)
              .join('\n');
            errorMessage = fieldErrors || 'An unknown server error occurred.';
          }
        } else {
          errorMessage = 'An unexpected server error format was received.';
        }
        
        setError(errorMessage);
      } else if (err.request) {
        // No response from server
        setError('No response from server. Please check your connection and try again.');
      } else if (err.message) {
        // Error in the request itself
        setError(err.message);
      } else {
        // Unexpected error
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <Box sx={{ 
        textAlign: 'center', 
        mb: 4, 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%'
      }}>
        <Typography variant="h4" className="page-title" gutterBottom align="center">
          Offer a Ride
        </Typography>
        <Typography variant="subtitle1" color="textSecondary" gutterBottom sx={{ textAlign: 'center' }}>
          Enter your ride details to help others find your route
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 4, borderRadius: '12px' }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="Start Location"
                name="start_location"
                value={formData.start_location}
                onChange={handleChange}
                placeholder="e.g., 232 Pheasant Run Drive, Blacksburg, VA"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleLocationSearch(formData.start_location, true)}
                        edge="end"
                        disabled={locationLoading}
                      >
                        {locationLoading ? <CircularProgress size={24} /> : <SearchIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: { borderRadius: '12px' }
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                error={!locationStatus.start && formData.start_location !== ''}
                helperText={!locationStatus.start && formData.start_location !== '' ? "Please search and select a valid location" : ""}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                label="End Location"
                name="end_location"
                value={formData.end_location}
                onChange={handleChange}
                placeholder="e.g., Lane Stadium, Blacksburg, VA"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => handleLocationSearch(formData.end_location, false)}
                        edge="end"
                        disabled={locationLoading}
                      >
                        {locationLoading ? <CircularProgress size={24} /> : <SearchIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: { borderRadius: '12px' }
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                error={!locationStatus.end && formData.end_location !== ''}
                helperText={!locationStatus.end && formData.end_location !== '' ? "Please search and select a valid location" : ""}
              />
            </Grid>

            <Grid item xs={12}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateTimePicker
                  label="Departure Time"
                  value={formData.departure_time}
                  onChange={(newValue) => setFormData(prev => ({
                    ...prev,
                    departure_time: newValue
                  }))}
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
                label="Available Seats"
                name="available_seats"
                value={formData.available_seats}
                onChange={handleChange}
                inputProps={{ min: 1 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                disabled={loading}
                sx={{ 
                  borderRadius: '12px',
                  py: 1.5,
                  textTransform: 'none',
                  fontWeight: 600
                }}
              >
                {loading ? 'Creating Ride...' : 'Offer Ride'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Container>
  );
};

export default OfferRide; 