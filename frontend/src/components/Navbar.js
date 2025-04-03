import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Button, 
  IconButton, 
  Menu, 
  MenuItem, 
  Box, 
  Divider,
  Avatar
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircle from '@mui/icons-material/AccountCircle';
import NotificationList from './NotificationList';

function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [mobileAnchorEl, setMobileAnchorEl] = useState(null);
  const [profileAnchorEl, setProfileAnchorEl] = useState(null);
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
        console.log('Using user type as plain string:', type);
        setUserType(type);
      }
    };

    initializeAuth();
  }, []);

  const handleMobileMenu = (event) => {
    setMobileAnchorEl(event.currentTarget);
  };

  const handleProfileMenu = (event) => {
    setProfileAnchorEl(event.currentTarget);
  };

  const handleMobileClose = () => {
    setMobileAnchorEl(null);
  };

  const handleProfileClose = () => {
    setProfileAnchorEl(null);
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
      anchorEl={mobileAnchorEl}
      open={Boolean(mobileAnchorEl)}
      onClose={handleMobileClose}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 200,
        },
      }}
    >
      {isAuthenticated ? (
        <>
          <MenuItem component={Link} to="/accepted-rides" onClick={handleMobileClose}>
            My Trips
          </MenuItem>
          <MenuItem component={Link} to="/rides" onClick={handleMobileClose}>
            Rides
          </MenuItem>
          <MenuItem component={Link} to="/request-ride" onClick={handleMobileClose}>
            Request a Ride
          </MenuItem>
          <MenuItem component={Link} to="/notifications" onClick={handleMobileClose}>
            Notifications
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleProfileMenu}>
            Profile
          </MenuItem>
          <MenuItem onClick={() => { handleLogout(); handleMobileClose(); }}>
            Logout
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem component={Link} to="/login" onClick={handleMobileClose}>
            Login
          </MenuItem>
          <MenuItem component={Link} to="/register" onClick={handleMobileClose}>
            Register
          </MenuItem>
        </>
      )}
    </Menu>
  );

  const renderProfileMenu = () => (
    <Menu
      id="profile-menu"
      anchorEl={profileAnchorEl}
      open={Boolean(profileAnchorEl)}
      onClose={handleProfileClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
    >
      {userType === 'DRIVER' && (
        <MenuItem component={Link} to="/update-driver-profile" onClick={handleProfileClose}>
          Update Profile
        </MenuItem>
      )}
      <MenuItem onClick={() => { handleLogout(); handleProfileClose(); }}>
        Logout
      </MenuItem>
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
            color: 'white',
            fontWeight: 'bold'
          }}
        >
          ChalBe
        </Typography>

        {/* Desktop Menu */}
        <Box sx={{ 
          display: { xs: 'none', md: 'flex' }, 
          alignItems: 'center',
          gap: 2
        }}>
          {isAuthenticated ? (
            <>
              <Button
                color="inherit"
                component={Link}
                to="/accepted-rides"
              >
                My Trips
              </Button>
              <Button
                color="inherit"
                component={Link}
                to="/rides"
              >
                Rides
              </Button>
              <Button
                color="inherit"
                component={Link}
                to="/request-ride"
              >
                Request a Ride
              </Button>
              <NotificationList />
              <IconButton
                size="large"
                edge="end"
                aria-label="account of current user"
                aria-controls="profile-menu"
                aria-haspopup="true"
                onClick={handleProfileMenu}
                color="inherit"
              >
                <AccountCircle />
              </IconButton>
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
          onClick={handleMobileMenu}
          sx={{ display: { md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>

        {/* Menus */}
        {renderMobileMenu()}
        {renderProfileMenu()}
      </Toolbar>
    </AppBar>
  );
}

export default Navbar; 