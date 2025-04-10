import React, { useState } from 'react';
import { TextField, Button, Typography, Box, Paper, Container, Alert, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from '../config';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, socialLogin } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('Attempting login with username:', username);
      const result = await login(username, password);
      
      if (result.success) {
        console.log('Login successful');
        navigate('/dashboard');
      } else {
        console.error('Login failed:', result.error);
        setError(result.error);
      }
    } catch (err) {
      console.error('Login error:', err);
      
      // Handle different error scenarios
      if (err.response) {
        // The request was made and the server responded with an error status
        console.error('Server response:', err.response.status, err.response.data);
        
        if (err.response.status === 401) {
          setError('Invalid username or password. Please try again.');
        } else if (err.response.status === 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(`Error: ${err.response.data?.detail || 'Something went wrong'}`);
        }
      } else if (err.request) {
        // The request was made but no response was received
        console.error('Request made but no response:', err.request);
        setError('No response from server. Please check your connection.');
      } else {
        // Something happened in setting up the request
        console.error('Error setting up request:', err.message);
        setError('Error setting up request. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      setLoading(true);
      setError('');
      
      // Decode the credential to get user info
      const decoded = jwtDecode(credentialResponse.credential);
      console.log('Google login successful, decoded info:', decoded);
      
      // Use the socialLogin method from AuthContext
      const result = await socialLogin('google', credentialResponse.credential);
      
      if (result.success) {
        console.log('Google login processed successfully');
        
        // Navigate based on user type
        navigate(result.userType === 'DRIVER' ? '/offer' : '/rides');
      } else {
        console.error('Google login processing failed:', result.error);
        setError(result.error);
      }
      
    } catch (error) {
      console.error('Google login error:', error);
      setError(error.message || 'Failed to authenticate with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.error('Google login failed');
    setError('Google login failed. Please try again.');
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h4" align="center" gutterBottom>
          Login
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            variant="outlined"
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            sx={{ mt: 3, mb: 2, py: 1.5 }}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
          
          <Divider sx={{ my: 2 }}>OR</Divider>
          
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              useOneTap
              theme="filled_blue"
              text="signin_with"
              shape="rectangular"
              size="large"
            />
          </Box>
          
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2">
              Don't have an account?{' '}
              <Button 
                variant="text" 
                color="primary" 
                onClick={() => navigate('/register')}
                sx={{ p: 0, textTransform: 'none', fontSize: 'inherit' }}
              >
                Sign up here
              </Button>
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
};

export default Login; 