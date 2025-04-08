import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Box, Card, CardContent, Typography, Button, Grid, Alert, CircularProgress } from '@mui/material';
import { API_BASE_URL } from '../config';

const RideList = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userType = localStorage.getItem('userType') || 'RIDER';
  
  const getAuthToken = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }
    // Clean token format
    return token.trim().replace(/^["'](.*)["']$/, '$1');
  }, []);

  const handleAuthError = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    // Dispatch event for navbar update
    window.dispatchEvent(new Event('auth-change'));
    // Redirect to login after a short delay
    setTimeout(() => {
      navigate('/login');
    }, 1000);
  }, [navigate]);

  const completePastRides = useCallback(async () => {
    try {
      const cleanToken = getAuthToken();
      
      // Call the endpoint to complete past rides
      await axios.post(
        `${API_BASE_URL}/api/rides/rides/complete_past_rides/`, 
        {}, 
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (err) {
      console.error('Error completing past rides:', err);
      // Don't show this error to the user, just log it
    }
  }, [getAuthToken]);

  const fetchRides = useCallback(async () => {
    try {
      const cleanToken = getAuthToken();

      const response = await axios.get(`${API_BASE_URL}/api/rides/rides/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      setRides(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching rides:', err);
      
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        handleAuthError();
      } else if (err.message === 'No authentication token found') {
        setError('Please log in to view rides');
        navigate('/login');
      } else {
        setError('Error fetching rides. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [getAuthToken, handleAuthError, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await completePastRides();
        await fetchRides();
      } catch (err) {
        console.error('Error in useEffect:', err);
        setLoading(false);
        if (err.message === 'No authentication token found') {
          setError('Please log in to view rides');
          navigate('/login');
        }
      }
    };
    
    fetchData();
  }, [navigate, completePastRides, fetchRides]);

  const handleRequestRide = useCallback((rideId) => {
    navigate('/request-ride', { state: { rideId } });
  }, [navigate]);

  const handleRideAction = useCallback(async (requestId, action) => {
    try {
      const cleanToken = getAuthToken();

      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${requestId}/${action}/`,
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
      console.error(`Error with ${action} request:`, err);
      if (err.response?.status === 401) {
        setError('Your session has expired. Please log in again.');
        handleAuthError();
      } else {
        setError(`Error ${action === 'accept' ? 'accepting' : 'rejecting'} request. Please try again.`);
      }
    }
  }, [getAuthToken, fetchRides, handleAuthError]);

  const handleAcceptRequest = useCallback((requestId) => {
    handleRideAction(requestId, 'accept');
  }, [handleRideAction]);

  const handleRejectRequest = useCallback((requestId) => {
    handleRideAction(requestId, 'reject');
  }, [handleRideAction]);

  const formatDateTime = useCallback((dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }, []);

  if (loading) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
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
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {rides.length === 0 ? (
        <Box sx={{ textAlign: 'center', p: 3, bgcolor: 'background.paper', borderRadius: 2 }}>
          <Typography variant="body1" gutterBottom>
            No rides available at this time.
          </Typography>
          {userType === 'DRIVER' && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/offer-ride')}
              sx={{ mt: 2 }}
            >
              Offer a Ride
            </Button>
          )}
        </Box>
      ) : (
        <Grid container spacing={3}>
          {rides.map((ride) => {
            const { date, time } = formatDateTime(ride.departure_time);
            return (
              <Grid item xs={12} md={6} key={ride.id}>
                <Card sx={{ 
                  '&:hover': { 
                    boxShadow: 6,
                    transform: 'translateY(-2px)',
                    transition: 'transform 0.3s ease, box-shadow 0.3s ease'
                  }
                }}>
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
                          Date: {date}
                        </Typography>
                        <Typography color="textSecondary">
                          Time: {time}
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
                          sx={{ mt: { xs: 2, sm: 0 }, alignSelf: { sm: 'flex-start' } }}
                        >
                          Request
                        </Button>
                      )}
                    </div>
                    
                    {ride.ride_requests && ride.ride_requests.length > 0 && userType === 'DRIVER' && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle1" gutterBottom>
                          Ride Requests:
                        </Typography>
                        {ride.ride_requests.map((request) => (
                          <Box key={request.id} sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                            <Typography variant="body2">
                              Rider: {request.rider_name || 'Anonymous'}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                onClick={() => handleAcceptRequest(request.id)}
                              >
                                Accept
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => handleRejectRequest(request.id)}
                              >
                                Reject
                              </Button>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
};

export default RideList; 