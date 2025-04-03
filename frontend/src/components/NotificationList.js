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
  Button
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

  const getToken = () => {
    try {
      const token = localStorage.getItem('token');
      console.log('Token from localStorage:', token ? 'Present' : 'Missing');
      if (token) {
        console.log('Token length:', token.length);
        console.log('Token format check:', token.startsWith('ey') ? 'Valid JWT format' : 'Invalid JWT format');
        // Log first few characters of token (for debugging)
        console.log('Token preview:', token.substring(0, 10) + '...');
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error retrieving token from localStorage:', error);
      return null;
    }
  };

  const fetchNotifications = async () => {
    try {
      const token = getToken();
      if (!token) {
        console.error('No authentication token found');
        setError('Please log in to view notifications');
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      
      console.log('Fetching notifications with token...');
      console.log('Token format check:', cleanToken.substring(0, 10) + '...');
      
      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
        // Removed credentials: 'include' as it can cause issues with JWT
      });

      // Log response details for debugging
      console.log('Notifications response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Fetched notifications:', data.length);
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
        // Clear any previous errors
        setError('');
      } else {
        // Handle response error
        console.error('Error fetching notifications:', response.status);
        
        try {
          const errorData = await response.text();
          console.error('Error response data:', errorData);
          console.error('Error response headers:', Object.fromEntries([...response.headers]));
          
          // Try to parse as JSON if possible
          try {
            const jsonError = JSON.parse(errorData);
            setError(jsonError.detail || `Error ${response.status}: ${response.statusText}`);
          } catch (e) {
            setError(`Error ${response.status}: ${response.statusText}`);
          }
        } catch (e) {
          setError(`Error ${response.status}: ${response.statusText}`);
        }
        
        // If unauthorized, handle token expiration
        if (response.status === 401) {
          console.log('Unauthorized, clearing token');
          localStorage.removeItem('token');
          localStorage.removeItem('userType');
          localStorage.removeItem('userId');
          // Dispatch auth-change event
          window.dispatchEvent(new Event('auth-change'));
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Network error while fetching notifications. Please check your connection.');
    }
  };

  useEffect(() => {
    // Fetch notifications when component mounts and periodically
    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (notificationId) => {
    try {
      const token = getToken();
      if (!token) {
        setError('No authentication token found');
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/${notificationId}/mark_as_read/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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
        setUnreadCount(prev => Math.max(0, prev - 1));
      } else {
        console.error(`Error marking notification ${notificationId} as read: ${response.status}`);
        if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
          localStorage.removeItem('token');
          localStorage.removeItem('userType');
          localStorage.removeItem('userId');
          window.dispatchEvent(new Event('auth-change'));
        }
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

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      console.log(`Accepting ride request ${rideRequestId}`);
      
      // Use the correct URL based on the server configuration
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/accept_match/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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
          
          if (response.status === 401) {
            alert('Your session has expired. Please log in again.');
            localStorage.removeItem('token');
            localStorage.removeItem('userType');
            localStorage.removeItem('userId');
            window.dispatchEvent(new Event('auth-change'));
            return;
          }
        } catch (e) {
          console.error('Could not parse error response:', e);
        }
        
        alert('Failed to accept ride match. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting ride match:', error);
      alert('Network error while accepting ride match');
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
  
  // Function to render notification content based on type
  const renderNotificationContent = (notification) => {
    console.log('Rendering notification content for type:', notification.notification_type);
    
    switch(notification.notification_type) {
      case 'RIDE_MATCH':
        return (
          <>
            <Typography variant="body1" component="div" fontWeight="bold">
              Ride Match Found!
            </Typography>
            <Typography variant="body2" component="div">
              {notification.message}
            </Typography>
            {notification.ride_details && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0, 0, 0, 0.04)', borderRadius: 1 }}>
                <Typography variant="body2">
                  From: {notification.ride_details.start_location}
                </Typography>
                <Typography variant="body2">
                  To: {notification.ride_details.end_location}
                </Typography>
                <Typography variant="body2">
                  Departure: {formatDate(notification.ride_details.departure_time)}
                </Typography>
              </Box>
            )}
          </>
        );
        
      case 'RIDE_PENDING':
        return (
          <>
            <Typography variant="body1" component="div" fontWeight="bold" color="info.main">
              Ride Request Saved
            </Typography>
            <Typography variant="body2" component="div">
              {notification.message}
            </Typography>
            <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0, 100, 255, 0.04)', borderRadius: 1 }}>
              <Typography variant="body2" color="info.main">
                We'll notify you when a matching ride is found!
              </Typography>
            </Box>
          </>
        );
        
      case 'RIDE_ACCEPTED':
        return (
          <>
            <Typography variant="body1" component="div" fontWeight="bold" color="success.main">
              Ride Accepted
            </Typography>
            <Typography variant="body2" component="div">
              {notification.message}
            </Typography>
          </>
        );
        
      case 'RIDE_COMPLETED':
        return (
          <>
            <Typography variant="body1" component="div" fontWeight="bold" color="success.main">
              Ride Completed
            </Typography>
            <Typography variant="body2" component="div">
              {notification.message}
            </Typography>
          </>
        );
        
      default:
        return (
          <Typography variant="body1" component="div">
            {notification.message}
          </Typography>
        );
    }
  };

  return (
    <div style={{ display: 'inline-block', marginLeft: '10px' }}>
      <IconButton 
        ref={buttonRef}
        color="inherit" 
        onClick={handleClick}
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
              width: 400,
              maxHeight: 500,
              overflow: 'auto',
              mt: 1,
              '@media (max-width: 600px)': {
                width: '300px',
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
            notifications.map((notification) => {
              // Determine background color based on notification type
              let bgColor = notification.is_read ? 'inherit' : 'action.hover';
              if (notification.notification_type === 'RIDE_PENDING') {
                bgColor = notification.is_read ? 'rgba(0, 100, 255, 0.05)' : 'rgba(0, 100, 255, 0.1)';
              } else if (notification.notification_type === 'RIDE_MATCH') {
                bgColor = notification.is_read ? 'rgba(0, 200, 0, 0.05)' : 'rgba(0, 200, 0, 0.1)';
              }
              
              return (
                <ListItem
                  key={notification.id}
                  sx={{
                    bgcolor: bgColor,
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
                        renderNotificationContent(notification)
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
                  {renderAcceptButton(notification)}
                </ListItem>
              );
            })
          )}
        </List>
      </Popover>
    </div>
  );
}

export default NotificationList; 