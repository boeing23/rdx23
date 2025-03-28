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
    const driverInfo = ride.driver_details || {};
    const isDriver = userType === 'DRIVER';

    // Helper function to get full name
    const getFullName = (user) => {
      if (!user) return 'N/A';
      const firstName = user.first_name || '';
      const lastName = user.last_name || '';
      return `${firstName} ${lastName}`.trim() || 'N/A';
    };

    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="h6" gutterBottom>Ride Details</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography>
                  <strong>From:</strong> {ride.start_location}
                </Typography>
                <Typography>
                  <strong>To:</strong> {ride.end_location}
                </Typography>
                <Typography>
                  <strong>Date:</strong> {new Date(ride.departure_time).toLocaleDateString()}
                </Typography>
                <Typography>
                  <strong>Time:</strong> {new Date(ride.departure_time).toLocaleTimeString()}
                </Typography>
                <Typography>
                  <strong>Status:</strong> {ride.status}
                </Typography>
              </Box>
            </Box>

            {!isDriver ? (
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
                      {driverInfo.vehicle_year} {driverInfo.vehicle_make} {driverInfo.vehicle_model} 
                      {driverInfo.vehicle_color ? ` (${driverInfo.vehicle_color})` : ''}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography variant="subtitle1" gutterBottom>Rider Details</Typography>
                {ride.requests?.map((request) => (
                  <Box key={request.id} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography>
                        <strong>Name:</strong> {getFullName(request.rider_details)}
                      </Typography>
                      <Typography>
                        <strong>Email:</strong> {request.rider_details.email}
                      </Typography>
                      <Typography>
                        <strong>Phone:</strong> {request.rider_details.phone_number}
                      </Typography>
                      <Typography>
                        <strong>Pickup:</strong> {request.pickup_location}
                      </Typography>
                      <Typography>
                        <strong>Dropoff:</strong> {request.dropoff_location}
                      </Typography>
                      <Typography>
                        <strong>Seats:</strong> {request.seats_needed}
                      </Typography>
                    </Box>
                  </Box>
                ))}
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