import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  const getToken = useCallback(() => {
    try {
      const token = localStorage.getItem('token');
      console.log('Token from localStorage:', token ? 'Present' : 'Missing');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      console.log('Token length:', token.length);
      console.log('Token format check:', token.startsWith('ey') ? 'Valid JWT format' : 'Invalid JWT format');
      // Log first few characters of token (for debugging)
      console.log('Token preview:', token.substring(0, 10) + '...');
      
      // Clean token format
      return token.trim().replace(/^["'](.*)["']$/, '$1');
    } catch (error) {
      console.error('Error retrieving token from localStorage:', error);
      throw error;
    }
  }, []);

  const completePastRides = useCallback(async () => {
    console.log('NotificationList - Checking for past rides to complete');
    try {
      const cleanToken = getToken();
      
      // Call the endpoint to complete past rides
      const response = await fetch(`${API_BASE_URL}/api/rides/rides/complete_past_rides/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('NotificationList - Past rides completion check:', data);
      }
    } catch (err) {
      console.error('NotificationList - Error completing past rides:', err);
      // Don't show this error to the user, just log it
    }
  }, [getToken]);

  const fetchNotifications = useCallback(async () => {
    try {
      // First check for past rides
      await completePastRides();
      
      const cleanToken = getToken();
      
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
      if (err.message === 'No authentication token found') {
        setError('Please log in to view notifications');
      } else {
        setError('Network error while fetching notifications. Please check your connection.');
      }
    }
  }, [getToken, completePastRides]);

  useEffect(() => {
    // Fetch notifications when component mounts and periodically
    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = useCallback(async (notificationId) => {
    try {
      const cleanToken = getToken();

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
      setError('Failed to mark notification as read');
    }
  }, [getToken]);
  
  // Function to accept a ride match
  const handleAcceptRideMatch = useCallback(async (rideRequestId) => {
    try {
      const cleanToken = getToken();
      
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
          
          alert('Failed to accept ride match. Please try again later.');
        } catch (e) {
          console.error('Could not parse error response:', e);
          alert('Failed to accept ride match. Please try again later.');
        }
      }
    } catch (err) {
      console.error('Error accepting ride match:', err);
      alert(err.message || 'Error accepting ride match');
    }
  }, [getToken, fetchNotifications]);

  const formatDate = useCallback((dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  }, []);

  const handleClick = useCallback((event) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const renderAcceptButton = useCallback((notification) => {
    // Only show accept button for ride match notifications that haven't been acted upon
    if (notification.notification_type === 'RIDE_MATCH' && !notification.action_taken) {
      const matchData = notification.data || {};
      const rideRequestId = matchData.ride_request_id;
      
      if (rideRequestId) {
        return (
          <Box mt={1} display="flex" justifyContent="flex-end">
            <Button 
              variant="contained" 
              color="primary" 
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleAcceptRideMatch(rideRequestId);
              }}
            >
              Accept Match
            </Button>
          </Box>
        );
      }
    }
    return null;
  }, [handleAcceptRideMatch]);

  const renderNotificationContent = useCallback((notification) => {
    // Helper function to render notification content based on type
    switch (notification.notification_type) {
      case 'RIDE_MATCH':
        return (
          <>
            <Box display="flex" alignItems="center">
              <DirectionsCarIcon color="primary" style={{ marginRight: 8 }} />
              <Typography variant="body1">
                {notification.message}
              </Typography>
            </Box>
            <Typography variant="caption" color="textSecondary">
              {formatDate(notification.created_at)}
            </Typography>
            {renderAcceptButton(notification)}
          </>
        );
      
      case 'RIDE_REQUEST_ACCEPTED':
        return (
          <>
            <Box display="flex" alignItems="center">
              <CheckCircleIcon color="success" style={{ marginRight: 8 }} />
              <Typography variant="body1">
                {notification.message}
              </Typography>
            </Box>
            <Typography variant="caption" color="textSecondary">
              {formatDate(notification.created_at)}
            </Typography>
          </>
        );
      
      default:
        return (
          <>
            <Typography variant="body1">
              {notification.message}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {formatDate(notification.created_at)}
            </Typography>
          </>
        );
    }
  }, [formatDate, renderAcceptButton]);

  // Helper function to get notification item style based on read status
  const getNotificationStyle = useCallback((isRead) => {
    return {
      backgroundColor: isRead ? 'transparent' : 'rgba(66, 165, 245, 0.1)',
      borderLeft: isRead ? 'none' : '3px solid #42a5f5',
      padding: '8px 16px',
      transition: 'background-color 0.3s',
      '&:hover': {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
      }
    };
  }, []);

  return (
    <>
      <IconButton
        ref={buttonRef}
        color="inherit"
        onClick={handleClick}
        aria-label={`${unreadCount} unread notifications`}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>
      
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          elevation: 3,
          sx: { 
            width: 320, 
            maxHeight: 400, 
            overflow: 'auto',
            borderRadius: 1,
          }
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid rgba(0, 0, 0, 0.12)' }}>
          <Typography variant="h6">Notifications</Typography>
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Box>
        
        {notifications.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="textSecondary" align="center">
              No notifications
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {notifications.map((notification) => (
              <React.Fragment key={notification.id}>
                <ListItem 
                  sx={getNotificationStyle(notification.is_read)}
                  onClick={() => {
                    if (!notification.is_read) {
                      handleMarkAsRead(notification.id);
                    }
                  }}
                >
                  <ListItemText 
                    disableTypography
                    primary={renderNotificationContent(notification)}
                  />
                </ListItem>
                <Divider component="li" />
              </React.Fragment>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}

export default NotificationList; 