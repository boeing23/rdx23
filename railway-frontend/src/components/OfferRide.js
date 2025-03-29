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
  IconButton
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SearchIcon from '@mui/icons-material/Search';

const OfferRide = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    start_location: '',
    end_location: '',
    departure_time: null,
    available_seats: 1,
    price_per_seat: 0,
    start_latitude: 0,
    start_longitude: 0,
    end_latitude: 0,
    end_longitude: 0
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState({
    start: false,
    end: false
  });

  const handleLocationSearch = async (location, isStart) => {
    try {
      setError('');
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`
      );
      
      if (response.data && response.data[0]) {
        const { lat, lon, display_name } = response.data[0];
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
      setError('Error searching for location. Please try again.');
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

      // Format the data for submission
      const submitData = {
        ...formData,
        departure_time: formData.departure_time.toISOString(),
        available_seats: parseInt(formData.available_seats),
        price_per_seat: parseFloat(formData.price_per_seat)
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
      console.error('Error offering ride:', err);
      if (err.response) {
        // Server responded with error
        const errorData = err.response.data;
        let errorMessage = 'Error creating ride offer. ';
        
        if (typeof errorData === 'string') {
          // Handle plain string errors
          errorMessage = errorData;
        } else if (typeof errorData === 'object' && errorData !== null) {
          // Handle standard DRF error formats
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.non_field_errors) {
            errorMessage = errorData.non_field_errors.join(', ');
          } else {
            // Handle field-specific errors (dictionary)
            const fieldErrors = Object.entries(errorData)
              .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : String(errors)}`)
              .join('\n');
            // Use fieldErrors only if it's not empty, otherwise use a generic message
            errorMessage = fieldErrors ? fieldErrors : 'An unknown server error occurred.'; 
          }
        } else {
          // Fallback for unexpected error types
          errorMessage = 'An unexpected server error format was received.';
        }
        
        setError(errorMessage);
      } else if (err.request) {
        // Request made but no response
        setError('No response from server. Please check your connection and try again.');
      } else {
        // Something else went wrong (e.g., setup error)
        setError(err.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Offer a Ride
        </Typography>
        <Typography variant="subtitle1" color="textSecondary" gutterBottom>
          Only drivers can offer rides
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
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
                      >
                        <SearchIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
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
                      >
                        <SearchIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                error={!locationStatus.end && formData.end_location !== ''}
                helperText={!locationStatus.end && formData.end_location !== '' ? "Please search and select a valid location" : ""}
              />
            </Grid>

            <Grid item xs={12}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DateTimePicker
                  label="Departure Time"
                  value={formData.departure_time}
                  onChange={handleChange}
                  renderInput={(params) => <TextField {...params} fullWidth required />}
                  minDateTime={new Date()}
                />
              </LocalizationProvider>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                type="number"
                label="Available Seats"
                name="available_seats"
                value={formData.available_seats}
                onChange={handleChange}
                inputProps={{ min: 1 }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                type="number"
                label="Price per Seat ($)"
                name="price_per_seat"
                value={formData.price_per_seat}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
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