import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, IconButton, Menu, MenuItem, Box } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationList from './NotificationList';

function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = () => {
      const token = localStorage.getItem('token');
      const type = localStorage.getItem('userType');
      
      console.log('Navbar initialization:', {
        hasToken: !!token,
        rawUserType: type,
        isAuthenticated: !!token
      });
      
      setIsAuthenticated(!!token);
      if (type) {
        try {
          const parsedType = JSON.parse(type);
          console.log('Parsed user type:', parsedType);
          setUserType(parsedType);
        } catch (e) {
          console.error('Error parsing user type:', e);
          console.log('Using raw user type:', type);
          setUserType(type);
        }
      }
    };

    initializeAuth();
  }, []);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    setIsAuthenticated(false);
    setUserType(null);
    navigate('/login');
  };

  const renderMobileMenu = () => (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={handleClose}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 200,
        },
      }}
    >
      {isAuthenticated ? (
        <>
          {userType === 'DRIVER' ? (
            <MenuItem component={Link} to="/offer" onClick={handleClose}>
              Offer Ride
            </MenuItem>
          ) : userType === 'RIDER' ? (
            <MenuItem component={Link} to="/request-ride" onClick={handleClose}>
              Find Rides
            </MenuItem>
          ) : null}
          <MenuItem component={Link} to="/rides" onClick={handleClose}>
            Rides
          </MenuItem>
          <MenuItem component={Link} to="/accepted-rides" onClick={handleClose}>
            My Trips
          </MenuItem>
          <MenuItem component={Link} to="/notifications" onClick={handleClose}>
            Notifications
          </MenuItem>
          <MenuItem onClick={() => { handleLogout(); handleClose(); }}>
            Logout
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem component={Link} to="/login" onClick={handleClose}>
            Login
          </MenuItem>
          <MenuItem component={Link} to="/register" onClick={handleClose}>
            Register
          </MenuItem>
        </>
      )}
    </Menu>
  );

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
          ChalBe
        </Typography>

        {/* Desktop Menu */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
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
        </Box>

        {/* Mobile Menu Button */}
        <IconButton
          edge="end"
          color="inherit"
          aria-label="menu"
          onClick={handleMenu}
          sx={{ display: { sm: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
      </Toolbar>
      {renderMobileMenu()}
    </AppBar>
  );
}

export default Navbar; 