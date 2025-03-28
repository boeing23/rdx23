import React, { useState, useEffect } from 'react';
import { Button, Box, Container, TextField, Alert, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

function UpdateDriverProfile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_color: '',
    license_plate: '',
    max_passengers: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const userType = localStorage.getItem('userType');
    if (userType !== 'DRIVER') {
      navigate('/rides');
      return;
    }

    // Fetch current user data
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        console.log('Fetching user data with token:', token ? 'Token exists' : 'No token');
        
        const response = await fetch(`${API_BASE_URL}/api/users/me/`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        console.log('User data response status:', response.status);
        
        const data = await response.json();
        console.log('User data:', data);
        
        if (response.ok) {
          setFormData({
            vehicle_make: data.vehicle_make || '',
            vehicle_model: data.vehicle_model || '',
            vehicle_year: data.vehicle_year || '',
            vehicle_color: data.vehicle_color || '',
            license_plate: data.license_plate || '',
            max_passengers: data.max_passengers || ''
          });
        } else {
          console.error('Error fetching user data:', data);
          setError(data.detail || 'Failed to fetch user data');
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Network error while fetching user data');
      }
    };

    fetchUserData();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const userType = localStorage.getItem('userType');
      
      console.log('Token:', token ? 'Token exists' : 'No token');
      console.log('User Type:', userType);
      
      if (!token) {
        setError('Please log in to update your profile');
        navigate('/login');
        return;
      }

      if (userType !== 'DRIVER') {
        setError('Only drivers can update vehicle information');
        navigate('/rides');
        return;
      }

      console.log('Submitting profile update with data:', formData);

      const response = await fetch(`${API_BASE_URL}/api/users/update_profile/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      console.log('Update profile response status:', response.status);
      const data = await response.json();
      console.log('Update profile response:', data);

      if (response.ok) {
        setSuccess('Profile updated successfully!');
        // Redirect to rides page after a short delay
        setTimeout(() => navigate('/rides'), 2000);
      } else {
        // Handle specific error messages from the backend
        if (typeof data === 'object') {
          const errorMessages = Object.entries(data)
            .map(([key, value]) => {
              if (Array.isArray(value)) {
                return `${key}: ${value.join(', ')}`;
              }
              return `${key}: ${value}`;
            })
            .join('\n');
          setError(errorMessages);
          
          // If token is invalid, redirect to login
          if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userType');
            setTimeout(() => navigate('/login'), 2000);
          }
        } else {
          setError(data.detail || 'Failed to update profile');
        }
      }
    } catch (err) {
      console.error('Update profile error:', err);
      setError('Network error while updating profile. Please check if the server is running.');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Update Vehicle Information
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="vehicle_make"
            label="Vehicle Make"
            name="vehicle_make"
            value={formData.vehicle_make}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="vehicle_model"
            label="Vehicle Model"
            name="vehicle_model"
            value={formData.vehicle_model}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="vehicle_year"
            label="Vehicle Year"
            name="vehicle_year"
            type="number"
            inputProps={{ min: "1900", max: "2025" }}
            value={formData.vehicle_year}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="vehicle_color"
            label="Vehicle Color"
            name="vehicle_color"
            value={formData.vehicle_color}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="license_plate"
            label="License Plate"
            name="license_plate"
            value={formData.license_plate}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="max_passengers"
            label="Maximum Passengers"
            name="max_passengers"
            type="number"
            inputProps={{ min: "1", max: "8" }}
            value={formData.max_passengers}
            onChange={handleChange}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Update Profile
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

export default UpdateDriverProfile; 