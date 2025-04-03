import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Button, Typography, Box, IconButton, Menu, MenuItem, useTheme, useMediaQuery, Avatar, Badge } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCar } from '@fortawesome/free-solid-svg-icons';
import NotificationList from './NotificationList';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useAuth } from '../contexts/AuthContext';

function Navbar() {
  const { authState, logout } = useAuth();
  const { isAuthenticated, user } = authState;
  const userType = user?.user_type;
  
  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState(null);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Log auth state for debugging
  useEffect(() => {
    console.log('Navbar auth state:', { 
      isAuthenticated, 
      userType,
      user,
      token: authState.token ? 'exists' : 'missing'
    });
    
    // This check helps detect if localStorage and authState are in sync
    const tokenInStorage = localStorage.getItem('token');
    console.log('Token comparison:', {
      authStateHasToken: !!authState.token,
      localStorageHasToken: !!tokenInStorage,
      inSync: !!authState.token === !!tokenInStorage
    });
  }, [isAuthenticated, userType, user, authState.token]);

  // For fallback/compatibility - check localStorage directly
  useEffect(() => {
    if (!isAuthenticated) {
      const token = localStorage.getItem('token');
      console.log('Navbar fallback check - token exists:', !!token);
    }
  }, [isAuthenticated]);

  // Setup sync with NotificationList component
  useEffect(() => {
    // Create global object for syncing if it doesn't exist
    if (!window.navbarSync) {
      window.navbarSync = {};
    }
    
    // Add method to update unread count from NotificationList
    window.navbarSync.setNavbarUnreadCount = (count) => {
      if (typeof count === 'number') {
        setUnreadCount(count);
      }
    };
    
    return () => {
      // Clean up global object
      if (window.navbarSync) {
        delete window.navbarSync.setNavbarUnreadCount;
      }
    };
  }, []);

  // Improve userType handling for consistency
  useEffect(() => {
    // Determine actual user type combining authState and localStorage
    let effectiveUserType = userType;
    
    // If no user type from authState, try to get from localStorage as backup
    if (!effectiveUserType) {
      try {
        const storedType = localStorage.getItem('userType');
        if (storedType) {
          if (storedType === "[object Object]") {
            console.warn("Found invalid userType in localStorage");
            effectiveUserType = "RIDER"; // Default fallback
          } else {
            try {
              effectiveUserType = JSON.parse(storedType);
            } catch (e) {
              console.warn("Error parsing userType from localStorage:", e);
              effectiveUserType = storedType;
            }
          }
        }
      } catch (e) {
        console.error('Error processing localStorage userType:', e);
      }
    }
    
    console.log('Navbar determined user type:', effectiveUserType);
    
    // This is a good place to fix incorrect localStorage values if needed
    if (isAuthenticated && userType && localStorage.getItem('userType') !== JSON.stringify(userType)) {
      console.log('Fixing inconsistent userType in localStorage');
      localStorage.setItem('userType', JSON.stringify(userType));
    }
  }, [isAuthenticated, userType]);

  const handleMobileMenuOpen = (event) => {
    setMobileMenuAnchorEl(event.currentTarget);
  };

  const handleMobileMenuClose = () => {
    setMobileMenuAnchorEl(null);
  };

  const handleSettingsMenuOpen = (event) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsMenuClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleSettingsMenuClose();
    handleMobileMenuClose();
    navigate('/login');
  };

  const renderMobileMenu = () => (
    <Menu
      anchorEl={mobileMenuAnchorEl}
      open={Boolean(mobileMenuAnchorEl)}
      onClose={handleMobileMenuClose}
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
            <MenuItem component={Link} to="/offer" onClick={handleMobileMenuClose}>
              Offer Ride
            </MenuItem>
          ) : userType === 'RIDER' ? (
            <MenuItem component={Link} to="/request-ride" onClick={handleMobileMenuClose}>
              Find Rides
            </MenuItem>
          ) : null}
          <MenuItem component={Link} to="/rides" onClick={handleMobileMenuClose}>
            Rides
          </MenuItem>
          <MenuItem component={Link} to="/accepted-rides" onClick={handleMobileMenuClose}>
            My Trips
          </MenuItem>
          <MenuItem onClick={(e) => {
            handleMobileMenuClose();
            // Instead of navigating, find and click the notification button
            const notificationButton = document.getElementById('notification-button');
            if (notificationButton) {
              notificationButton.click();
            } else {
              // Fallback if button not found
              const event = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              document.querySelector('[aria-label="notifications"]')?.dispatchEvent(event);
            }
          }}>
            <NotificationsIcon sx={{ mr: 1, fontSize: 20 }} />
            Notifications
            {unreadCount > 0 && (
              <Box 
                component="span" 
                sx={{ 
                  ml: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'error.main',
                  color: 'white',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  fontSize: 12,
                }}
              >
                {unreadCount}
              </Box>
            )}
          </MenuItem>
          <MenuItem component={Link} to="/profile" onClick={handleMobileMenuClose}>
            <AccountCircleIcon sx={{ mr: 1, fontSize: 20 }} />
            Profile
          </MenuItem>
          <MenuItem onClick={handleLogout}>
            <ExitToAppIcon sx={{ mr: 1, fontSize: 20 }} />
            Logout
          </MenuItem>
        </>
      ) : (
        <>
          <MenuItem component={Link} to="/login" onClick={handleMobileMenuClose}>
            Login
          </MenuItem>
          <MenuItem component={Link} to="/register" onClick={handleMobileMenuClose}>
            Register
          </MenuItem>
        </>
      )}
    </Menu>
  );

  const renderSettingsMenu = () => (
    <Menu
      anchorEl={settingsAnchorEl}
      open={Boolean(settingsAnchorEl)}
      onClose={handleSettingsMenuClose}
      PaperProps={{
        sx: {
          mt: 1.5,
          minWidth: 150,
        },
      }}
    >
      <MenuItem component={Link} to="/profile" onClick={handleSettingsMenuClose}>
        <AccountCircleIcon sx={{ mr: 1, fontSize: 20 }} />
        Profile
      </MenuItem>
      <MenuItem onClick={handleLogout}>
        <ExitToAppIcon sx={{ mr: 1, fontSize: 20 }} />
        Logout
      </MenuItem>
    </Menu>
  );

  return (
    <AppBar position="static" sx={{ bgcolor: '#861F41' }}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
        {/* Logo and Brand Name */}
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FontAwesomeIcon 
            icon={faCar} 
            style={{ 
              color: 'white',
              marginRight: '8px',
              fontSize: '1.5rem'
            }}
          />
          <Typography 
            variant="h6" 
            component={Link} 
            to={isAuthenticated ? (userType === 'DRIVER' ? '/offer' : '/rides') : '/'}
            sx={{ 
              textDecoration: 'none', 
              color: 'white',
              fontWeight: 'bold'
            }}
            onClick={(e) => {
              if (!isAuthenticated) {
                e.preventDefault();
                navigate('/');
              }
            }}
          >
            ChalBeyy
          </Typography>
        </Box>

        {/* Desktop Menu */}
        <Box sx={{ 
          display: { xs: 'none', sm: 'flex' }, 
          alignItems: 'center', 
          gap: 1.5,
          flexGrow: 0,
          height: '64px'
        }}>
          {isAuthenticated ? (
            <>
              {userType === 'DRIVER' ? (
                <Button 
                  color="inherit" 
                  component={Link} 
                  to="/offer"
                  sx={{ minHeight: '40px' }}
                >
                  Offer Ride
                </Button>
              ) : userType === 'RIDER' ? (
                <>
                  <Button 
                    color="inherit" 
                    component={Link} 
                    to="/request-ride"
                    sx={{ minHeight: '40px' }}
                  >
                    Find Rides
                  </Button>
                  <Button 
                    color="inherit" 
                    component={Link} 
                    to="/rides"
                    sx={{ minHeight: '40px' }}
                  >
                    Rides
                  </Button>
                </>
              ) : null}
              <Button 
                color="inherit" 
                component={Link} 
                to="/accepted-rides"
                sx={{ minHeight: '40px' }}
              >
                My Trips
              </Button>
              <Box sx={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                <NotificationList />
              </Box>
              <IconButton
                color="inherit"
                onClick={handleSettingsMenuOpen}
                sx={{ height: '40px', width: '40px' }}
              >
                <SettingsIcon />
              </IconButton>
            </>
          ) : (
            <>
              <Button 
                color="inherit" 
                component={Link} 
                to="/login"
                sx={{ minHeight: '40px' }}
              >
                Login
              </Button>
              <Button 
                color="inherit" 
                component={Link} 
                to="/register"
                sx={{ minHeight: '40px' }}
              >
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
          onClick={handleMobileMenuOpen}
          sx={{ display: { sm: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
      </Toolbar>
      {renderMobileMenu()}
      {renderSettingsMenu()}
    </AppBar>
  );
}

export default Navbar; 