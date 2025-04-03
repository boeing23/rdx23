import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  // Check auth status on component mount
  useEffect(() => {
    console.log('Navbar - Initial auth check on mount');
    checkAuthStatus();
    
    // Force a re-check every time the component renders
    const interval = setInterval(() => {
      checkAuthStatus();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Function to check authentication status
  const checkAuthStatus = () => {
    const token = localStorage.getItem('token');
    const type = localStorage.getItem('userType');
    
    // Log for debugging
    console.log('Navbar auth check:', {
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      userType: type,
      path: location.pathname
    });
    
    // Set authentication state based on token presence
    const isAuth = !!token;
    if (isAuth !== isAuthenticated) {
      console.log('Updating authentication state:', isAuth);
      setIsAuthenticated(isAuth);
    }
    
    // Parse userType if it's stringified
    let parsedType = type;
    if (type && (type.startsWith('"') || type.includes('{'))) {
      try {
        parsedType = JSON.parse(type);
        console.log('Parsed userType from JSON:', parsedType);
      } catch (e) {
        console.error('Failed to parse userType:', e);
      }
    }
    
    // Update userType if changed
    if (parsedType !== userType) {
      console.log('Updating userType:', parsedType);
      setUserType(parsedType);
    }
  };

  // Add an event listener for storage changes and auth events
  useEffect(() => {
    // This will detect if localStorage changes in another tab/window
    const handleStorageChange = () => {
      console.log('Storage change detected');
      checkAuthStatus();
    };

    // Listen for custom auth change events
    const handleAuthChange = () => {
      console.log('Auth change event detected');
      checkAuthStatus();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('auth-change', handleAuthChange);
    
    // Clean up the event listeners
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  // Also recheck auth status when location changes
  useEffect(() => {
    console.log('Location changed to:', location.pathname);
    checkAuthStatus();
  }, [location.pathname]);

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
    localStorage.removeItem('userId');
    setIsAuthenticated(false);
    setUserType(null);
    navigate('/login');
  };

  // For debugging
  console.log('Navbar render state:', { isAuthenticated, userType });

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