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
    setLoading(true);
    setError('');

    try {
      console.log('Login attempt with:', { email: formData.username, password: '***' });
      
      const response = await fetch(`${API_BASE_URL}/api/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.username,
          password: formData.password,
        }),
      });

      // Log raw response for debugging
      console.log('Login response status:', response.status);
      
      const data = await response.json();
      console.log('Login response data:', Object.keys(data));

      if (!response.ok) {
        throw new Error(data.detail || 'Invalid credentials');
      }

      // Clear any existing auth data
      localStorage.removeItem('token');
      localStorage.removeItem('userType');
      localStorage.removeItem('userId');
      
      // Store new auth data
      localStorage.setItem('token', data.access);
      localStorage.setItem('userId', data.user_id);
      localStorage.setItem('userType', data.user_type);

      // Verify storage
      console.log('Stored values:', {
        token: localStorage.getItem('token')?.substring(0, 10) + '...',
        userId: localStorage.getItem('userId'),
        userType: localStorage.getItem('userType')
      });

      // Dispatch custom event to notify the Navbar of login
      console.log('Dispatching auth-change event');
      window.dispatchEvent(new Event('auth-change'));

      console.log('Login successful, redirecting to home page');
      
      // Short delay before redirecting to allow event to be processed
      setTimeout(() => {
        navigate('/');
      }, 100);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login. Please try again.');
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