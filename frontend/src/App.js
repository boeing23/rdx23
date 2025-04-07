import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AppBar, Toolbar, Button, Container, Box } from '@mui/material';
import Typography from '@mui/material/Typography';
import Login from './components/Login';
import Register from './components/Register';
import RideList from './components/RideList';
import OfferRide from './components/OfferRide';
import RequestRide from './components/RequestRide';
import NotificationList from './components/NotificationList';
import UpdateDriverProfile from './components/UpdateDriverProfile';
import Navbar from './components/Navbar';
import AcceptedRides from './components/AcceptedRides';
import './App.css';
import { API_BASE_URL } from './config';

function Home() {
  return (
    <Box sx={{ mt: 4, textAlign: 'center' }}>
      <Typography variant="h3" gutterBottom>
        ChalBe
      </Typography>
      <Typography variant="h5" color="textSecondary" gutterBottom>
        Find and share rides easily
      </Typography>
      <Box sx={{ mt: 4 }}>
        <Button variant="contained" color="primary" component={Link} to="/login" sx={{ mr: 2 }}>
          Login
        </Button>
        <Button variant="outlined" color="primary" component={Link} to="/register">
          Register
        </Button>
      </Box>
    </Box>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');

  // Check backend health on startup
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        console.log('Checking backend health...');
        const response = await fetch(`${API_BASE_URL}/`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        console.log('Backend health check response:', response.status);
        
        if (response.ok) {
          setBackendStatus('online');
          console.log('Backend is online');
        } else {
          setBackendStatus('error');
          console.error('Backend returned error status:', response.status);
        }
      } catch (err) {
        setBackendStatus('offline');
        console.error('Backend health check failed:', err.message);
      }
    };

    checkBackendHealth();
  }, []);

  // Authentication state handler
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('token');
      const storedUserType = localStorage.getItem('userType');
      
      console.log('App - Auth check:', { 
        hasToken: !!token, 
        userType: storedUserType,
        isStringified: storedUserType && storedUserType.includes('"')
      });

      if (token) {
        setIsAuthenticated(true);
        
        // Handle string or JSON format
        try {
          // Try to parse as JSON if it appears to be stringified
          if (storedUserType && (storedUserType.startsWith('"') || storedUserType.includes('{'))) {
            const parsed = JSON.parse(storedUserType);
            console.log('Parsed user type:', parsed);
            setUserType(parsed);
          } else {
            // Otherwise use as plain string
            console.log('Using user type as plain string:', storedUserType);
            setUserType(storedUserType);
          }
        } catch (e) {
          // If parsing fails, use as plain string
          console.error('Error parsing user type:', e);
          setUserType(storedUserType);
        }
      } else {
        setIsAuthenticated(false);
        setUserType(null);
      }
      setIsInitialized(true);
    };

    checkAuth();
    
    // Listen for auth-change events
    const handleAuthChange = () => {
      console.log('App detected auth change event');
      checkAuth();
    };
    
    window.addEventListener('auth-change', handleAuthChange);
    
    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    setIsAuthenticated(false);
    setUserType(null);
    window.location.href = '/';
  };

  // Show loading state while checking authentication
  if (!isInitialized) {
    return null;
  }

  return (
    <Router>
      <Navbar backendStatus={backendStatus} />
      <Container>
        {backendStatus === 'offline' && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'error.main', color: 'white', borderRadius: 1 }}>
            <Typography>
              Cannot connect to the backend server. Please try again later.
            </Typography>
          </Box>
        )}
        <Routes>
          <Route 
            path="/" 
            element={
              isAuthenticated ? (
                <Navigate to="/rides" replace />
              ) : (
                <Home />
              )
            } 
          />
          <Route 
            path="/rides" 
            element={
              isAuthenticated ? <RideList /> : <Navigate to="/login" replace />
            } 
          />
          <Route 
            path="/offer" 
            element={
              isAuthenticated ? (
                userType === 'DRIVER' ? <OfferRide /> : <Navigate to="/rides" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/update-driver-profile" element={
            isAuthenticated ? <UpdateDriverProfile /> : <Navigate to="/login" replace />
          } />
          <Route path="/request-ride" element={
            isAuthenticated ? <RequestRide /> : <Navigate to="/login" replace />
          } />
          <Route path="/accepted-rides" element={
            isAuthenticated ? <AcceptedRides /> : <Navigate to="/login" replace />
          } />
          <Route path="/notifications" element={
            isAuthenticated ? <NotificationList /> : <Navigate to="/login" replace />
          } />
        </Routes>
      </Container>
    </Router>
  );
}

export default App;
