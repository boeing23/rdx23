import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Divider,
  Chip,
  Alert,
  Button,
  Paper,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { Schedule, DirectionsCar, LocationOn, Person, Phone, Email, Event, AccessTime, ArrowForward, Cancel, CheckCircle, Check } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { format } from 'date-fns';

const AcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [userType, setUserType] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [openCompleteDialog, setOpenCompleteDialog] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const fetchAcceptedRides = async () => {
    // Create controller outside try block for scope
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
    
    try {
      const token = localStorage.getItem('token');
      const currentUserType = localStorage.getItem('userType');
      const userId = localStorage.getItem('userId');
      setUserType(currentUserType || '');
      
      if (!token) {
        console.log('No authentication token found');
        setError('Please log in to view your trips');
        setLoading(false);
        return;
      }

      // Validate token format (basic check)
      if (token.trim() === '' || token === 'undefined' || token === 'null') {
        console.error('Invalid token format:', token);
        localStorage.removeItem('token'); // Clear invalid token
        setError('Your session has expired. Please log in again');
        setLoading(false);
        return;
      }

      console.log('Fetching accepted rides...');
      console.log('User type:', currentUserType);
      console.log('User ID:', userId);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      if (!response.ok) {
        // For 404 Not Found or 204 No Content, it's likely the user just hasn't started any trips yet
        if (response.status === 404 || response.status === 204 || response.status === 403) {
          console.log(`No rides found (${response.status} response) - treating as empty state`);
          setAcceptedRides([]);
          setLoading(false);
          return;
        }
        
        // Log the exact response status and statusText for debugging
        console.error(`API response error: ${response.status} ${response.statusText}`);
        
        // Try to get more details from the response body if possible
        try {
          const errorData = await response.text();
          console.error('Response body:', errorData);
        } catch (e) {
          console.error('Could not read response body:', e);
        }
        
        throw new Error(`Failed to fetch accepted rides: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Fetched accepted rides:', data);
      
      // Log detailed information about each ride
      data.forEach((ride, index) => {
        console.log(`Ride ${index + 1}:`, {
          id: ride.id,
          status: ride.status,
          rider: ride.rider,
          ride: ride.ride,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          departure: ride.departure_time,
          seats: ride.seats_needed
        });
      });
      
      // Filter out cancelled rides
      const filteredRides = data.filter(ride => ride.status !== 'CANCELLED');
      
      // Sort rides by departure time (most recent first)
      const sortedRides = filteredRides.sort((a, b) => 
        new Date(b.departure_time) - new Date(a.departure_time)
      );
      
      setAcceptedRides(sortedRides);
      if (sortedRides.length > 0) {
        setSelectedRide(sortedRides[0]);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching accepted rides:', err);

      // Special handling for request timeout
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else if (err.message.includes('Failed to fetch accepted rides')) {
        // This is likely a case where there are no rides yet, so just show empty state
        console.log('Treating as empty rides list case:', err.message);
        setAcceptedRides([]);
        setError(''); // Don't show error for no rides
      } else {
        // For other errors, still treat as no rides available by default
        console.log('Unknown error, treating as empty rides list:', err.message);
        setAcceptedRides([]);
        setError(''); // Don't show error for no rides
      }
      
      setLoading(false);
    } finally {
      clearTimeout(timeoutId); // Always clear the timeout
    }
  };

  // Fetch rides when component mounts and when location changes
  useEffect(() => {
    console.log('AcceptedRides - Fetching rides due to mount or location change');
    fetchAcceptedRides();
  }, [location.search]); // Only re-fetch when the URL query parameters change

  const handleChangeTab = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleRideClick = (ride) => {
    setSelectedRide(ride);
  };

  const getStatusChip = (status) => {
    switch (status) {
      case 'ACCEPTED':
        return <Chip label="Accepted" color="success" size="small" />;
      case 'COMPLETED':
        return <Chip label="Completed" color="primary" size="small" />;
      case 'CANCELLED':
        return <Chip label="Cancelled" color="error" size="small" />;
      default:
        return <Chip label={status} color="default" size="small" />;
    }
  };

  const handleCancelRide = async (rideRequestId) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to cancel a ride');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/cancel/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to cancel ride');
      }

      // Refresh the rides list
      fetchAcceptedRides();
    } catch (err) {
      console.error('Error cancelling ride:', err);
      setError('Failed to cancel ride. Please try again.');
    }
  };

  const handleCompleteRide = async (rideRequestId) => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to complete a ride');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/rides/requests/${rideRequestId}/complete/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to complete ride');
      }

      // Refresh the rides list
      fetchAcceptedRides();
    } catch (err) {
      console.error('Error completing ride:', err);
      setError('Failed to complete ride. Please try again.');
    }
  };

  // Helper function to get full name
  const getFullName = (user) => {
    if (!user) return 'Unknown User';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
  };

  const getPhoneNumber = (user) => {
    return user && user.phone_number ? user.phone_number : 'No phone number provided';
  };

  const getEmail = (user) => {
    return user && user.email ? user.email : 'No email provided';
  };

  const formatDate = (dateString, dateOnly = false, timeOnly = false) => {
    try {
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Invalid date';
      }
      
      // Options for date/time formatting
      const options = {
        timeZone: 'America/New_York' // Eastern Time
      };
      
      if (dateOnly) {
        // Date only format: "May 15, 2023"
        return new Intl.DateTimeFormat('en-US', {
          ...options,
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(date);
      } else if (timeOnly) {
        // Time only format: "3:30 PM EDT"
        return new Intl.DateTimeFormat('en-US', {
          ...options,
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        }).format(date);
      } else {
        // Full format: "May 15, 2023, 3:30 PM EDT"
        return new Intl.DateTimeFormat('en-US', {
          ...options,
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        }).format(date);
      }
    } catch (e) {
      console.error('Error formatting date:', e);
      return dateString || 'Unknown date';
    }
  };

  const handleOpenCancelDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCancelDialog(true);
  };

  const handleCloseCancelDialog = () => {
    setSelectedRide(null);
    setOpenCancelDialog(false);
  };

  const handleOpenCompleteDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCompleteDialog(true);
  };

  const handleCloseCompleteDialog = () => {
    setOpenCompleteDialog(false);
  };

  // Add a function to render pickup and dropoff information with the optimal points
  const renderLocationDetails = (ride) => {
    if (!ride) return null;
    
    const isDriver = userType === '"DRIVER"' || userType === 'DRIVER';
    const hasOptimalPickup = ride.optimal_pickup_info && ride.optimal_pickup_info.address;
    const hasNearestDropoff = ride.nearest_dropoff_info && ride.nearest_dropoff_info.address;
    
    return (
      <>
        <ListItem>
          <ListItemIcon>
            <LocationOn sx={{ color: '#861F41' }} />
          </ListItemIcon>
          <ListItemText 
            primary="Pickup" 
            secondary={
              <>
                <Typography variant="body2">{ride.pickup_location}</Typography>
                {isDriver && hasOptimalPickup && (
                  <Typography variant="body2" sx={{ color: 'success.main', mt: 0.5 }}>
                    <b>Suggested pickup point:</b> {ride.optimal_pickup_info.address}
                  </Typography>
                )}
              </>
            } 
          />
        </ListItem>
        <ListItem>
          <ListItemIcon>
            <ArrowForward sx={{ color: '#861F41' }} />
          </ListItemIcon>
          <ListItemText 
            primary="Dropoff" 
            secondary={
              <>
                <Typography variant="body2">{ride.dropoff_location}</Typography>
                {!isDriver && hasNearestDropoff && (
                  <Typography variant="body2" sx={{ color: 'success.main', mt: 0.5 }}>
                    <b>Nearest dropoff point:</b> {ride.nearest_dropoff_info.address}
                  </Typography>
                )}
              </>
            } 
          />
        </ListItem>
      </>
    );
  };

  // Update the RideCard component to use the new renderLocationDetails function
  const RideCard = ({ ride }) => {
    if (!ride) return null;

    return (
      <Card sx={{ mb: 3, borderRadius: '12px', boxShadow: 2 }}>
        <CardContent sx={{ p: 2 }}>
          {/* Status chip and departure time */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            {getStatusChip(ride.status || 'UNKNOWN')}
            <Typography variant="body2" color="text.secondary">
              {formatDate(ride.departure_time)}
            </Typography>
          </Box>
          
          <Divider sx={{ my: 1.5 }} />
          
          {/* User details */}
          <Box sx={{ my: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              {userType === '"DRIVER"' || userType === 'DRIVER' ? 'Rider Details' : 'Driver Details'}
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <Person sx={{ color: '#861F41' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Name" 
                  secondary={
                    userType === '"DRIVER"' || userType === 'DRIVER' 
                      ? getFullName(ride.rider) 
                      : getFullName(ride.ride_details?.driver)
                  } 
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Phone sx={{ color: '#861F41' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Phone" 
                  secondary={
                    userType === '"DRIVER"' || userType === 'DRIVER' 
                      ? getPhoneNumber(ride.rider) 
                      : getPhoneNumber(ride.ride_details?.driver)
                  } 
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <Email sx={{ color: '#861F41' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Email" 
                  secondary={
                    userType === '"DRIVER"' || userType === 'DRIVER' 
                      ? getEmail(ride.rider) 
                      : getEmail(ride.ride_details?.driver)
                  } 
                />
              </ListItem>
              {userType !== '"DRIVER"' && userType !== 'DRIVER' && ride.ride_details?.driver && (
                <ListItem>
                  <ListItemIcon>
                    <DirectionsCar sx={{ color: '#861F41' }} />
                  </ListItemIcon>
                  <ListItemText 
                    primary="Vehicle" 
                    secondary={
                      ride.ride_details?.driver?.vehicle_make 
                        ? `${ride.ride_details.driver.vehicle_color || ''} ${ride.ride_details.driver.vehicle_make || ''} ${ride.ride_details.driver.vehicle_model || ''} ${ride.ride_details.driver.license_plate ? `(${ride.ride_details.driver.license_plate})` : ''}`
                        : 'No vehicle information'
                    }
                  />
                </ListItem>
              )}
            </List>
          </Box>
          
          <Divider sx={{ my: 1.5 }} />
          
          {/* Ride details */}
          <Box sx={{ my: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Ride Details
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <Event sx={{ color: '#861F41' }} />
                </ListItemIcon>
                <ListItemText primary="Date" secondary={formatDate(ride.departure_time, true)} />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <AccessTime sx={{ color: '#861F41' }} />
                </ListItemIcon>
                <ListItemText primary="Time" secondary={formatDate(ride.departure_time, false, true)} />
              </ListItem>
              
              {/* Use the new function to render pickup and dropoff with optimal points */}
              {renderLocationDetails(ride)}
              
            </List>
          </Box>
          
          {/* Action buttons */}
          {ride.status === 'ACCEPTED' && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                color="error"
                startIcon={<Cancel />}
                onClick={() => handleOpenCancelDialog(ride)}
                size="small"
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="success"
                endIcon={<CheckCircle />}
                onClick={() => handleOpenCompleteDialog(ride)}
                size="small"
              >
                Mark as Completed
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ px: 4, py: 5 }}>
        <Typography variant="h4" className="page-title" gutterBottom>
          My Trips
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
          <Typography>Loading your trips...</Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    // Check if the error is about loading rides and user has no rides yet
    if (error === 'Failed to load accepted rides. Please try again.' || 
        error.includes('Failed to fetch') || 
        error.includes('Failed to load')) {
      return (
        <Container maxWidth="lg" sx={{ px: 4, py: 5 }}>
          <Typography variant="h4" className="page-title" gutterBottom>
            My Trips
          </Typography>
          <Paper elevation={2} sx={{ p: 4, borderRadius: '12px', mt: 3, textAlign: 'center' }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              justifyContent: 'center',
              py: 4
            }}>
              <DirectionsCar sx={{ fontSize: 80, color: '#861F41', mb: 2, opacity: 0.8 }} />
              <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41' }}>
                {userType === 'DRIVER' ? 'Ready to hit the road?' : 'The road\'s calling your name!'}
              </Typography>
              <Typography variant="body1" gutterBottom color="text.secondary" sx={{ maxWidth: 600, mb: 3 }}>
                {userType === 'DRIVER'
                  ? "Looks like your trip history is empty. Start by viewing available ride requests and accepting passengers!"
                  : "Looks like you haven't started your journey yet. Time to hop in and explore the world with ChalBeyy!"}
              </Typography>
              <Button 
                variant="contained" 
                onClick={() => navigate(userType === 'DRIVER' ? '/rides' : '/request-ride')}
                sx={{ 
                  borderRadius: '12px',
                  py: 1.5,
                  px: 4,
                  textTransform: 'none',
                  fontWeight: 600,
                  bgcolor: '#861F41', 
                  '&:hover': { bgcolor: '#5e0d29' }
                }}
              >
                {userType === 'DRIVER' ? 'View Ride Requests' : 'Find a Ride'}
              </Button>
            </Box>
          </Paper>
        </Container>
      );
    }
    
    // For other errors, show the regular error message
    return (
      <Container maxWidth="lg" sx={{ px: 4, py: 5 }}>
        <Typography variant="h4" className="page-title" gutterBottom>
          My Trips
        </Typography>
        <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>
      </Container>
    );
  }

    return (
    <Container maxWidth="lg" sx={{ px: 4, py: 3 }}>
      <Typography variant="h4" className="page-title" gutterBottom>
        My Trips
      </Typography>

      {acceptedRides.length === 0 ? (
        <Paper elevation={2} sx={{ p: 4, borderRadius: '12px', mt: 3, textAlign: 'center' }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            justifyContent: 'center',
            py: 4
          }}>
            <DirectionsCar sx={{ fontSize: 80, color: '#861F41', mb: 2, opacity: 0.8 }} />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41' }}>
              {userType === 'DRIVER' ? 'No passengers yet? Your car is waiting!' : 'Rides waiting, seats inviting!'}
            </Typography>
            <Typography variant="body1" gutterBottom color="text.secondary" sx={{ maxWidth: 600, mb: 3 }}>
              {userType === 'DRIVER' 
                ? "You haven't accepted any ride requests yet. Check out the available requests and start driving!" 
                : "Your journey begins with just one click! Find your perfect ride and let the adventures begin."}
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => navigate(userType === 'DRIVER' ? '/rides' : '/request-ride')}
              sx={{ 
                borderRadius: '12px',
                py: 1.5,
                px: 4,
                textTransform: 'none',
                fontWeight: 600,
                bgcolor: '#861F41', 
                '&:hover': { bgcolor: '#5e0d29' }
              }}
            >
              {userType === 'DRIVER' ? 'Find Passengers' : 'Find a Ride'}
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', md: 'row' }, 
          gap: 3,
          mt: 4
        }}>
          {/* Left Side - Vertical List of Trips */}
          <Box 
            sx={{ 
              width: { xs: '100%', md: '30%' }, 
              borderRight: { md: '1px solid #eee' },
              pr: { md: 2 }
            }}
          >
            <Typography variant="h6" gutterBottom>
              Your Rides
            </Typography>
            <List 
              sx={{ 
                width: '100%', 
                bgcolor: 'background.paper',
                mt: 2,
                '& .MuiListItem-root': {
                  mb: 2,
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                }
              }}
            >
              {acceptedRides.map((ride) => (
                <ListItem 
                  key={ride.id}
                  alignItems="flex-start"
                  button
                  onClick={() => handleRideClick(ride)}
                  sx={{ 
                    mb: 1.5, 
                    borderRadius: '12px',
                    bgcolor: selectedRide?.id === ride.id ? 'rgba(128, 0, 0, 0.08)' : 'white',
                    border: '1px solid #eee',
                    '&:hover': {
                      bgcolor: 'rgba(128, 0, 0, 0.05)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 8px rgba(0,0,0,0.05)'
                    },
                    py: 1.5
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <DirectionsCar sx={{ color: '#861F41' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <React.Fragment>
                        <Box sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          width: '100%',
                          gap: 2
                        }}>
                          <Typography 
                            variant="subtitle1" 
                            component="span" 
                            fontWeight="bold"
                            sx={{ flex: 1 }}
                          >
                            Trip #{ride.id}
                          </Typography>
                          {getStatusChip(ride.status)}
                        </Box>
                      </React.Fragment>
                    }
                    secondary={
                      <React.Fragment>
                        <Box sx={{ mt: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <LocationOn sx={{ fontSize: 16, mr: 0.5, color: '#861F41' }} />
                            <Typography variant="body2" component="span" color="text.secondary" noWrap>
                              {ride.pickup_location}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <AccessTime sx={{ fontSize: 16, mr: 0.5, color: '#861F41' }} />
                            <Typography variant="body2" component="span" color="text.secondary">
                              {formatDate(ride.departure_time)}
                            </Typography>
                          </Box>
                        </Box>
                      </React.Fragment>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" size="small" onClick={() => handleRideClick(ride)}>
                      <ArrowForward fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Right Side - Selected Ride Details */}
          {selectedRide && (
            <Box sx={{ width: { xs: '100%', md: '70%' } }}>
              <Paper elevation={2} sx={{ p: 4, borderRadius: '12px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h5" component="h2">
                    Trip Details
                  </Typography>
                  {getStatusChip(selectedRide.status)}
                </Box>

                <Divider sx={{ mb: 3 }} />

                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                      <LocationOn sx={{ mr: 2, color: '#861F41' }} />
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          Pickup Location
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedRide.pickup_location}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                      <LocationOn sx={{ mr: 2, color: '#861F41' }} />
                      <Box>
                        <Typography variant="body2" color="textSecondary">
                          Dropoff Location
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedRide.dropoff_location}
              </Typography>
            </Box>
                    </Box>
                  </Grid>
            
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                      <AccessTime sx={{ mr: 2, color: '#861F41' }} />
              <Box>
                        <Typography variant="body2" color="textSecondary">
                          Departure Time
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {formatDate(selectedRide.departure_time)}
                        </Typography>
              </Box>
            </Box>
                  </Grid>
            
                  <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                      <Event sx={{ mr: 2, color: '#861F41' }} />
              <Box>
                        <Typography variant="body2" color="textSecondary">
                          Seats Needed
                        </Typography>
                        <Typography variant="body1" fontWeight={500}>
                          {selectedRide.seats_needed}
                        </Typography>
              </Box>
            </Box>
                  </Grid>
            
                  <Grid item xs={12}>
            <Divider sx={{ my: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      {userType === 'DRIVER' ? 'Rider Information' : 'Driver Information'}
                    </Typography>
                  </Grid>

                  {userType === 'DRIVER' ? (
                    // Display rider information
                    <>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Person sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Rider Name
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getFullName(selectedRide.rider)}
                            </Typography>
                          </Box>
                </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Email sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Email
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getEmail(selectedRide.rider)}
                            </Typography>
                </Box>
                </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Phone sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Phone
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getPhoneNumber(selectedRide.rider)}
                  </Typography>
                </Box>
                        </Box>
                      </Grid>
              </>
            ) : (
                    // Display driver information
                    <>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Person sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Driver Name
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getFullName(selectedRide.ride_details?.driver)}
                            </Typography>
                          </Box>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Email sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Email
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getEmail(selectedRide.ride_details?.driver)}
                            </Typography>
                          </Box>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <Phone sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Phone
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {getPhoneNumber(selectedRide.ride_details?.driver)}
                            </Typography>
                          </Box>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <DirectionsCar sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              Vehicle
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {selectedRide.ride_details?.driver?.vehicle_make} {selectedRide.ride_details?.driver?.vehicle_model} ({selectedRide.ride_details?.driver?.vehicle_color})
                            </Typography>
                </Box>
                </Box>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
                          <DirectionsCar sx={{ mr: 2, color: '#861F41' }} />
                          <Box>
                            <Typography variant="body2" color="textSecondary">
                              License Plate
                            </Typography>
                            <Typography variant="body1" fontWeight={500}>
                              {selectedRide.ride_details?.driver?.license_plate || 'Not provided'}
                            </Typography>
                </Box>
                </Box>
                      </Grid>
              </>
            )}
            
                  {selectedRide.status === 'ACCEPTED' && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button 
                          variant="outlined"
                  color="error" 
                          startIcon={<Cancel />}
                          onClick={() => handleOpenCancelDialog(selectedRide)}
                >
                  Cancel Ride
                </Button>
                        {userType === 'DRIVER' && (
                  <Button 
                    variant="contained" 
                    color="success" 
                            startIcon={<CheckCircle />}
                            onClick={() => handleCompleteRide(selectedRide.id)}
                  >
                    Complete Ride
                  </Button>
                )}
              </Box>
                    </Grid>
            )}
      </Grid>

                <Divider sx={{ my: 3 }} />

                {/* Contact Information Section */}
                <Typography variant="h6" gutterBottom>
                  Contact Information
      </Typography>
      
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  {selectedRide.user_type === 'RIDER' && selectedRide.driver && (
                    <Grid item xs={12} sm={6}>
                      <Paper 
                        elevation={0} 
                        sx={{ 
                          p: 2, 
                          border: '1px solid #eee', 
                          borderRadius: '12px',
                          bgcolor: 'rgba(128, 0, 0, 0.02)' 
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Avatar sx={{ bgcolor: '#861F41', mr: 2 }}>
                            <Person />
                          </Avatar>
                          <Typography variant="subtitle1" fontWeight="bold">
                            Driver
                          </Typography>
                        </Box>
                        <Typography variant="body1">
                          {selectedRide.driver?.full_name || 'Not assigned yet'}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {selectedRide.driver?.email || ''}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {selectedRide.driver?.phone_number || ''}
                        </Typography>
                      </Paper>
                    </Grid>
                  )}
                  
                  {selectedRide.user_type === 'DRIVER' && selectedRide.rider && (
                    <Grid item xs={12} sm={6}>
                      <Paper 
                        elevation={0} 
                        sx={{ 
                          p: 2, 
                          border: '1px solid #eee', 
                          borderRadius: '12px',
                          bgcolor: 'rgba(128, 0, 0, 0.02)' 
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Avatar sx={{ bgcolor: '#861F41', mr: 2 }}>
                            <Person />
                          </Avatar>
                          <Typography variant="subtitle1" fontWeight="bold">
                            Rider
                          </Typography>
                        </Box>
                        <Typography variant="body1">
                          {selectedRide.rider?.full_name || 'Not assigned yet'}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {selectedRide.rider?.email || ''}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {selectedRide.rider?.phone_number || ''}
                        </Typography>
                      </Paper>
                    </Grid>
                  )}
        </Grid>

                <Divider sx={{ my: 3 }} />

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
                  {selectedRide.status === 'ACCEPTED' && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => handleOpenCancelDialog(selectedRide)}
                      startIcon={<Cancel />}
                      sx={{ borderRadius: '8px' }}
                    >
                      Cancel Ride
                    </Button>
                  )}
                  
                  {selectedRide.status === 'ACCEPTED' && selectedRide.user_type === 'DRIVER' && (
                    <Button
                      variant="contained"
                      sx={{ 
                        bgcolor: '#861F41', 
                        '&:hover': { bgcolor: '#5e0d29' },
                        borderRadius: '8px'
                      }}
                      onClick={() => handleCompleteRide(selectedRide.id)}
                      startIcon={<Check />}
                    >
                      Complete Ride
                    </Button>
                  )}
                </Box>
              </Paper>
            </Box>
          )}
        </Box>
      )}

      {/* Cancel Dialog */}
      <Dialog
        open={openCancelDialog}
        onClose={handleCloseCancelDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', p: 1 }
        }}
      >
        <DialogTitle>Cancel Ride</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to cancel this ride? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseCancelDialog} sx={{ borderRadius: '8px' }}>
            No, Keep Ride
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={() => {
              handleCancelRide(selectedRide.id);
              handleCloseCancelDialog();
            }}
            sx={{ borderRadius: '8px' }}
          >
            Yes, Cancel Ride
          </Button>
        </DialogActions>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog
        open={openCompleteDialog}
        onClose={handleCloseCompleteDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '12px', p: 1 }
        }}
      >
        <DialogTitle>Complete Ride</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to mark this ride as completed? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseCompleteDialog} sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            sx={{ 
              bgcolor: '#861F41', 
              '&:hover': { bgcolor: '#5e0d29' },
              borderRadius: '8px'
            }}
            onClick={() => {
              handleCompleteRide(selectedRide.id);
              handleCloseCompleteDialog();
            }}
          >
            Complete Ride
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AcceptedRides; 