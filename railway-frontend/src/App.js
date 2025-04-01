import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
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
import AcceptedRides from './components/AcceptedRides';
import UserProfile from './components/UserProfile';
import './App.css';

function Home() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Box 
      sx={{ 
        mt: 4, 
        textAlign: 'center',
        minHeight: 'calc(100vh - 64px)',
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
          size="4x" 
          style={{ 
            color: 'white',
            marginBottom: '1rem',
            animation: 'float 3s ease-in-out infinite'
          }}
        />
      </Box>
      <Typography 
        variant={isMobile ? "h4" : "h3"} 
        gutterBottom
        sx={{ 
          fontWeight: 'bold',
          mb: 2
        }}
      >
        ChalBeyy
      </Typography>
      <Typography 
        variant={isMobile ? "h6" : "h5"} 
        color="rgba(255, 255, 255, 0.9)" 
        gutterBottom
        sx={{ mb: 4 }}
      >
        Find and share rides easily
      </Typography>
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
          sx={{ 
            bgcolor: 'white',
            color: '#861F41',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.9)'
            }
          }}
        >
          Login
        </Button>
        <Button 
          variant="outlined" 
          color="inherit" 
          component={Link} 
          to="/register"
          sx={{ 
            borderColor: 'white',
            color: 'white',
            '&:hover': {
              borderColor: 'white',
              bgcolor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
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
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);

  useEffect(() => {
    const initializeAuth = () => {
      const token = localStorage.getItem('token');
      const storedUserType = localStorage.getItem('userType');
      const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
      
      // Check if this is the first time the user is visiting the site
      // Only set first-time user flag if this is the initial page load with no specific route
      if (!hasVisitedBefore && window.location.pathname === '/') {
        localStorage.setItem('hasVisitedBefore', 'true');
        setIsFirstTimeUser(true);
      } else {
        setIsFirstTimeUser(false);
      }
      
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
              isFirstTimeUser ? <Navigate to="/register" replace /> : <Home />
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
        <Route 
          path="/profile" 
          element={
            isAuthenticated ? (
              <UserProfile />
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
