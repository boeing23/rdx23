import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Button, Container, Box, useTheme, useMediaQuery } from '@mui/material';
import Typography from '@mui/material/Typography';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCar } from '@fortawesome/free-solid-svg-icons';
import Login from './components/Login';
import Register from './components/Register';
import RideList from './components/RideList';
import OfferRide from './components/OfferRide';
import RequestRide from './components/RequestRide';
import NotificationList from './components/NotificationList';
import UpdateDriverProfile from './components/UpdateDriverProfile';
import Navbar from './components/Navbar';
import DriverAcceptedRides from './components/DriverAcceptedRides';
import RiderAcceptedRides from './components/RiderAcceptedRides';
import UserProfile from './components/UserProfile';
import AuthPage from './components/AuthPage';
import { useAuth } from './contexts/AuthContext';
import './App.css';

function Home() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const location = useLocation();
  const { authState } = useAuth();
  const isAuthenticated = authState.isAuthenticated;
  const isLandingPage = location.pathname === '/';
  const showAsFullPage = isLandingPage && !isAuthenticated;

  return (
    <Box 
      sx={{ 
        mt: showAsFullPage ? 0 : 4, 
        textAlign: 'center',
        minHeight: showAsFullPage ? '100vh' : 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #861F41 0%, #5e0d29 100%)',
        color: 'white',
        p: { xs: 2, sm: 4 }
      }}
    >
      <Box sx={{ mb: 4 }}>
        <FontAwesomeIcon 
          icon={faCar} 
          size={showAsFullPage ? "5x" : "4x"} 
          style={{ 
            color: 'white',
            marginBottom: '1rem',
            animation: 'float 3s ease-in-out infinite'
          }}
        />
      </Box>
      <Typography 
        variant={isMobile ? (showAsFullPage ? "h3" : "h4") : (showAsFullPage ? "h2" : "h3")} 
        gutterBottom
        sx={{ 
          fontWeight: 'bold',
          mb: 2
        }}
      >
        ChalBeyy
      </Typography>
      <Typography 
        variant={isMobile ? (showAsFullPage ? "h5" : "h6") : (showAsFullPage ? "h4" : "h5")} 
        color="rgba(255, 255, 255, 0.9)" 
        gutterBottom
        sx={{ mb: 4, maxWidth: '800px' }}
      >
        The Smart Way to Share Your Journey
      </Typography>
      
      {showAsFullPage && (
        <Typography 
          variant="body1" 
          sx={{ 
            mb: 4, 
            maxWidth: '600px', 
            fontSize: { xs: '1rem', sm: '1.1rem' }
          }}
        >
          ChalBeyy connects drivers with empty seats to people traveling the same way. 
          Save money, reduce traffic and enjoy your commute!
        </Typography>
      )}
      
      <Box 
        sx={{ 
          mt: 4,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 2, sm: 2 },
          '& > *': {
            minWidth: { xs: '100%', sm: 'auto' },
            mx: { xs: 0, sm: 1.5 }
          }
        }}
      >
        <Button 
          variant="contained" 
          color="primary" 
          component={Link} 
          to="/login"
          size={showAsFullPage ? "large" : "medium"}
          sx={{ 
            bgcolor: 'white',
            color: '#861F41',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.9)'
            },
            px: showAsFullPage ? 4 : 2
          }}
        >
          Login
        </Button>
        <Button 
          variant="outlined" 
          color="inherit" 
          component={Link} 
          to="/register"
          size={showAsFullPage ? "large" : "medium"}
          sx={{ 
            borderColor: 'white',
            color: 'white',
            '&:hover': {
              borderColor: 'white',
              bgcolor: 'rgba(255, 255, 255, 0.1)'
            },
            px: showAsFullPage ? 4 : 2
          }}
        >
          Register
        </Button>
      </Box>
    </Box>
  );
}

// Main app content with Routes - this has access to location context
function AppContent() {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  
  // Use the Auth context instead of directly accessing localStorage
  const { authState } = useAuth();
  const isAuthenticated = authState.isAuthenticated;
  
  // Get user type from auth context
  const userType = authState.user?.user_type || '';
  
  // Don't show navbar on landing page for non-authenticated users
  const showNavbar = isAuthenticated || !isLandingPage;
  
  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/offer" element={<OfferRide />} />
        <Route path="/request-ride" element={<RequestRide />} />
        <Route path="/rides" element={<RideList />} />
        <Route path="/accepted-rides" element={
          userType === 'DRIVER' ? <DriverAcceptedRides /> : <RiderAcceptedRides />
        } />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/notifications" element={<NotificationList />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
