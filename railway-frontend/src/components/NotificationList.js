import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  Badge,
  Divider,
  Popover,
  Button,
  Container,
  Alert,
  Paper
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import { API_BASE_URL } from '../config';

function NotificationList() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const buttonRef = useRef(null);
  const open = Boolean(anchorEl);

  // Get the Navbar's setUnreadCount function if available
  const syncUnreadCount = (count) => {
    // If navbar has a way to sync the count, use it
    if (window.navbarSync && typeof window.navbarSync.setNavbarUnreadCount === 'function') {
      window.navbarSync.setNavbarUnreadCount(count);
    }
  };

  const getToken = () => {
    try {
      const token = localStorage.getItem('token');
      return token;
    } catch (error) {
      console.error('Error getting token from localStorage:', error);
      return null;
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = getToken();
      if (!token) {
        setError('No authentication token found');
        return;
      }

      // Clean the token - remove any quotes or spaces
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Fetched notifications:', data.length);
        setNotifications(data);
        const count = data.filter(n => !n.is_read).length;
        setUnreadCount(count);
        syncUnreadCount(count);
        
        const rideMatches = data.filter(n => n.notification_type === 'RIDE_MATCH');
        if (rideMatches.length > 0) {
          console.log(`Found ${rideMatches.length} ride match notifications`);
          console.log('Sample ride match:', rideMatches[0]);
        }
      } else {
        // Better error handling
        let errorMessage = 'Failed to fetch notifications';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.detail || errorMessage;
        } catch (e) {
          // If can't parse JSON, use status text
          errorMessage = `${errorMessage}: ${response.statusText}`;
        }
        
        console.error('Error response status:', response.status, errorMessage);
        setError(errorMessage);
        
        // Handle token expiration
        if (response.status === 401) {
          console.log('Token may be expired, clearing session');
          localStorage.removeItem('token');
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Network error while fetching notifications');
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    
    // Setup global access for Navbar syncing
    if (!window.navbarSync) {
      window.navbarSync = {};
    }
    window.navbarSync.setUnreadCount = (count) => {
      if (typeof count === 'number') {
        setUnreadCount(count);
      }
    };
    
    return () => {
      clearInterval(interval);
      // Clean up global access
      if (window.navbarSync) {
        delete window.navbarSync.setUnreadCount;
      }
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkAsRead = async (notificationId) => {
    try {
      const token = getToken();
      if (!token) {
        setError('No authentication token found');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/${notificationId}/mark_as_read/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Update the notification in the list
        setNotifications(prevNotifications =>
          prevNotifications.map(notification =>
            notification.id === notificationId
              ? { ...notification, is_read: true }
              : notification
          )
        );
        const newCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newCount);
        syncUnreadCount(newCount);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error marking notification as read:', errorData.message || 'Failed to mark as read');
      }
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };
  
  // New function to accept a ride match
  const handleAcceptRideMatch = async (rideRequestId) => {
    try {
      const token = getToken();
      if (!token) {
        alert('Please log in to accept rides');
        return;
      }

      console.log(`Accepting ride request ${rideRequestId}`);
      
      // Use the correct URL based on the server configuration
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/accept_match/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Refresh notifications after accepting
        fetchNotifications();
        alert('Ride match accepted successfully!');
      } else {
        console.error('Error response status:', response.status);
        console.error('Error response URL:', response.url);
        
        // Log more details about the response for debugging
        try {
          const errorText = await response.text();
          console.error('Error response body:', errorText);
        } catch (e) {
          console.error('Could not parse error response:', e);
        }
        
        alert('Failed to accept ride match. Please check the console for details.');
      }
    } catch (error) {
      console.error('Error accepting ride match:', error);
      alert('Network error while accepting ride match');
    }
  };

  const formatDateTime = (dateString) => {
    try {
      // Create a formatter with EDT timezone specification
      const date = new Date(dateString);
      // Format as MM/DD/YYYY, HH:MM:SS AM/PM EDT
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short'
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };
  
  // Add handleViewRide function to fix the no-undef error
  const handleViewRide = (rideId) => {
    console.log(`Viewing ride details for ride ${rideId}`);
    // Close the notification popover
    handleClose();
    // Navigate to the ride details page
    window.location.href = `/rides/${rideId}`;
  };
  
  // Function to render accept button for ride match notifications
  const renderAcceptButton = (notification) => {
    console.log('Checking notification for Accept button:', notification.id, notification.notification_type);
    
    // Check if notification is a ride match notification and has ride_request data
    if (notification.notification_type === 'RIDE_MATCH') {
      console.log('Found RIDE_MATCH notification:', notification.id);
      
      if (notification.ride_request) {
        console.log(`Rendering Accept button for ride request ${notification.ride_request}`);
        return (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<DirectionsCarIcon />}
            onClick={() => handleAcceptRideMatch(notification.ride_request)}
            sx={{ ml: 1, mt: 1 }}
          >
            Accept Ride
          </Button>
        );
      } else {
        console.warn('RIDE_MATCH notification missing ride_request data:', notification);
      }
    }
    return null;
  };

  // Function to render ride match details for better readability
  const renderRideMatchDetails = (notification) => {
    if (notification.notification_type !== 'RIDE_MATCH' || !notification.ride_details) {
      return null;
    }

    const driver = notification.sender;
    const ride = notification.ride_details;
    const vehicle = notification.sender_vehicle;
    const dropoffInfo = notification.ride_request && notification.ride_request.nearest_dropoff_info;
    
    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
          Ride Match Found!
        </Typography>
        
        {/* Driver Details */}
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
          Driver Details
        </Typography>
        <Typography variant="body2">
          Name: {driver ? `${driver.name}` : 'Unknown'}<br />
          Email: {notification.sender_email || 'Not available'}<br />
          Phone: {notification.sender_phone || 'Not available'}
        </Typography>
        
        {/* Vehicle Details */}
        {vehicle && (
          <>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
              Vehicle Details
            </Typography>
            <Typography variant="body2">
              {vehicle.year || ''} {vehicle.make || ''} {vehicle.model || ''}<br />
              Color: {vehicle.color || 'Not specified'}<br />
              License Plate: {vehicle.plate || 'Not specified'}<br />
              {ride && ride.available_seats && <span>Available Seats: {ride.available_seats}</span>}
            </Typography>
          </>
        )}
        
        {/* Ride Details */}
        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 1 }}>
          Ride Details
        </Typography>
        <Typography variant="body2">
          From: {ride ? ride.start_location : 'Not specified'}<br />
          To: {ride ? ride.end_location : 'Not specified'}<br />
          {dropoffInfo && (
            <span>Rider Dropoff: {dropoffInfo.address || 'Near destination'}<br /></span>
          )}
          Departure: {ride ? formatDateTime(ride.departure_time) : 'Not specified'}
        </Typography>
      </Box>
    );
  };

  const renderNotificationContent = (notification) => {
    switch (notification.notification_type) {
      case 'RIDE_MATCH':
        const rideDetails = notification.ride_details;
        const formattedTime = rideDetails?.formatted_departure_time || 'Unknown time';
        const dropoffInfo = rideDetails?.nearest_dropoff_info?.address || 'Near your destination';
        
        return (
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
              {notification.message}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>Driver:</strong> {notification.sender_details?.username || 'Unknown'}
            </Typography>
            {notification.sender_details?.phone_number && (
              <Typography variant="body2">
                <strong>Phone:</strong> {notification.sender_details.phone_number}
              </Typography>
            )}
            <Typography variant="body2">
              <strong>Dropoff:</strong> {dropoffInfo}
            </Typography>
            <Typography variant="body2">
              <strong>Departure:</strong> {formattedTime}
            </Typography>
            {notification.ride_details && (
              <Button 
                variant="contained" 
                size="small" 
                sx={{ mt: 1, borderRadius: '8px' }}
                onClick={() => handleViewRide(notification.ride_details.id)}
              >
                View Details
              </Button>
            )}
          </Box>
        );
      default:
        return (
          <Typography variant="body1">
            {notification.message}
          </Typography>
        );
    }
  };

  return (
    <>
      {window.location.pathname === '/notifications' && (
        <Container maxWidth="md" sx={{ mt: 4 }}>
          <Typography variant="h4" className="page-title" gutterBottom sx={{ mb: 3 }}>
            Notifications
          </Typography>
          
          {error ? (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>
          ) : notifications.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2, mb: 2 }}>You have no notifications</Alert>
          ) : (
            <Paper elevation={2} sx={{ borderRadius: '12px', overflow: 'hidden' }}>
              <List sx={{ p: 0 }}>
                {notifications.map((notification) => (
                  <ListItem
                    key={notification.id}
                    sx={{
                      bgcolor: notification.is_read ? 'inherit' : 'action.hover',
                      '&:hover': { bgcolor: 'action.selected' },
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      py: 2,
                      borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <Box sx={{ display: 'flex', width: '100%' }}>
                      <ListItemText
                        primary={
                          <Typography variant="body1" component="div">
                            {renderNotificationContent(notification)}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(notification.created_at)}
                          </Typography>
                        }
                        sx={{ 
                          flex: 1,
                          '& .MuiListItemText-primary': {
                            mb: 0.5
                          }
                        }}
                      />
                      {!notification.is_read && (
                        <IconButton
                          size="small"
                          onClick={() => handleMarkAsRead(notification.id)}
                          sx={{ ml: 1 }}
                        >
                          <CheckCircleIcon color="primary" />
                        </IconButton>
                      )}
                    </Box>
                    
                    {/* Add ride match details */}
                    {notification.notification_type === 'RIDE_MATCH' && renderRideMatchDetails(notification)}
                    
                    {renderAcceptButton(notification)}
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Container>
      )}
      <div style={{ display: 'inline-block' }}>
        <IconButton 
          id="notification-button"
          ref={buttonRef}
          color="inherit" 
          onClick={handleClick}
          aria-label="notifications"
          sx={{ 
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          slotProps={{
            paper: {
              elevation: 4,
              sx: {
                width: { xs: '90vw', sm: 400 },
                maxHeight: { xs: '70vh', sm: 500 },
                overflow: 'auto',
                mt: 1,
                '@media (max-width: 600px)': {
                  left: '5% !important',
                  right: '5% !important',
                  maxWidth: '90% !important',
                  margin: '0 auto'
                }
              }
            }
          }}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          <Box sx={{ 
            p: 2, 
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="h6">Notifications</Typography>
            {unreadCount > 0 && (
              <Typography variant="body2">
                {unreadCount} unread
              </Typography>
            )}
          </Box>
          <Divider />
          <List sx={{ p: 0 }}>
            {error ? (
              <ListItem>
                <ListItemText 
                  primary={error}
                  sx={{ textAlign: 'center', color: 'error.main' }}
                />
              </ListItem>
            ) : notifications.length === 0 ? (
              <ListItem>
                <ListItemText 
                  primary="No notifications" 
                  sx={{ textAlign: 'center' }}
                />
              </ListItem>
            ) : (
              notifications.map((notification) => (
                <ListItem
                  key={notification.id}
                  sx={{
                    bgcolor: notification.is_read ? 'inherit' : 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    py: 2
                  }}
                >
                  <Box sx={{ display: 'flex', width: '100%' }}>
                    <ListItemText
                      primary={
                        <Typography variant="body1" component="div">
                          {renderNotificationContent(notification)}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(notification.created_at)}
                        </Typography>
                      }
                      sx={{ 
                        flex: 1,
                        '& .MuiListItemText-primary': {
                          mb: 0.5
                        }
                      }}
                    />
                    {!notification.is_read && (
                      <IconButton
                        size="small"
                        onClick={() => handleMarkAsRead(notification.id)}
                        sx={{ ml: 1 }}
                      >
                        <CheckCircleIcon color="primary" />
                      </IconButton>
                    )}
                  </Box>
                  
                  {/* Add ride match details */}
                  {notification.notification_type === 'RIDE_MATCH' && renderRideMatchDetails(notification)}
                  
                  {renderAcceptButton(notification)}
                </ListItem>
              ))
            )}
          </List>
        </Popover>
      </div>
    </>
  );
}

export default NotificationList; 