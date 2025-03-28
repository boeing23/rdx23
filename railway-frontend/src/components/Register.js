import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Box, Container } from '@mui/material';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { API_BASE_URL } from '../config';

function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    is_driver: false,
    // Driver-specific fields
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_color: '',
    license_plate: '',
    max_passengers: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate phone number format
    const phoneRegex = /^\+?[\d\s-]{10,}$/;
    if (!phoneRegex.test(formData.phone_number)) {
      setError('Please enter a valid phone number (at least 10 digits)');
      return;
    }

    if (formData.password !== formData.password2) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    // Validate driver-specific fields if registering as a driver
    if (formData.is_driver) {
      if (!formData.vehicle_make || !formData.vehicle_model || !formData.vehicle_year || 
          !formData.vehicle_color || !formData.license_plate || !formData.max_passengers) {
        setError('Please fill in all vehicle information');
        return;
      }

      // Validate vehicle year
      const vehicleYear = parseInt(formData.vehicle_year);
      if (vehicleYear < 1900 || vehicleYear > 2025) {
        setError('Please enter a valid vehicle year (1900-2025)');
        return;
      }

      // Validate max passengers
      const maxPassengers = parseInt(formData.max_passengers);
      if (maxPassengers < 1 || maxPassengers > 8) {
        setError('Maximum passengers must be between 1 and 8');
        return;
      }

      // Validate license plate format (basic validation)
      const licensePlateRegex = /^[A-Z0-9-]{2,8}$/;
      if (!licensePlateRegex.test(formData.license_plate.toUpperCase())) {
        setError('Please enter a valid license plate number');
        return;
      }
    }

    try {
      console.log('Sending registration data to:', `${API_BASE_URL}/api/users/register/`);
      console.log('Registration data:', {
        ...formData,
        password: '[HIDDEN]',
        password2: '[HIDDEN]'
      });

      const response = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          password2: formData.password2,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone_number: formData.phone_number,
          user_type: formData.is_driver ? 'DRIVER' : 'RIDER',
          ...(formData.is_driver && {
            vehicle_make: formData.vehicle_make,
            vehicle_model: formData.vehicle_model,
            vehicle_year: formData.vehicle_year,
            vehicle_color: formData.vehicle_color,
            license_plate: formData.license_plate,
            max_passengers: formData.max_passengers
          })
        })
      });

      console.log('Response status:', response.status);
      
      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        
        try {
          // Try to parse as JSON if possible
          const errorData = JSON.parse(errorText);
          setError(errorData.detail || 'Registration failed');
        } catch (e) {
          // If not JSON, show the raw error or a generic message
          setError(`Registration failed: ${errorText.substring(0, 100)}...`);
        }
        return;
      }
      
      const data = await response.json();
      console.log('Registration response:', data);

      // Store token and user type
      localStorage.setItem('token', data.token);
      localStorage.setItem('userType', JSON.stringify(data.user_type));
      console.log('Registration successful. User type:', data.user_type);
      console.log('Stored user type in localStorage:', localStorage.getItem('userType'));
      
      // Navigate based on user type
      if (data.user_type === 'DRIVER') {
        navigate('/offer');
      } else {
        navigate('/rides');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Network error during registration. Please check the console for details.');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          Register
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
            {error}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={formData.username}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="phone_number"
            label="Phone Number"
            name="phone_number"
            autoComplete="tel"
            value={formData.phone_number}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="first_name"
            label="First Name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="last_name"
            label="Last Name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            value={formData.password}
            onChange={handleChange}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password2"
            label="Confirm Password"
            type="password"
            id="password2"
            value={formData.password2}
            onChange={handleChange}
          />
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_driver}
                onChange={handleChange}
                name="is_driver"
                color="primary"
              />
            }
            label="Register as a Driver"
            sx={{ mt: 2 }}
          />
          
          {formData.is_driver && (
            <>
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
            </>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Register
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

export default Register; 