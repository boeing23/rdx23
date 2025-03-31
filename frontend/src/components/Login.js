import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

function Login() {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First check if the backend is accessible
      console.log('Checking backend health...');
      const healthCheck = await fetch(`${API_BASE_URL}/api/health/`);
      if (!healthCheck.ok) {
        throw new Error('Backend service is not accessible');
      }
      console.log('Backend health check passed');

      console.log('Attempting login...');
      const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      console.log('Login response status:', response.status);
      const data = await response.json();

      if (response.ok) {
        console.log('Login successful, storing token and user data');
        // Store the token and user data
        localStorage.setItem('token', data.token);
        // Store userType as a string, not JSON
        localStorage.setItem('userType', data.user_type);
        console.log('Token and user data stored successfully');
        console.log('Token length:', data.token ? data.token.length : 0);
        console.log('Token format check:', data.token.startsWith('ey') ? 'Valid JWT format' : 'Invalid JWT format');
        console.log('User type:', data.user_type);

        // Verify storage
        const storedToken = localStorage.getItem('token');
        const storedUserType = localStorage.getItem('userType');
        console.log('Verification - Stored token exists:', !!storedToken);
        console.log('Verification - Stored token length:', storedToken ? storedToken.length : 0);
        console.log('Verification - Stored token format check:', storedToken ? (storedToken.startsWith('ey') ? 'Valid JWT format' : 'Invalid JWT format') : 'No token');
        console.log('Verification - Stored user type:', storedUserType);

        // Test the token with a simple API call
        try {
          console.log('Testing token with health check...');
          console.log('Request headers:', {
            'Authorization': `Bearer ${storedToken}`,
            'Accept': 'application/json'
          });
          
          const testResponse = await fetch(`${API_BASE_URL}/api/health/`, {
            headers: {
              'Authorization': `Bearer ${storedToken}`,
              'Accept': 'application/json'
            },
            credentials: 'include'
          });
          
          console.log('Health check response status:', testResponse.status);
          console.log('Health check response headers:', Object.fromEntries(testResponse.headers.entries()));
          
          if (!testResponse.ok) {
            throw new Error(`Token verification failed with status ${testResponse.status}`);
          }
          
          console.log('Token verification successful');
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('userType');
          setError('Failed to verify authentication. Please try again.');
          return;
        }

        // Redirect based on user type
        if (data.user_type === 'driver') {
          navigate('/driver-dashboard');
        } else {
          navigate('/rider-dashboard');
        }
      } else {
        console.error('Login failed:', data);
        setError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'An error occurred during login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Sign in
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
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
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login; 