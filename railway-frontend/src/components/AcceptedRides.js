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
  IconButton
} from '@mui/material';
import { Schedule, DirectionsCar, LocationOn, Person, Phone, Email, Event, AccessTime, ArrowForward, Cancel, CheckCircle } from '@mui/icons-material';
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
  const location = useLocation();
  const navigate = useNavigate();

  const fetchAcceptedRides = async () => {
    try {
      const token = localStorage.getItem('token');
      const currentUserType = localStorage.getItem('userType');
      const userId = localStorage.getItem('userId');
      setUserType(currentUserType || '');
      
      if (!token) {
        setError('Please log in to view your trips');
        setLoading(false);
        return;
      }

      console.log('Fetching accepted rides...');
      console.log('User type:', currentUserType);
      console.log('User ID:', userId);
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch accepted rides');
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
      
      // Sort rides by departure time (most recent first)
      const sortedRides = data.sort((a, b) => 
        new Date(b.departure_time) - new Date(a.departure_time)
      );
      
      setAcceptedRides(sortedRides);
      if (sortedRides.length > 0) {
        setSelectedRide(sortedRides[0]);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
      setError('Failed to load accepted rides. Please try again.');
      setLoading(false);
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

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM dd, yyyy h:mm a');
    } catch (e) {
      return dateString || 'Unknown date';
    }
  };

  if (loading) {
    return (
      <Container>
        <Typography>Loading your trips...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 8 }}>
      <Typography variant="h4" className="page-title" gutterBottom>
        My Trips
      </Typography>

      {acceptedRides.length === 0 ? (
        <Alert severity="info">You don't have any trips yet.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
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
            <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
              {acceptedRides.map((ride) => (
                <ListItem 
                  key={ride.id}
                  alignItems="flex-start"
                  button
                  onClick={() => handleRideClick(ride)}
                  sx={{ 
                    mb: 1, 
                    borderRadius: 1,
                    bgcolor: selectedRide?.id === ride.id ? 'rgba(128, 0, 0, 0.08)' : 'white',
                    border: '1px solid #eee',
                    '&:hover': {
                      bgcolor: 'rgba(128, 0, 0, 0.05)',
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <DirectionsCar sx={{ color: '#800000' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <React.Fragment>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="subtitle1" component="span" fontWeight="bold">
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
                            <LocationOn sx={{ fontSize: 16, mr: 0.5, color: '#800000' }} />
                            <Typography variant="body2" component="span" color="text.secondary" noWrap>
                              {ride.pickup_location}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <AccessTime sx={{ fontSize: 16, mr: 0.5, color: '#800000' }} />
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
              <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
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
                      <LocationOn sx={{ mr: 2, color: '#800000' }} />
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
                      <LocationOn sx={{ mr: 2, color: '#800000' }} />
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
                      <AccessTime sx={{ mr: 2, color: '#800000' }} />
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
                      <Event sx={{ mr: 2, color: '#800000' }} />
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
                          <Person sx={{ mr: 2, color: '#800000' }} />
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
                          <Email sx={{ mr: 2, color: '#800000' }} />
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
                          <Phone sx={{ mr: 2, color: '#800000' }} />
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
                          <Person sx={{ mr: 2, color: '#800000' }} />
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
                          <Email sx={{ mr: 2, color: '#800000' }} />
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
                          <Phone sx={{ mr: 2, color: '#800000' }} />
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
                          <DirectionsCar sx={{ mr: 2, color: '#800000' }} />
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
                          <DirectionsCar sx={{ mr: 2, color: '#800000' }} />
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
                          onClick={() => handleCancelRide(selectedRide.id)}
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
              </Paper>
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
};

export default AcceptedRides; 