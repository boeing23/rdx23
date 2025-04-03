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
import { Schedule, DirectionsCar, LocationOn, Person, Phone, Email, Event } from '@mui/icons-material';
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
      
      // Use the correct endpoint with detailed information
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/?include_details=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch accepted rides');
      }

      const data = await response.json();
      console.log('Fetched accepted rides:', data);
      
      // Fetch additional driver information if needed
      const ridesWithDetails = await Promise.all(data.map(async (ride) => {
        // If this request already has driver_details, use them
        if (ride.driver_details && Object.keys(ride.driver_details).length > 0) {
          console.log(`Ride ${ride.id} already has driver details:`, ride.driver_details);
          return ride;
        }

        // Otherwise, fetch the driver details
        if (ride.driver_id || (ride.ride && ride.ride.driver)) {
          const driverId = ride.driver_id || (ride.ride && ride.ride.driver);
          console.log(`Fetching details for driver ${driverId}`);
          
          try {
            const driverResponse = await fetch(`${API_BASE_URL}/api/users/drivers/${driverId}/`, {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            
            if (driverResponse.ok) {
              const driverData = await driverResponse.json();
              console.log(`Driver details for ${driverId}:`, driverData);
              return { ...ride, driver_details: driverData };
            }
          } catch (err) {
            console.error(`Error fetching driver ${driverId} details:`, err);
          }
        }
        
        return ride;
      }));
      
      // Log detailed information about each ride
      ridesWithDetails.forEach((ride, index) => {
        console.log(`Ride ${index + 1}:`, {
          id: ride.id,
          status: ride.status,
          rider: ride.rider,
          ride: ride.ride,
          pickup: ride.pickup_location,
          dropoff: ride.dropoff_location,
          departure: ride.departure_time,
          seats: ride.seats_needed,
          driver_details: ride.driver_details
        });
      });
      
      // Sort rides by departure time (most recent first)
      const sortedRides = ridesWithDetails.sort((a, b) => 
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

  // Fetch rides when component mounts and when location changes
  useEffect(() => {
    console.log('AcceptedRides - Fetching rides due to mount or location change');
    fetchAcceptedRides();
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
    // Extract driver details from the ride object
    const driverInfo = ride.driver_details || 
                      (ride.ride && ride.ride.driver_details) || {};
    
    // Get ride data from either the ride object or the ride.ride object
    const rideData = ride.ride || ride;
    
    const isDriver = userType === 'DRIVER';
    console.log('Rendering ride card with data:', { ride, driverInfo, isDriver });

    // Helper function to get full name
    const getFullName = (user) => {
      if (!user) return 'N/A';
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      return `${firstName} ${lastName}`.trim() || 'N/A';
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
    
    // Determine locations
    const startLocation = rideData.start_location || ride.pickup_location || 'N/A';
    const endLocation = rideData.end_location || ride.dropoff_location || 'N/A';

    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="h6" gutterBottom>Ride Details</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography>
                  <LocationOn color="primary" sx={{ mr: 1, verticalAlign: 'text-bottom' }} />
                  <strong>From:</strong> {startLocation}
                </Typography>
                <Typography>
                  <LocationOn color="primary" sx={{ mr: 1, verticalAlign: 'text-bottom' }} />
                  <strong>To:</strong> {endLocation}
                </Typography>
                <Typography>
                  <Event color="primary" sx={{ mr: 1, verticalAlign: 'text-bottom' }} />
                  <strong>Date:</strong> {dateTime.date}
                </Typography>
                <Typography>
                  <Schedule color="primary" sx={{ mr: 1, verticalAlign: 'text-bottom' }} />
                  <strong>Time:</strong> {dateTime.time}
                </Typography>
                <Typography>
                  <strong>Status:</strong> {getStatusChip(ride.status)}
                </Typography>
              </Box>
            </Box>

            {!isDriver && (
              <Box>
                <Typography variant="subtitle1" gutterBottom>Driver Details</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person sx={{ color: 'primary.main' }} />
                    <Typography>{getFullName(driverInfo)}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Email sx={{ color: 'primary.main' }} />
                    <Typography>{driverInfo.email || 'N/A'}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Phone sx={{ color: 'primary.main' }} />
                    <Typography>{driverInfo.phone_number || 'N/A'}</Typography>
                  </Box>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DirectionsCar sx={{ color: 'primary.main' }} />
                    <Typography>
                      {driverInfo.vehicle_make || 'N/A'} {driverInfo.vehicle_model || ''}
                      {driverInfo.vehicle_color ? ` (${driverInfo.vehicle_color})` : ''}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
            
            {/* Ride Actions */}
            {ride.status === 'ACCEPTED' && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
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
    <Container>
      <Typography variant="h4" gutterBottom sx={{ mt: 3 }}>
        My Trips
      </Typography>
      
      {acceptedRides.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          You don't have any booked trips yet.
          {userType === 'RIDER' ? " Try requesting a ride!" : " Wait for ride requests from riders."}
        </Alert>
      ) : (
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {acceptedRides.map(ride => renderRideCard(ride))}
        </Grid>
      )}
    </Container>
  );
};

export default AcceptedRides; 