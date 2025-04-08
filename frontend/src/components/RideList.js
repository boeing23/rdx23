import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Grid, 
  Alert, 
  CircularProgress, 
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import MapIcon from '@mui/icons-material/Map';
import { API_BASE_URL } from '../config';
import MapComponent from './MapComponent';

// TabPanel component for dialog tabs
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`ride-tabpanel-${index}`}
      aria-labelledby={`ride-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `ride-tab-${index}`,
    'aria-controls': `ride-tabpanel-${index}`,
  };
}

const RideList = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [tabValue, setTabValue] = useState(0);
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

  const handleOpenRideDetails = useCallback((ride) => {
    setSelectedRide(ride);
    setOpenDialog(true);
    setTabValue(0); // Reset to first tab
  }, []);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
  }, []);

  const handleTabChange = useCallback((event, newValue) => {
    setTabValue(newValue);
  }, []);

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
                      <Box sx={{ mt: { xs: 2, sm: 0 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button
                          variant="outlined"
                          color="primary"
                          onClick={() => handleOpenRideDetails(ride)}
                          sx={{ width: '100%' }}
                          startIcon={<MapIcon />}
                        >
                          View Map
                        </Button>
                        
                        {userType === 'RIDER' && (
                          <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleRequestRide(ride.id)}
                            sx={{ width: '100%' }}
                          >
                            Request
                          </Button>
                        )}
                      </Box>
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
      
      {/* Ride Details Dialog */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        {selectedRide && (
          <>
            <DialogTitle>
              Ride Details: {selectedRide.start_location} to {selectedRide.end_location}
            </DialogTitle>
            
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                variant="fullWidth"
                aria-label="ride details tabs"
              >
                <Tab
                  icon={<InfoIcon />}
                  label="Information"
                  {...a11yProps(0)}
                />
                <Tab
                  icon={<MapIcon />}
                  label="Map & Directions"
                  {...a11yProps(1)}
                />
              </Tabs>
            </Box>
            
            <DialogContent dividers>
              <TabPanel value={tabValue} index={0}>
                <Typography variant="h6" gutterBottom>
                  Route Information
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>From:</strong> {selectedRide.start_location}
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>To:</strong> {selectedRide.end_location}
                </Typography>
                
                <Typography variant="h6" gutterBottom>
                  Schedule
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Departure:</strong> {formatDateTime(selectedRide.departure_time).date} at {formatDateTime(selectedRide.departure_time).time}
                </Typography>
                
                <Typography variant="h6" gutterBottom>
                  Vehicle Information
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Available Seats:</strong> {selectedRide.available_seats}
                </Typography>
                {selectedRide.vehicle && (
                  <>
                    <Typography variant="body1" paragraph>
                      <strong>Vehicle:</strong> {selectedRide.vehicle.make} {selectedRide.vehicle.model}, {selectedRide.vehicle.color}
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>License Plate:</strong> {selectedRide.vehicle.license_plate}
                    </Typography>
                  </>
                )}
                
                <Typography variant="h6" gutterBottom>
                  Driver Information
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Driver:</strong> {selectedRide.driver_name || 'Name not available'}
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Driver Rating:</strong> {selectedRide.driver_rating ? `${selectedRide.driver_rating}/5.0` : 'Not rated yet'}
                </Typography>
              </TabPanel>
              
              <TabPanel value={tabValue} index={1}>
                <MapComponent
                  pickupLocation={selectedRide.start_location}
                  dropoffLocation={selectedRide.end_location}
                  pickupCoordinates={{
                    latitude: selectedRide.start_latitude,
                    longitude: selectedRide.start_longitude
                  }}
                  dropoffCoordinates={{
                    latitude: selectedRide.end_latitude,
                    longitude: selectedRide.end_longitude
                  }}
                  showUserLocation={true}
                />
              </TabPanel>
            </DialogContent>
            
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
              {userType === 'RIDER' && (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    handleCloseDialog();
                    handleRequestRide(selectedRide.id);
                  }}
                >
                  Request This Ride
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default RideList; 