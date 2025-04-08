import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Link
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
  const [debugInfo, setDebugInfo] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking');
  const navigate = useNavigate();

  // Check backend health on component mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        console.log('Checking backend health at:', API_BASE_URL);
        setDebugInfo(prev => prev + `\nAttempting to connect to: ${API_BASE_URL}`);
        
        const response = await fetch(`${API_BASE_URL}/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        console.log('Backend health check response:', response.status);
        setDebugInfo(prev => prev + `\nBackend health check response: ${response.status}`);
        
        if (response.ok) {
          setBackendStatus('online');
          console.log('Backend is online');
          setDebugInfo(prev => prev + `\nBackend is online`);
        } else {
          setBackendStatus('error');
          console.error('Backend returned error status:', response.status);
          setDebugInfo(prev => prev + `\nBackend returned error status: ${response.status}`);
        }
      } catch (err) {
        setBackendStatus('offline');
        console.error('Backend health check failed:', err.message);
        setDebugInfo(prev => prev + `\nBackend health check failed: ${err.message}`);
      }
    };

    checkBackendHealth();
  }, []);

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
    setDebugInfo('Login attempt started...');

    try {
      console.log('Login attempt with:', { username: formData.username });
      setDebugInfo(prev => prev + `\nLogin attempt with username: ${formData.username}`);
      
      const loginUrl = `${API_BASE_URL}/api/users/login/`;
      setDebugInfo(prev => prev + `\nAttempting to connect to: ${loginUrl}`);
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
        }),
      });

      // Log raw response for debugging
      console.log('Login response status:', response.status);
      setDebugInfo(prev => prev + `\nLogin response status: ${response.status}`);
      
      const data = await response.json();
      console.log('Login response data:', data);
      setDebugInfo(prev => prev + `\nLogin response data: ${JSON.stringify(data)}`);

      if (!response.ok) {
        setDebugInfo(prev => prev + `\nError response: ${JSON.stringify(data)}`);
        throw new Error(data.detail || 'Invalid credentials');
      }

      // Verify we received a token
      if (!data.token) {
        console.error('No token received in login response', data);
        setDebugInfo(prev => prev + `\nNo token in response data. Received: ${JSON.stringify(data)}`);
        throw new Error('Invalid server response. Please try again.');
      }

      // Clear any existing auth data
      localStorage.removeItem('token');
      localStorage.removeItem('userType');
      localStorage.removeItem('userId');
      
      // Store new auth data
      localStorage.setItem('token', data.token);
      localStorage.setItem('userType', data.user_type);
      localStorage.setItem('userId', data.user?.id || '');

      // Verify storage
      console.log('Stored values:', {
        token: localStorage.getItem('token')?.substring(0, 10) + '...',
        userId: localStorage.getItem('userId'),
        userType: localStorage.getItem('userType')
      });
      setDebugInfo(prev => prev + `\nAuthentication successful!`);

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
      setDebugInfo(prev => prev + `\nLogin failed: ${err.message}`);
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
          
          {/* Backend status indicator */}
          <Box sx={{ mb: 2, textAlign: 'center' }}>
            <Typography variant="body2" color={
              backendStatus === 'online' ? 'success.main' : 
              backendStatus === 'offline' ? 'error.main' : 'warning.main'
            }>
              Backend status: {
                backendStatus === 'online' ? 'Connected' : 
                backendStatus === 'offline' ? 'Disconnected' : 'Checking...'
              }
            </Typography>
          </Box>
          
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
              disabled={backendStatus === 'offline'}
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
              disabled={backendStatus === 'offline'}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || backendStatus === 'offline'}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
            
            {/* Debug Information */}
            {debugInfo && (
              <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, maxHeight: '200px', overflow: 'auto' }}>
                <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                  {debugInfo}
                </Typography>
              </Box>
            )}
            
            {/* API Info */}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="caption">
                API URL: {API_BASE_URL}
              </Typography>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}

export default Login; 