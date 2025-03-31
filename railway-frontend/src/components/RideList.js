import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Box, Card, CardContent, Typography, Button, Grid, Alert, Chip } from '@mui/material';
import { LocationOn, AccessTime, People, DirectionsCar, Person, Email, Phone, Place } from '@mui/icons-material';
import { API_BASE_URL } from '../config';
import './RideTablet.css';

const RideList = () => {
  console.log('RideList - Component rendering');
  
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userType = localStorage.getItem('userType') || 'RIDER';
  
  console.log('RideList - Initial state:');
  console.log('  Current user type:', userType);
  console.log('  All localStorage items:', Object.keys(localStorage));
  console.log('  Token exists:', !!localStorage.getItem('token'));

  const fetchRides = async () => {
    console.log('RideList - fetchRides started');
    try {
      const token = localStorage.getItem('token');
      console.log('RideList - Token retrieved:', token ? 'Token exists' : 'No token');
      
      if (!token) {
        console.error('RideList - No token found');
        setError('Please log in to view rides');
        return;
      }

      console.log('RideList - Making API request...');
      const response = await axios.get(`${API_BASE_URL}/api/rides/rides/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('RideList - API response received:', response.status);
      console.log('RideList - Number of rides:', response.data.length);
      setRides(response.data);
    } catch (err) {
      console.error('RideList - Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        // Clear invalid token
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        // Redirect to login
        navigate('/login');
      } else {
        setError('Error fetching rides. Please try again.');
      }
    } finally {
      setLoading(false);
      console.log('RideList - fetchRides completed');
    }
  };

  useEffect(() => {
    console.log('RideList - useEffect triggered');
    fetchRides();
  }, [navigate]); // Add navigate to dependencies

  const handleRequestRide = async (rideId) => {
    navigate('/request-ride', { state: { rideId } });
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${requestId}/accept/`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      fetchRides();
    } catch (err) {
      setError('Error accepting request. Please try again.');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${requestId}/reject/`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      fetchRides();
    } catch (err) {
      setError('Error rejecting request. Please try again.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h6">Loading rides...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Available Rides
        </Typography>
        {userType === 'RIDER' && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/request-ride')}
            sx={{ mt: 2 }}
            startIcon={<DirectionsCar />}
          >
            Request New Ride
          </Button>
        )}
      </Box>
      <Grid container spacing={3}>
        {rides.map((ride) => (
          <Grid item xs={12} md={6} key={ride.id}>
            <div className="ride-tablet">
              <div className="ride-tablet-content">
                <div className="ride-details">
                  <div className="location-text">
                    <LocationOn className="location-icon" />
                    <Typography variant="subtitle1">
                      From: {ride.start_location}
                    </Typography>
                  </div>
                  <div className="location-text">
                    <LocationOn className="location-icon" />
                    <Typography variant="subtitle1">
                      To: {ride.end_location}
                    </Typography>
                  </div>
                  <div className="time-details">
                    <AccessTime className="time-icon" />
                    <Typography variant="body2">
                      {new Date(ride.departure_time).toLocaleDateString()} at {new Date(ride.departure_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </Typography>
                  </div>
                  <Box display="flex" alignItems="center">
                    <People color="primary" sx={{ mr: 1 }} />
                    <Chip 
                      label={`${ride.available_seats} seat${ride.available_seats !== 1 ? 's' : ''} available`}
                      color={ride.available_seats > 0 ? "success" : "error"}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                  {ride.price_per_seat > 0 && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Price per seat: ${ride.price_per_seat.toFixed(2)}
                    </Typography>
                  )}
                  
                  {userType === 'RIDER' && (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleRequestRide(ride.id)}
                      className="action-button"
                      fullWidth
                      startIcon={<DirectionsCar />}
                    >
                      Request Ride
                    </Button>
                  )}
                </div>

                {userType === 'DRIVER' && ride.requests && ride.requests.length > 0 && (
                  <div className="ride-requests-section">
                    <Typography variant="h6" gutterBottom>
                      Ride Requests
                    </Typography>
                    {ride.requests.map((request) => (
                      <div key={request.id} className="request-item">
                        <div>
                          <Box display="flex" alignItems="center" mb={1}>
                            <Person sx={{ mr: 1, color: "#800000" }} />
                            <Typography variant="subtitle2">
                              {request.rider_details.first_name} {request.rider_details.last_name}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" mb={0.5}>
                            <Email sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                            <Typography variant="body2">
                              {request.rider_details.email}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" mb={0.5}>
                            <Phone sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                            <Typography variant="body2">
                              {request.rider_details.phone_number}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" mb={0.5}>
                            <Place sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                            <Typography variant="body2">
                              Pickup: {request.pickup_location}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" mb={0.5}>
                            <Place sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                            <Typography variant="body2">
                              Dropoff: {request.dropoff_location}
                            </Typography>
                          </Box>
                          <Box display="flex" alignItems="center" mb={0.5}>
                            <People sx={{ mr: 1, fontSize: "0.9rem", color: "#555" }} />
                            <Typography variant="body2">
                              Seats Needed: {request.seats_needed}
                            </Typography>
                          </Box>
                          
                          {request.status === 'PENDING' && (
                            <div className="request-actions">
                              <Button
                                variant="contained"
                                color="success"
                                size="small"
                                onClick={() => handleAcceptRequest(request.id)}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="contained"
                                color="error"
                                size="small"
                                onClick={() => handleRejectRequest(request.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Grid>
        ))}
        {rides.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="h6" color="textSecondary" align="center">
              No rides available at the moment
            </Typography>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default RideList; 