import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Button, Typography, Box, IconButton, Menu, MenuItem, useTheme, useMediaQuery } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCar } from '@fortawesome/free-solid-svg-icons';
import NotificationList from './NotificationList';

function Navbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    const type = localStorage.getItem('userType');
    setIsAuthenticated(!!token);
    setUserType(type);
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
            to="/" 
            sx={{ 
              textDecoration: 'none', 
              color: 'white',
              fontWeight: 'bold'
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