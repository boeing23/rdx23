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

  useEffect(() => {
    const initializeAuth = () => {
      const token = localStorage.getItem('token');
      const storedUserType = localStorage.getItem('userType');
      
      if (token) {
        setIsAuthenticated(true);
        try {
          const parsedUserType = JSON.parse(storedUserType);
          setUserType(parsedUserType);
        } catch (e) {
          console.error('Error parsing user type:', e);
          setUserType(storedUserType);
        }
      }
      setIsInitialized(true);
    };

    initializeAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    setIsAuthenticated(false);
    setUserType(null);
    window.location.href = '/';
  };

  if (!isInitialized) {
    return null;
  }

  return (
    <Router>
      <Navbar />
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? (
              <Navigate to={userType === 'DRIVER' ? '/offer' : '/rides'} replace />
            ) : (
              <Home />
            )
          } 
        />
        <Route 
          path="/rides" 
          element={
            isAuthenticated ? (
              userType === 'RIDER' ? <RideList /> : <Navigate to="/offer" replace />
            ) : (
              <Navigate to="/login" replace />
            )
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
        <Route path="/update-driver-profile" element={<UpdateDriverProfile />} />
        <Route path="/request-ride" element={<RequestRide />} />
        <Route path="/accepted-rides" element={<AcceptedRides />} />
        <Route path="/notifications" element={<NotificationList />} />
      </Routes>
    </Router>
  );
}

export default App;
