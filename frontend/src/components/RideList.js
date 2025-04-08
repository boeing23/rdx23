import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Box, Card, CardContent, Typography, Button, Grid, Alert } from '@mui/material';
import { API_BASE_URL } from '../config';

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
        setLoading(false);
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      console.log('RideList - Token format check:', cleanToken.substring(0, 10) + '...');

      console.log('RideList - Making API request...');
      const response = await axios.get(`${API_BASE_URL}/api/rides/rides/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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
        localStorage.removeItem('userId');
        // Dispatch event for navbar update
        window.dispatchEvent(new Event('auth-change'));
        // Redirect to login after a short delay
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setError('Error fetching rides. Please try again.');
      }
    } finally {
      setLoading(false);
      console.log('RideList - fetchRides completed');
    }
  };

  const completePastRides = async () => {
    console.log('RideList - Checking for past rides to complete');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('RideList - No token found, skipping past rides check');
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      // Call the endpoint to complete past rides
      const response = await axios.post(
        `${API_BASE_URL}/api/rides/rides/complete_past_rides/`, 
        {}, 
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('RideList - Past rides completion check:', response.data);
    } catch (err) {
      console.error('RideList - Error completing past rides:', err);
      // Don't show an error to the user, just log it
    }
  };

  useEffect(() => {
    console.log('RideList - useEffect triggered');
    // First complete past rides, then fetch the updated list
    completePastRides().then(() => fetchRides());
  }, [navigate]); // Add navigate to dependencies

  const handleRequestRide = async (rideId) => {
    navigate('/request-ride', { state: { rideId } });
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to accept requests');
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${requestId}/accept/`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      fetchRides();
    } catch (err) {
      console.error('Error accepting request:', err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('userId');
        window.dispatchEvent(new Event('auth-change'));
      } else {
        setError('Error accepting request. Please try again.');
      }
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to reject requests');
        return;
      }

      // Clean token format
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');

      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${requestId}/reject/`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      fetchRides();
    } catch (err) {
      console.error('Error rejecting request:', err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('userId');
        window.dispatchEvent(new Event('auth-change'));
      } else {
        setError('Error rejecting request. Please try again.');
      }
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
      <div className="flex justify-between items-center mb-6">
        <Typography variant="h4" gutterBottom>
          Available Rides
        </Typography>
        {userType === 'RIDER' && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/request-ride')}
            sx={{ mt: 2 }}
          >
            Request New Ride
          </Button>
        )}
      </div>
      <Grid container spacing={3}>
        {rides.map((ride) => (
          <Grid item xs={12} md={6} key={ride.id}>
            <Card>
              <CardContent>
                <div className="flex flex-col sm:flex-row justify-between items-start">
                  <div className="w-full sm:w-auto">
                    <Typography variant="h6">
                      From: {ride.start_location}
                    </Typography>
                    <Typography variant="h6">
                      To: {ride.end_location}
                    </Typography>
                    <Typography color="textSecondary">
                      Date: {new Date(ride.departure_time).toLocaleDateString()}
                    </Typography>
                    <Typography color="textSecondary">
                      Time: {new Date(ride.departure_time).toLocaleTimeString()}
                    </Typography>
                    <Typography color="textSecondary">
                      Available Seats: {ride.available_seats}
                    </Typography>
                  </div>
                  {userType === 'RIDER' && (
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleRequestRide(ride.id)}
                      sx={{ mt: 2, width: { xs: '100%', sm: 'auto' } }}
                    >
                      Request Ride
                    </Button>
                  )}
                </div>

                {userType === 'DRIVER' && ride.requests && ride.requests.length > 0 && (
                  <div className="mt-4">
                    <Typography variant="h6" gutterBottom>
                      Ride Requests
                    </Typography>
                    {ride.requests.map((request) => (
                      <div key={request.id} className="border-t pt-4 mt-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start">
                          <div className="w-full sm:w-auto">
                            <Typography variant="body1">
                              Rider: {request.rider_details.first_name} {request.rider_details.last_name}
                            </Typography>
                            <Typography variant="body2">
                              Email: {request.rider_details.email}
                            </Typography>
                            <Typography variant="body2">
                              Phone: {request.rider_details.phone_number}
                            </Typography>
                            <Typography variant="body2">
                              Pickup: {request.pickup_location}
                            </Typography>
                            <Typography variant="body2">
                              Dropoff: {request.dropoff_location}
                            </Typography>
                            <Typography variant="body2">
                              Seats Needed: {request.seats_needed}
                            </Typography>
                          </div>
                          {request.status === 'PENDING' && (
                            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-2 sm:mt-0">
                              <Button
                                variant="contained"
                                color="success"
                                onClick={() => handleAcceptRequest(request.id)}
                                sx={{ width: { xs: '100%', sm: 'auto' } }}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="contained"
                                color="error"
                                onClick={() => handleRejectRequest(request.id)}
                                sx={{ width: { xs: '100%', sm: 'auto' } }}
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
              </CardContent>
            </Card>
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