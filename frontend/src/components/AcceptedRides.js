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
  Tabs
} from '@mui/material';
import { 
  Schedule, 
  DirectionsCar, 
  LocationOn, 
  Person, 
  Phone, 
  Email, 
  Event,
  MyLocation,
  PinDrop
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const AcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [userType, setUserType] = useState('');
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
      console.log('Token:', token ? `${token.substring(0, 10)}...` : 'No token');
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });

      // Log the response status for debugging
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication failed. Token may be invalid or expired.');
          localStorage.removeItem('token');
          setError('Your session has expired. Please log in again.');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
          return;
        }
        throw new Error(`Failed to fetch accepted rides: ${response.status}`);
      }

      const data = await response.json();
      console.log('Fetched accepted rides:', data);
      
      // Log field names for debugging
      if (data && data.length > 0) {
        console.log('Sample ride fields:', Object.keys(data[0]));
        
        // Check for optimal pickup point
        console.log('Has optimal_pickup_point?', Boolean(data[0].optimal_pickup_point));
        if (data[0].optimal_pickup_point) {
          console.log('Optimal pickup value:', data[0].optimal_pickup_point);
          console.log('Type of optimal pickup:', typeof data[0].optimal_pickup_point);
        }
        
        // Check for nearest dropoff point
        console.log('Has nearest_dropoff_point?', Boolean(data[0].nearest_dropoff_point));
        if (data[0].nearest_dropoff_point) {
          console.log('Nearest dropoff value:', data[0].nearest_dropoff_point);
          console.log('Type of nearest dropoff:', typeof data[0].nearest_dropoff_point);
        }
        
        // Check for driver details
        console.log('Has driver_details?', Boolean(data[0].driver_details));
        if (data[0].driver_details) {
          console.log('Driver details value:', data[0].driver_details);
        }
        
        console.log('Full accepted rides data:', data);
      }
      
      // Sort rides by departure time (most recent first)
      const sortedRides = data.sort((a, b) => 
        new Date(b.departure_time) - new Date(a.departure_time)
      );
      
      setAcceptedRides(sortedRides);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
      setError('Failed to load accepted rides. Please try again.');
      setLoading(false);
    }
  };

  const completePastRides = async () => {
    console.log('AcceptedRides - Checking for past rides to complete');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('AcceptedRides - No token found, skipping past rides check');
        return;
      }

      // Call the endpoint to complete past rides
      const response = await fetch(`${API_BASE_URL}/api/rides/rides/complete_past_rides/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('AcceptedRides - Past rides completion check:', data);
    } catch (err) {
      console.error('AcceptedRides - Error completing past rides:', err);
      // Don't show an error to the user, just log it
    }
  };

  // Fetch rides when component mounts and when location changes
  useEffect(() => {
    console.log('AcceptedRides - Fetching rides due to mount or location change');
    // First complete past rides, then fetch the updated list
    completePastRides().then(() => fetchAcceptedRides());
  }, [location.search]); // Only re-fetch when the URL query parameters change

  const handleChangeTab = (event, newValue) => {
    setTabValue(newValue);
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

  const renderRideCard = (ride) => {
    console.log('Processing ride data in renderRideCard:', ride);
    
    // Try to get driver details from multiple potential sources
    const driverInfo = ride.driver_details || (ride.ride_details && ride.ride_details.driver) || {};
    console.log('Selected driver info:', driverInfo);
    
    // Get ride data from either the ride object or the ride.ride_details object
    const rideData = ride.ride_details || ride.ride || {};
    
    const isDriver = userType === 'DRIVER';
    
    // Helper function to get full name
    const getFullName = (user) => {
      if (!user) return 'N/A';
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      return `${firstName} ${lastName}`.trim() || user.username || 'N/A';
    };

    // Format date for better display
    const formatDateTime = (dateTimeStr) => {
      try {
        const date = new Date(dateTimeStr);
        return {
          date: date.toLocaleDateString(),
          time: date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
      } catch (e) {
        return { date: 'Invalid date', time: 'Invalid time' };
      }
    };
    
    // Get formatted date/time
    const dateTime = formatDateTime(rideData.departure_time || ride.departure_time);
    
    // Handle different formats of optimal pickup point
    let pickupAddress = null;
    if (ride.optimal_pickup_info?.address) {
      pickupAddress = ride.optimal_pickup_info.address;
    } else if (ride.optimal_pickup_point) {
      if (typeof ride.optimal_pickup_point === 'object') {
        pickupAddress = ride.optimal_pickup_point.address || null;
      }
    }
    
    // Handle different formats of nearest_dropoff_point
    let dropoffAddress = null;
    if (ride.nearest_dropoff_info?.address) {
      dropoffAddress = ride.nearest_dropoff_info.address;
    } else if (ride.nearest_dropoff_point) {
      if (typeof ride.nearest_dropoff_point === 'object') {
        if (ride.nearest_dropoff_point.address) {
          dropoffAddress = ride.nearest_dropoff_point.address;
        } else if (ride.nearest_dropoff_point.coordinates && Array.isArray(ride.nearest_dropoff_point.coordinates)) {
          // Format with coordinates array and possibly an address field
          dropoffAddress = ride.nearest_dropoff_point.address || `Coordinates: ${ride.nearest_dropoff_point.coordinates.join(', ')}`;
        }
      }
    }
    
    // Determine locations - prioritize optimal pickup/dropoff points when available
    const startLocation = pickupAddress || rideData.start_location || ride.pickup_location || 'N/A';
    const endLocation = dropoffAddress || rideData.end_location || ride.dropoff_location || 'N/A';
    
    // Check if we have optimized locations that differ from the original
    const hasOptimalPickup = pickupAddress && pickupAddress !== ride.pickup_location;
    const hasOptimalDropoff = dropoffAddress && dropoffAddress !== ride.dropoff_location;

    return (
      <Card sx={{ mb: 3, width: '100%', maxWidth: '900px', mx: 'auto' }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Ride Status Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" fontWeight="600">Ride #{ride.id}</Typography>
              {getStatusChip(ride.status)}
            </Box>
            
            <Divider />
            
            {/* Ride Details */}
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle1" fontWeight="600" gutterBottom>Ride Details</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <LocationOn color="primary" sx={{ mt: 0.5 }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">From:</Typography>
                        <Typography>{startLocation}</Typography>
                        {hasOptimalPickup && (
                          <Typography variant="body2" color="primary" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                            <MyLocation fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                            Optimal pickup point for your ride
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <PinDrop color="error" sx={{ mt: 0.5 }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">To:</Typography>
                        <Typography>{endLocation}</Typography>
                        {hasOptimalDropoff && (
                          <Typography variant="body2" color="error" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                            <MyLocation fontSize="small" sx={{ verticalAlign: 'text-bottom', mr: 0.5 }} />
                            Optimal dropoff point for your route
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Event color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">Date:</Typography>
                        <Typography>{dateTime.date}</Typography>
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Schedule color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">Time:</Typography>
                        <Typography>{dateTime.time}</Typography>
                      </Box>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person color="primary" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">Seats:</Typography>
                        <Typography>{ride.seats_needed} seat(s)</Typography>
                      </Box>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Box>
            
            <Divider sx={{ my: 1 }} />
            
            {/* Driver Details - Show for riders or in debug mode */}
            {!isDriver && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight="600" gutterBottom>Driver Details</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Person color="primary" />
                        <Box>
                          <Typography variant="body2" color="text.secondary">Name:</Typography>
                          <Typography>{getFullName(driverInfo)}</Typography>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Email color="primary" />
                        <Box>
                          <Typography variant="body2" color="text.secondary">Email:</Typography>
                          <Typography>{driverInfo.email || 'N/A'}</Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Phone color="primary" />
                        <Box>
                          <Typography variant="body2" color="text.secondary">Phone:</Typography>
                          <Typography>{driverInfo.phone_number || 'N/A'}</Typography>
                        </Box>
                      </Box>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DirectionsCar color="primary" />
                        <Box>
                          <Typography variant="body2" color="text.secondary">Vehicle:</Typography>
                          <Typography>
                            {driverInfo.vehicle_make || 'N/A'} {driverInfo.vehicle_model || ''}
                            {driverInfo.vehicle_color ? ` (${driverInfo.vehicle_color})` : ''}
                            {driverInfo.license_plate ? ` - ${driverInfo.license_plate}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            )}
            
            {/* Ride Actions */}
            {ride.status === 'ACCEPTED' && (
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button 
                  variant="outlined" 
                  color="error" 
                  onClick={() => handleCancelRide(ride.id)}
                  sx={{ mr: 1 }}
                >
                  Cancel Ride
                </Button>
                {isDriver && (
                  <Button 
                    variant="contained" 
                    color="success" 
                    onClick={() => handleCompleteRide(ride.id)}
                  >
                    Mark as Completed
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
        My Trips
      </Typography>
      
      {acceptedRides.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          You don't have any booked trips yet.
          {userType === 'RIDER' ? " Try requesting a ride!" : " Wait for ride requests from riders."}
        </Alert>
      ) : (
        <Box sx={{ mt: 1 }}>
          {acceptedRides.map(ride => renderRideCard(ride))}
        </Box>
      )}
    </Container>
  );
};

export default AcceptedRides; 