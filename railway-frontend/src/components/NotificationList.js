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
  Paper,
  CircularProgress
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import RefreshIcon from '@mui/icons-material/Refresh';
import Email from '@mui/icons-material/Email';
import { API_BASE_URL, FALLBACK_API_URL, checkApiConnection } from '../config';
import axios from 'axios';

function NotificationList() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [serverAvailable, setServerAvailable] = useState(true);
  const buttonRef = useRef(null);
  const open = Boolean(anchorEl);
  const userType = localStorage.getItem('userType');
  const isRider = userType === 'RIDER';

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
      // Clean the token - remove any quotes or spaces
      if (token) {
        return token.trim().replace(/^["'](.*)["']$/, '$1');
      }
      return null;
    } catch (error) {
      console.error('Error getting token from localStorage:', error);
      return null;
    }
  };

  // Function to check server availability
  const checkServerAvailability = async () => {
    const isAvailable = await checkApiConnection();
    setServerAvailable(isAvailable);
    return isAvailable;
  };

  // Add a fallback function that uses a simpler endpoint
  const fetchNotificationsFromAlternateEndpoint = async () => {
    try {
      console.log('Attempting to fetch notifications from alternate endpoint');
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No token available for alternate endpoint request');
        return null;
      }
      
      // Clean token to ensure proper format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
      
      // Try a different endpoint path that might not have the schema issue
      // First try the user notifications endpoint
      try {
        const response = await axios.get(`${API_BASE_URL}/api/users/notifications/`, {
          headers: { 
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json' 
          }
        });
        
        console.log('Retrieved notifications from alternate endpoint:', response.data);
        return response.data;
      } catch (userEndpointError) {
        console.warn('User notifications endpoint failed:', userEndpointError.message);
        
        // Try a generic notifications endpoint as second fallback
        try {
          const response = await axios.get(`${API_BASE_URL}/api/notifications/`, {
            headers: { 
              'Authorization': `Bearer ${cleanToken}`,
              'Content-Type': 'application/json' 
            }
          });
          
          console.log('Retrieved notifications from generic endpoint:', response.data);
          return response.data;
        } catch (genericEndpointError) {
          console.warn('Generic notifications endpoint failed:', genericEndpointError.message);
          return null;
        }
      }
    } catch (error) {
      console.error('Error in alternate endpoint fetch:', error);
      return null;
    }
  };

  // Fetch all notifications for the logged-in user
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      // Clean token to ensure proper format
      const cleanToken = token ? token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '') : '';
      
      console.log('Fetching notifications from the API...');
      
      // The correct endpoint based on Django REST framework router setup
      // URL is /api/rides/notifications/ based on the router configuration 
      // in the Django backend
      try {
        // Try fetch with correct endpoint path structure
        const response = await axios.get(`${API_BASE_URL}/api/rides/notifications/`, {
          headers: { 
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json' 
          }
        });
        console.log('Notifications received:', response.data);
        
        // Handle the new response format where notifications are in the 'results' property
        const notificationsArray = response.data.results || response.data;
        
        // Process notifications as before
        const filteredNotifications = notificationsArray.filter(notification => {
          if (!notification || !notification.id) return false;
          
          // Skip notifications with incomplete required fields based on type
          if (notification.notification_type === 'RIDE_MATCH' && 
              (!notification.ride_offer || 
               !notification.sender || 
               (!notification.ride_request && !notification.ride_request_id && 
                !(notification.ride_details && notification.ride_details.request_id)))) {
            console.warn('Skipping incomplete RIDE_MATCH notification:', notification.id);
            return false;
          }
          
          return true;
        });
        
        setNotifications(filteredNotifications);
        
        // Get unread count either from response or calculate it
        const unreadCount = response.data.unread_count !== undefined 
          ? response.data.unread_count 
          : filteredNotifications.filter(n => !n.is_read).length;
        
        setUnreadCount(unreadCount);
        syncUnreadCount(unreadCount);
        setError(null);
        setServerAvailable(true);
      } catch (error) {
        console.error('Error fetching notifications:', error);
        
        // Enhanced error logging
        if (error.response) {
          console.error('Error response status:', error.response.status);
          console.error('Error response headers:', error.response.headers);
          
          // Log the detailed error data
          if (error.response.data) {
            console.error('Error response data:', error.response.data);
            
            // For non-JSON responses, try to get the text
            if (typeof error.response.data === 'string') {
              console.error('Error response text:', error.response.data);
              
              if (error.response.data.includes('ProgrammingError') && 
                  error.response.data.includes('column rides_riderequest.optimal_pickup_point does not exist')) {
                console.error('Database schema error detected: Missing optimal_pickup_point field');
                
                // Create a simple notification structure that doesn't rely on the missing field
                console.log('Creating simple notifications as fallback');
                const simpleNotifications = [];
                setNotifications(simpleNotifications);
                setUnreadCount(0);
                syncUnreadCount(0);
                setError('Notifications are limited due to a server update. We are working to restore all features.');
                setLoading(false);
                return;
              }
            }
          }
          
          // If it's a 404, the endpoint structure might be different - try other pattern
          if (error.response.status === 404) {
            console.warn('API endpoint not found, trying alternate path format...');
            try {
              // Django REST framework sometimes uses /api/notifications/ pattern
              const alternateResponse = await axios.get(`${API_BASE_URL}/api/notifications/`, {
                headers: { 
                  'Authorization': `Bearer ${cleanToken}`,
                  'Content-Type': 'application/json' 
                }
              });
              
              console.log('Notifications received from alternate path:', alternateResponse.data);
              setNotifications(alternateResponse.data);
              const count = alternateResponse.data.filter(n => !n.is_read).length;
              setUnreadCount(count);
              syncUnreadCount(count);
              setError(null);
              setServerAvailable(true);
              return;
            } catch (altError) {
              console.error('Alternate endpoint also failed:', altError.message);
            }
          }
          
          // Database schema errors often appear as 500 errors
          if (error.response.status === 500) {
            console.warn('Possible database schema issue - trying alternate endpoints');
            
            // Try alternate endpoints
            const alternateNotifications = await fetchNotificationsFromAlternateEndpoint();
            
            if (alternateNotifications && alternateNotifications.length > 0) {
              console.log('Successfully retrieved notifications from alternate endpoint');
              setNotifications(alternateNotifications);
              const count = alternateNotifications.filter(n => !n.is_read).length;
              setUnreadCount(count);
              syncUnreadCount(count);
              setError(null);
              setServerAvailable(true);
              return; // Exit early if we got notifications
            }
            
            // If alternate endpoint failed, fall back to empty array
            console.warn('All endpoints failed - using empty notifications array');
            setNotifications([]);
            setUnreadCount(0);
            syncUnreadCount(0);
            
            // Set a more informative error message
            setError('Notifications temporarily unavailable. The system is undergoing maintenance.');
          } else if (error.response.status === 401) {
            setError('Your session has expired. Please log in again.');
            localStorage.removeItem('token');
          } else {
            setError(`Error: ${error.response.status} - ${error.response.data?.detail || 'Failed to fetch notifications'}`);
          }
          setServerAvailable(error.response.status !== 500);
        } else if (error.request) {
          // The request was made but no response was received
          console.error('No response received:', error.request);
          setError('No response from the server. Please check your connection.');
          setServerAvailable(false);
        } else {
          // Something happened in setting up the request
          console.error('Error setting up request:', error.message);
          setError('Error connecting to the server. Please try again later.');
          setServerAvailable(false);
        }
      }
    } catch (outerError) {
      // Catch any errors not caught by the inner try-catch
      console.error('Outer error in fetchNotifications:', outerError);
      setError('An unexpected error occurred. Please try again later.');
      setServerAvailable(false);
      setNotifications([]);
      setUnreadCount(0);
      syncUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };
  
  // Retry function for users to manually retry fetching
  const handleRetry = () => {
    fetchNotifications(true); // Skip server check on manual retry
  };

  useEffect(() => {
    // Initial fetch
    fetchNotifications();

    // Set up polling - check for new notifications every minute
    const intervalId = setInterval(() => {
      fetchNotifications();
    }, 30000); // 30 seconds

    // Enhanced notification polling for drivers
    let driverPollId;
    if (userType === 'DRIVER') {
      // Drivers get more frequent polling for ride requests
      driverPollId = setInterval(() => {
        checkForRideRequests();
      }, 15000); // 15 seconds for drivers
    }

    // Clean up on unmount
    return () => {
      clearInterval(intervalId);
      if (driverPollId) {
        clearInterval(driverPollId);
      }
    };
  }, []);

  // Special function for checking ride requests for drivers
  const checkForRideRequests = async () => {
    const token = getToken();
    if (!token || userType !== 'DRIVER') return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/rides/requests/`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        }
      });
      
      const pendingRequests = response.data.filter(req => 
        req.status === 'PENDING' || req.status === 'WAITING_FOR_MATCH'
      );
      
      // If there are new pending requests that haven't been notified about
      if (pendingRequests.length > 0) {
        // Check if we've already notified about these requests
        const notifiedRequests = JSON.parse(localStorage.getItem('notifiedRequests') || '[]');
        const newRequests = pendingRequests.filter(req => 
          !notifiedRequests.includes(req.id)
        );
        
        if (newRequests.length > 0) {
          // Store these as notified
          localStorage.setItem('notifiedRequests', 
            JSON.stringify([...notifiedRequests, ...newRequests.map(r => r.id)])
          );
          
          // Show notification for new ride requests
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Ride Requests', {
              body: `You have ${newRequests.length} new ride request(s). Click to view.`,
              icon: '/logo192.png'
            });
          }
          
          // Also display a message on the page
          const event = new CustomEvent('newRideRequests', { 
            detail: { count: newRequests.length } 
          });
          window.dispatchEvent(event);
          
          // Refresh notifications to include these
          fetchNotifications();
        }
      }
    } catch (error) {
      console.error('Error checking for ride requests:', error);
    }
  };

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
      setLoading(true);
      
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
        alert('Ride match accepted successfully! You can view your ride details in the "My Trips" section.');
        
        // Redirect to the accepted rides page
        setTimeout(() => {
          window.location.href = '/accepted-rides';
        }, 1500);
      } else {
        console.error('Error response status:', response.status);
        console.error('Error response URL:', response.url);
        
        // Log more details about the response for debugging
        try {
          const errorText = await response.text();
          console.error('Error response body:', errorText);
          
          if (response.status === 400 && errorText.includes('already accepted')) {
            alert('This ride match has already been accepted.');
          } else if (response.status === 404) {
            alert('This ride request was not found or has been cancelled.');
          } else {
            alert('Failed to accept ride match. Please try again later.');
          }
        } catch (e) {
          console.error('Could not parse error response:', e);
          alert('Failed to accept ride match. Please try again later.');
        }
      }
    } catch (error) {
      console.error('Error accepting ride match:', error);
      alert('Network error while accepting ride match. Please check your connection and try again.');
    } finally {
      setLoading(false);
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
    try {
      if (!notification) return null;
      
      console.log('Checking notification for Accept button:', notification.id, notification.notification_type);
      
      // Show accept buttons based on notification type AND user type
      if (notification.notification_type === 'RIDE_MATCH' && isRider) {
        console.log(`Found ${notification.notification_type} notification for rider:`, notification.id);
        
        // Use direct ID access - if ride_request is a number/string ID rather than an object
        const rideRequestId = notification.ride_request || 
                             (notification.ride_request_id) || 
                             (notification.ride_details?.request_id);
        
        if (rideRequestId) {
          console.log(`Rendering Accept button for ride request ${rideRequestId}`);
          return (
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<DirectionsCarIcon />}
                onClick={() => handleAcceptRideMatch(rideRequestId)}
              >
                Accept Ride Match
              </Button>
            </Box>
          );
        } else {
          console.warn(`${notification.notification_type} notification missing ride_request data:`, notification);
        }
      } else if (notification.notification_type === 'RIDE_PENDING' && userType === 'DRIVER') {
        // For drivers, show accept button for pending ride requests
        console.log(`Found ${notification.notification_type} notification for driver:`, notification.id);
        
        const rideRequestId = notification.ride_request || 
                             (notification.ride_request_id) || 
                             (notification.related_pending_request?.id);
        
        if (rideRequestId) {
          return (
            <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button
                variant="contained"
                color="primary"
                size="small"
                startIcon={<DirectionsCarIcon />}
                onClick={() => handleAcceptRideMatch(rideRequestId)}
              >
                Accept Ride Request
              </Button>
            </Box>
          );
        }
      } else {
        console.log(`Notification type ${notification.notification_type} does not need accept button for ${userType}`);
      }
      return null;
    } catch (error) {
      console.error('Error rendering accept button:', error);
      return null; // Return nothing if any error occurs
    }
  };

  // Function to render ride match details for better readability
  const renderRideMatchDetails = (notification) => {
    // Extract ride details safely with fallbacks
    const rideDetails = notification.ride_details || {};
    const rideRequest = notification.ride_request || {};
    
    // Get rider details
    const riderName = notification.rider_name || 'A passenger';
    
    // Get priority info if available
    const priorityInfo = notification.priority_info || {};
    const queuePosition = priorityInfo.queue_position;
    const waitingTime = priorityInfo.waiting_time_minutes;
    
    return (
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          <DirectionsCarIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
          From: {rideDetails.start_location || rideRequest.pickup_location || 'Not specified'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <DirectionsCarIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
          To: {rideDetails.end_location || rideRequest.dropoff_location || 'Not specified'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <DirectionsCarIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
          Seats: {rideRequest.seats_needed || '1'}
        </Typography>
        
        {/* Show priority information for drivers */}
        {userType === 'DRIVER' && (waitingTime || queuePosition) && (
          <Box sx={{ mt: 1, p: 1, bgcolor: '#f8f9fa', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" fontWeight="bold">
              Priority Request
            </Typography>
            {waitingTime && (
              <Typography variant="body2" color="text.secondary">
                Rider has been waiting for {waitingTime} minutes
              </Typography>
            )}
            {queuePosition === 1 && (
              <Typography variant="body2" color="error">
                This rider is first in the queue
              </Typography>
            )}
          </Box>
        )}
        
        {renderAcceptButton(notification)}
      </Box>
    );
  };

  // Function to safely render notification content, avoiding references to potentially missing fields
  const renderSafeNotificationContent = (notification) => {
    // Default to basic display that doesn't rely on problematic fields
    return (
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
          {notification.message || 'Notification'}
        </Typography>
        {notification.created_at && (
          <Typography variant="caption" color="text.secondary">
            {formatDate(notification.created_at)}
          </Typography>
        )}
      </Box>
    );
  };

  const renderNotificationContent = (notification) => {
    // First check if we have the necessary data structures
    // If critical fields are missing, fall back to safe rendering
    if (!notification || !notification.notification_type) {
      return renderSafeNotificationContent(notification);
    }
    
    try {
      switch (notification.notification_type) {
        case 'RIDE_MATCH':
        case 'REQUEST_ACCEPTED':
          // Safely access nested properties with optional chaining
          const rideDetails = notification.ride_details;
          const formattedTime = rideDetails?.formatted_departure_time || 
                               (rideDetails?.departure_time ? formatDateTime(rideDetails.departure_time) : 'Unknown time');
          
          // Check if the potentially problematic fields exist before using them
          const dropoffInfo = rideDetails?.nearest_dropoff_info?.address || 
                             (notification.dropoff_location || 'Near your destination');
          
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
              {notification.ride_details?.id && (
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
    } catch (err) {
      console.error('Error rendering notification content:', err);
      return renderSafeNotificationContent(notification);
    }
  };

  // Update the error display in the popover to include retry button
  const renderErrorMessage = () => (
    <Box sx={{ p: 2, textAlign: 'center' }}>
      <Typography color="error" sx={{ mb: 1 }}>
        {error}
      </Typography>
      <Button 
        startIcon={<RefreshIcon />}
        onClick={handleRetry}
        disabled={loading}
        variant="outlined" 
        size="small"
        sx={{ mt: 1 }}
      >
        {loading ? <CircularProgress size={20} /> : 'Retry'}
      </Button>
    </Box>
  );

  // Add a simplified version of the notification fetching that doesn't use problematic fields
  const fetchNotificationsBasic = async () => {
    try {
      console.log('Attempting to fetch notifications with basic endpoint as fallback');
      const token = getToken();
      
      if (!token) {
        setError('Please log in to view notifications');
        setLoading(false);
        return;
      }
      
      // Clean the token properly
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
      
      // Try a generic endpoint that doesn't require the problematic model fields
      const response = await fetch(`${API_BASE_URL}/api/notifications/basic/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        }
      });
      
      // If this also fails, try a most basic approach - just get list with minimal info
      if (!response.ok) {
        console.log('Basic endpoint failed, using minimal approach');
        
        // Simulate minimal notifications to avoid errors
        setNotifications([]);
        setUnreadCount(0);
        setError('');
        setLoading(false);
        
        // Show a user-friendly message without exposing the technical error
        setError('Notifications are temporarily limited. We are working on a fix.');
        return;
      }
      
      const data = await response.json();
      setNotifications(data);
      const count = data.filter(n => !n.is_read).length;
      setUnreadCount(count);
      syncUnreadCount(count);
      setError('');
      setLoading(false);
    } catch (err) {
      console.error('Error in fallback notification fetch:', err);
      
      // Last resort - set empty notifications
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      setError('Notifications are temporarily unavailable. Please try again later.');
    }
  };

  // Function to request an email notification for a specific ride match
  const requestEmailNotification = async (notificationId) => {
    try {
      console.log(`Requesting email notification for notification ID: ${notificationId}`);
      const token = getToken();
      
      if (!token) {
        console.error('No authentication token found');
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/rides/notifications/${notificationId}/send_email/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        alert('Email notification has been sent to your registered email address.');
      } else {
        console.error('Failed to send email notification:', response.status);
        alert('Failed to send email notification. Please try again later.');
      }
    } catch (err) {
      console.error('Error requesting email notification:', err);
      alert('Error sending email notification. Please check your connection and try again.');
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
            <Alert 
              severity="error" 
              sx={{ mt: 2, mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetry} disabled={loading}>
                  {loading ? <CircularProgress size={20} color="inherit" /> : 'Retry'}
                </Button>
              }
            >
              {error}
            </Alert>
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
                {renderErrorMessage()}
              </ListItem>
            ) : loading && notifications.length === 0 ? (
              <ListItem sx={{ justifyContent: 'center', py: 3 }}>
                <CircularProgress size={30} />
              </ListItem>
            ) : notifications.length === 0 ? (
              <ListItem>
                <ListItemText 
                  primary="You have no notifications"
                  sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }} 
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