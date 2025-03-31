import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Button, Typography, Box, IconButton, Menu, MenuItem, useTheme, useMediaQuery, Avatar } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCar } from '@fortawesome/free-solid-svg-icons';
import NotificationList from './NotificationList';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';

function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState(null);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    setIsAuthenticated(false);
    setUserType(null);
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
          <MenuItem component={Link} to="/notifications" onClick={handleMobileMenuClose}>
            Notifications
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
    <AppBar position="static" sx={{ bgcolor: '#800000' }}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
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
            ChalBe
          </Typography>
        </Box>

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
              <IconButton 
                color="inherit" 
                onClick={handleSettingsMenuOpen}
                sx={{ ml: 2 }}
              >
                <SettingsIcon />
              </IconButton>
              {renderSettingsMenu()}
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
          onClick={handleMobileMenuOpen}
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