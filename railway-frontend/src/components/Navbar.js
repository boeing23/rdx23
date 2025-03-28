import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Button, Typography, Box, Badge } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import NotificationList from './NotificationList';

function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUserType = localStorage.getItem('userType');
    
    console.log('Navbar - Initial state:');
    console.log('  Token exists:', !!token);
    console.log('  Stored user type:', storedUserType);
    
    if (token) {
      setIsAuthenticated(true);
      if (storedUserType) {
        try {
          const parsedUserType = JSON.parse(storedUserType);
          console.log('  Parsed user type:', parsedUserType);
          setUserType(parsedUserType);
        } catch (e) {
          console.log('  Error parsing user type:', e);
          // If parsing fails, try using the raw value
          const rawUserType = storedUserType.replace(/"/g, ''); // Remove any quotes
          console.log('  Using raw user type:', rawUserType);
          setUserType(rawUserType);
        }
      } else {
        console.log('  No user type found in localStorage');
        setUserType(null);
      }
    }
  }, []);

  const handleLogout = () => {
    console.log('Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    setIsAuthenticated(false);
    setUserType(null);
    navigate('/');
  };

  console.log('Navbar - Current state:');
  console.log('  isAuthenticated:', isAuthenticated);
  console.log('  userType:', userType);

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography 
          variant="h6" 
          component={Link} 
          to="/" 
          sx={{ 
            flexGrow: 1, 
            textDecoration: 'none', 
            color: 'white' 
          }}
        >
          RideX
        </Typography>
        {isAuthenticated ? (
          <>
            {userType === 'DRIVER' ? (
              <Button color="inherit" component={Link} to="/offer">
                Offer Ride
              </Button>
            ) : userType === 'RIDER' ? (
              <Button color="inherit" component={Link} to="/request-ride">
                Find Rides
              </Button>
            ) : null}
            <Button
              color="inherit"
              component={Link}
              to="/rides"
              sx={{ mr: 2 }}
            >
              Rides
            </Button>
            <Button
              color="inherit"
              component={Link}
              to="/accepted-rides"
              sx={{ mr: 2 }}
            >
              My Trips
            </Button>
            <NotificationList />
            <Button color="inherit" onClick={handleLogout}>
              Logout
            </Button>
          </>
        ) : (
          <>
            <Button color="inherit" component={Link} to="/login">
              Login
            </Button>
            <Button color="inherit" component={Link} to="/register">
              Register
            </Button>
          </>
        )}
      </Toolbar>
    </AppBar>
  );
}

export default Navbar; 