import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Box, Container } from '@mui/material';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import { API_BASE_URL } from '../config';

function Login() {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      console.log('Attempting login with:', { username: formData.username });
      
      const requestBody = JSON.stringify(formData);
      console.log('Request body:', requestBody);
      
      // First check if the backend is accessible
      try {
        const healthCheck = await fetch(`${API_BASE_URL}/`);
        console.log('Backend health check status:', healthCheck.status);
        if (!healthCheck.ok) {
          throw new Error(`Health check failed with status ${healthCheck.status}`);
        }
        const healthData = await healthCheck.json();
        console.log('Backend health check response:', healthData);
      } catch (err) {
        console.error('Backend server is not accessible:', err);
        setError('Cannot connect to server. Please make sure the backend server is running.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/users/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: requestBody
      });

      console.log('Login response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      let data;
      try {
        data = await response.json();
        console.log('Login response data:', data);
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        setError('Invalid response from server. Please try again.');
        return;
      }

      if (response.ok) {
        console.log('Login successful, storing data in localStorage');
        
        // Check if we have all required data
        if (!data.token || !data.user_type || !data.user || !data.user.id) {
          console.error('Missing required data in login response:', data);
          setError('Invalid response from server. Please try again.');
          return;
        }

        // Store the data
        localStorage.setItem('token', data.token);
        localStorage.setItem('userType', JSON.stringify(data.user_type));
        localStorage.setItem('userId', data.user.id);
        
        console.log('Data stored in localStorage:', {
          token: !!localStorage.getItem('token'),
          userType: localStorage.getItem('userType'),
          userId: localStorage.getItem('userId')
        });

        // Navigate to home page
        navigate('/');
        window.location.reload(); // Reload to update the UI state
      } else {
        console.error('Login failed:', data);
        setError(data.detail || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      console.error('Login error:', err);
      console.error('Error details:', err.message);
      if (err.message.includes('Failed to fetch')) {
        setError('Cannot connect to server. Please make sure the backend server is running.');
      } else {
        setError('Network error. Please try again.');
      }
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">
          Sign In
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
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={formData.password}
            onChange={handleChange}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            Sign In
          </Button>
        </Box>
      </Box>
    </Container>
  );
}

export default Login; 