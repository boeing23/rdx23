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
        // Clear any invalid data
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        window.location.href = '/login';
        return;
      }

      // Make sure token is properly formatted (no extra quotes or spaces)
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      console.log('Using cleaned token:', cleanToken.substring(0, 10) + '...');

      console.log('Fetching notifications with token...');
      const headers = {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      console.log('Request headers:', headers);
      console.log('Authorization header exact value:', `Bearer ${cleanToken}`);

      // Try without credentials first
      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/`, {
        method: 'GET',
        headers: headers,
        // Removing credentials to test if that's causing issues
        // credentials: 'include'
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      console.log('Response URL:', response.url);

      if (response.ok) {
        const data = await response.json();
        console.log('Fetched notifications:', data.length);
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
        
        const rideMatches = data.filter(n => n.notification_type === 'RIDE_MATCH');
        if (rideMatches.length > 0) {
          console.log(`Found ${rideMatches.length} ride match notifications`);
          console.log('Sample ride match:', rideMatches[0]);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error response:', errorData);
        setError(errorData.message || 'Failed to fetch notifications');
        
        // If unauthorized, redirect to login
        if (response.status === 401) {
          console.log('Unauthorized, clearing token and redirecting to login');
          localStorage.removeItem('token');
          localStorage.removeItem('userType');
          window.location.href = '/login';
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Network error while fetching notifications');
    }
  };

  useEffect(() => {
    // Perform a single test fetch first to diagnose issues
    const testFetch = async () => {
      try {
        // First try the health endpoint without auth
        console.log('Testing API health endpoint without auth...');
        const healthResponse = await fetch(`${API_BASE_URL}/api/health/`);
        console.log('Health endpoint response:', healthResponse.status);
        
        // Test notifications endpoint without auth to see what error we get
        console.log('Testing notifications endpoint without auth (should fail)...');
        const noAuthResponse = await fetch(`${API_BASE_URL}/api/rides/notifications/`);
        console.log('No auth response status:', noAuthResponse.status);
        
        // Now test with auth
        const token = localStorage.getItem('token');
        if (token) {
          console.log('Testing with auth token...');
          // Try various Authorization header formats
          const authResponse = await fetch(`${API_BASE_URL}/api/rides/notifications/`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          console.log('Auth response status:', authResponse.status);
          
          if (authResponse.status === 401) {
            // Try with a different format
            console.log('Trying token without Bearer prefix...');
            const authResponse2 = await fetch(`${API_BASE_URL}/api/rides/notifications/`, {
              headers: {
                'Authorization': token
              }
            });
            console.log('Auth response (no Bearer) status:', authResponse2.status);
          }
        }
      } catch (error) {
        console.error('Test fetch error:', error);
      }
    };
    
    testFetch();
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

      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/${notificationId}/mark_as_read/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
        
      case 'REQUEST_ACCEPTED':
      case 'RIDE_ACCEPTED_BY_DRIVER':
        return (
          <>
            <Typography variant="body1" component="div" fontWeight="bold" color="success.main">
              Ride Accepted
            </Typography>
            <Typography variant="body2" component="div">
              {notification.message}
            </Typography>
            {notification.ride_details && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0, 200, 0, 0.04)', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Pickup:</strong> {notification.ride_details.start_location}
                </Typography>
                <Typography variant="body2">
                  <strong>Dropoff:</strong> {notification.ride_details.end_location}
                </Typography>
                <Typography variant="body2">
                  <strong>Departure:</strong> {formatDate(notification.ride_details.departure_time)}
                </Typography>
              </Box>
            )}
            {notification.sender && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0, 0, 0, 0.04)', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="bold">
                  Contact Information
                </Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {notification.sender.name}
                </Typography>
                {notification.sender_email && (
                  <Typography variant="body2">
                    <strong>Email:</strong> {notification.sender_email}
                  </Typography>
                )}
                {notification.sender_phone && (
                  <Typography variant="body2">
                    <strong>Phone:</strong> {notification.sender_phone}
                  </Typography>
                )}
                {notification.sender_vehicle && (
                  <>
                    <Typography variant="body2" fontWeight="bold" sx={{ mt: 1 }}>
                      Vehicle Details
                    </Typography>
                    <Typography variant="body2">
                      <strong>Vehicle:</strong> {notification.sender_vehicle.make} {notification.sender_vehicle.model} ({notification.sender_vehicle.color})
                    </Typography>
                    <Typography variant="body2">
                      <strong>License Plate:</strong> {notification.sender_vehicle.plate}
                    </Typography>
                  </>
                )}
              </Box>
            )}
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