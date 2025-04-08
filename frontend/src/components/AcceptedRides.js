import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  CircularProgress, 
  Alert, 
  Paper,
  Divider,
  Card,
  CardMedia,
  Avatar,
  Link
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DateRangeIcon from '@mui/icons-material/DateRange';
import MapIcon from '@mui/icons-material/Map';
import PersonIcon from '@mui/icons-material/Person';
import './RideCard.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

function AcceptedRides() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [detailedRide, setDetailedRide] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Get auth token with error handling
  const getAuthToken = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('You must be logged in to view accepted rides');
    }
    return token.replace(/^"(.*)"$/, '$1');
  }, []);

  // Function to check and complete past rides
  const completePastRides = useCallback(async () => {
    try {
      const cleanToken = getAuthToken();
      console.log('Checking for past rides to complete');
      
      await axios.post(
        `${API_BASE_URL}/api/rides/rides/complete_past_rides/`,
        {},
        {
          headers: {
            Authorization: `Token ${cleanToken}`,
          },
        }
      );
      console.log('Past rides check completed');
    } catch (error) {
      console.error('Error completing past rides:', error);
      // We don't show this error to the user
    }
  }, [getAuthToken]);

  const fetchAcceptedRides = useCallback(async () => {
    try {
      const cleanToken = getAuthToken();
      console.log('Fetching accepted rides');
      
      const response = await axios.get(
        `${API_BASE_URL}/api/rides/requests/accepted/`,
        {
          headers: {
            Authorization: `Token ${cleanToken}`,
          },
        }
      );
      console.log('Accepted rides response:', response.data);
      setRides(response.data);
      setLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error fetching accepted rides:', error);
      
      if (error.response && error.response.status === 401) {
        localStorage.removeItem('token');
        navigate('/login');
      }
      
      setError(error.message || 'Failed to load accepted rides. Please try again later.');
      setLoading(false);
    }
  }, [getAuthToken, navigate]);

  // Fetch detailed ride info when opening dialog
  const fetchRideDetails = useCallback(async (rideId) => {
    try {
      setLoadingDetails(true);
      setDetailedRide(null); // Reset to avoid showing stale data
      const cleanToken = getAuthToken();
      
      console.log(`Fetching ride details for ID ${rideId}`);
      
      const response = await axios.get(
        `${API_BASE_URL}/api/rides/requests/${rideId}/`,
        {
          headers: {
            Authorization: `Token ${cleanToken}`,
          },
        }
      );
      
      console.log('Ride details raw response:', response);
      console.log('Ride details data:', response.data);
      
      // Process the data to ensure we have a map URL
      const rideData = response.data;
      
      // Log the coordinates used for the map URL
      console.log('Pickup coordinates:', rideData.pickup_latitude, rideData.pickup_longitude);
      console.log('Dropoff coordinates:', rideData.dropoff_latitude, rideData.dropoff_longitude);
      
      // If map_url isn't provided, create a simple one
      if (!rideData.map_url && rideData.pickup_latitude && rideData.pickup_longitude 
          && rideData.dropoff_latitude && rideData.dropoff_longitude) {
        console.log('Map URL not found in API response, creating a simple one');
        rideData.map_url = `https://www.openstreetmap.org/directions?from=${rideData.pickup_latitude},${rideData.pickup_longitude}&to=${rideData.dropoff_latitude},${rideData.dropoff_longitude}`;
      }
      
      console.log('Map URL (final):', rideData.map_url);
      
      setDetailedRide(rideData);
      setLoadingDetails(false);
    } catch (error) {
      console.error('Error fetching ride details:', error);
      setError('Failed to load ride details. Please try again later.');
      setLoadingDetails(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await completePastRides();
        await fetchAcceptedRides();
      } catch (err) {
        if (err.message.includes('must be logged in')) {
          navigate('/login');
        }
        setError(err.message);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [location.search, navigate, completePastRides, fetchAcceptedRides]);

  useEffect(() => {
    if (detailedRide) {
      console.log('=== MAP URL DEBUGGING ===');
      console.log('Detailed ride loaded:', detailedRide.id);
      console.log('Map URL present:', !!detailedRide.map_url);
      if (detailedRide.map_url) {
        console.log('Map URL value:', detailedRide.map_url);
        
        // Test URL validity
        try {
          const url = new URL(detailedRide.map_url);
          console.log('Map URL is valid. Protocol:', url.protocol, 'Host:', url.host);
        } catch (error) {
          console.error('Map URL is invalid:', error.message);
        }
      } else {
        console.log('Map URL is missing, checking coordinates...');
        
        // Check if coordinates are available for a fallback URL
        const hasPickupCoords = !!(detailedRide.pickup_latitude && detailedRide.pickup_longitude);
        const hasDropoffCoords = !!(detailedRide.dropoff_latitude && detailedRide.dropoff_longitude);
        
        console.log('Has pickup coordinates:', hasPickupCoords);
        console.log('Has dropoff coordinates:', hasDropoffCoords);
        
        if (hasPickupCoords && hasDropoffCoords) {
          const fallbackUrl = `https://www.openstreetmap.org/directions?from=${detailedRide.pickup_latitude},${detailedRide.pickup_longitude}&to=${detailedRide.dropoff_latitude},${detailedRide.dropoff_longitude}`;
          console.log('Fallback URL that could be used:', fallbackUrl);
        }
      }
      console.log('=== END MAP URL DEBUGGING ===');
    }
  }, [detailedRide]);

  const handleRideAction = useCallback(async (id, action) => {
    try {
      const cleanToken = getAuthToken();
      
      await axios.post(
        `${API_BASE_URL}/api/rides/requests/${id}/${action}/`,
        {},
        {
          headers: {
            Authorization: `Token ${cleanToken}`,
          },
        }
      );

      // Close dialog if open
      if (openDialog && selectedRide && selectedRide.id === id) {
        setOpenDialog(false);
      }
      
      // Refresh rides list
      fetchAcceptedRides();
    } catch (error) {
      console.error(`Error with ride action ${action}:`, error);
      setError(`Failed to ${action} ride. Please try again later.`);
    }
  }, [getAuthToken, fetchAcceptedRides, openDialog, selectedRide]);

  const handleCancelRide = useCallback((id) => {
    handleRideAction(id, 'cancel');
  }, [handleRideAction]);

  const handleCompleteRide = useCallback((id) => {
    handleRideAction(id, 'complete');
  }, [handleRideAction]);

  const handleOpenDialog = useCallback((ride) => {
    setSelectedRide(ride);
    setOpenDialog(true);
    fetchRideDetails(ride.id);
  }, [fetchRideDetails]);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
  }, []);

  // Helper function to generate decorative header
  const generateDecorativeHeader = useCallback((status) => {
    const statusColors = {
      ACCEPTED: '#e8f5e9', // Light green
      COMPLETED: '#e3f2fd', // Light blue
      CANCELLED: '#ffebee', // Light red
    };
    
    return (
      <svg viewBox="0 0 300 150" preserveAspectRatio="none">
        <rect width="300" height="150" fill={statusColors[status] || '#f5f5f5'} />
        <path d="M0,50 Q150,100 300,50 V0 H0 Z" fill={statusColors[status] || '#f5f5f5'} opacity="0.7" />
        <path d="M0,0 Q150,100 300,0" stroke="#ffffff" strokeWidth="8" fill="none" opacity="0.3" />
      </svg>
    );
  }, []);

  // Helper function to get status icon
  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'ACCEPTED':
        return <AccessTimeIcon />;
      case 'COMPLETED':
        return <CheckCircleIcon />;
      case 'CANCELLED':
        return <CancelIcon />;
      default:
        return <DirectionsCarIcon />;
    }
  }, []);

  // Function to format date for display
  const formatDate = useCallback((dateString) => {
    const options = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  }, []);

  if (loading) {
    return (
      <Box 
        display="flex" 
        justifyContent="center" 
        alignItems="center" 
        minHeight="50vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ padding: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
        My Trips
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {rides.length === 0 ? (
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="body1" align="center">
            You don't have any accepted rides yet. Browse available rides to find a match!
          </Typography>
          <Box display="flex" justifyContent="center" mt={2}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={() => navigate('/rides')}
            >
              Find Rides
            </Button>
          </Box>
        </Paper>
      ) : (
        <div className="ride-cards-container">
          {rides.map((ride) => (
            <div 
              key={ride.id} 
              className="ride-card"
              data-status={ride.status}
            >
              <div className="ride-card__img">
                {generateDecorativeHeader(ride.status)}
              </div>
              <div className="ride-card__avatar">
                {getStatusIcon(ride.status)}
              </div>
              <h3 className="ride-card__title">
                {ride.origin_display_name} → {ride.destination_display_name}
              </h3>
              <div className="ride-card__subtitle">
                <DateRangeIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                {formatDate(ride.departure_time)}
              </div>
              <div className="ride-card__subtitle">
                <LocationOnIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                {ride.distance ? `${ride.distance.toFixed(1)} miles` : "Distance unavailable"}
              </div>
              <div className="ride-card__subtitle">
                Status: {ride.status}
              </div>

              <div className="ride-card__wrapper">
                <button 
                  className="ride-card__btn ride-card__btn-solid"
                  onClick={() => handleOpenDialog(ride)}
                >
                  Details
                </button>
                
                {ride.status === 'ACCEPTED' && (
                  <>
                    <button 
                      className="ride-card__btn ride-card__btn-cancel"
                      onClick={() => handleCancelRide(ride.id)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="ride-card__btn"
                      onClick={() => handleCompleteRide(ride.id)}
                    >
                      Complete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Ride Details Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        {selectedRide && (
          <>
            <DialogTitle>
              Trip Details
            </DialogTitle>
            <DialogContent dividers>
              {loadingDetails ? (
                <Box display="flex" justifyContent="center" my={3}>
                  <CircularProgress />
                </Box>
              ) : detailedRide ? (
                <>
                  {/* Debugging Info - will be visible only during testing */}
                  <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, fontSize: '0.8rem' }}>
                    <Typography variant="caption" component="div">
                      Debug info (temporary):
                    </Typography>
                    <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '150px' }}>
                      {JSON.stringify({
                        id: detailedRide.id,
                        hasMapUrl: !!detailedRide.map_url,
                        mapUrl: detailedRide.map_url,
                        pickup: {
                          lat: detailedRide.pickup_latitude,
                          lng: detailedRide.pickup_longitude,
                          address: detailedRide.pickup_location
                        },
                        dropoff: {
                          lat: detailedRide.dropoff_latitude,
                          lng: detailedRide.dropoff_longitude,
                          address: detailedRide.dropoff_location
                        },
                        ride: detailedRide.ride ? {
                          id: detailedRide.ride.id,
                          start: {
                            lat: detailedRide.ride.start_latitude,
                            lng: detailedRide.ride.start_longitude,
                            address: detailedRide.ride.start_location
                          },
                          end: {
                            lat: detailedRide.ride.end_latitude,
                            lng: detailedRide.ride.end_longitude,
                            address: detailedRide.ride.end_location
                          }
                        } : null,
                        hasOptimalPickup: !!detailedRide.optimal_pickup_point,
                        hasNearestDropoff: !!detailedRide.nearest_dropoff_point,
                      }, null, 2)}
                    </pre>
                  </Box>

                  {/* Map Section */}
                  <Card sx={{ mb: 3 }}>
                    <CardMedia
                      component="div"
                      sx={{ height: 400, display: 'flex', flexDirection: 'column', justifyContent: 'center', 
                            alignItems: 'center', backgroundColor: '#f5f5f5' }}
                    >
                      {console.log('Rendering map section, map_url:', detailedRide.map_url)}
                      
                      <Box sx={{ textAlign: 'center', p: 2, width: '100%' }}>
                        <Typography variant="h6" gutterBottom>
                          Trip Route
                        </Typography>
                        
                        {detailedRide.map_url ? (
                          <>
                            <Button
                              variant="contained"
                              color="primary"
                              startIcon={<MapIcon />}
                              href={detailedRide.map_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ mb: 2 }}
                              size="large"
                              onClick={(e) => {
                                console.log('Map button clicked with URL:', detailedRide.map_url);
                                // Optional: prevent default and open manually to see if there's an issue with href
                                // e.preventDefault();
                                // window.open(detailedRide.map_url, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Open Complete Route Map
                            </Button>
                            <Typography variant="caption" display="block" sx={{ mb: 2 }}>
                              View the complete route with pickup and drop-off locations
                            </Typography>
                            
                            {/* Direct Point-to-Point Route Option */}
                            <Button
                              variant="outlined"
                              color="secondary"
                              startIcon={<MapIcon />}
                              href={`https://www.openstreetmap.org/directions?from=${detailedRide.pickup_latitude},${detailedRide.pickup_longitude}&to=${detailedRide.dropoff_latitude},${detailedRide.dropoff_longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ mt: 1 }}
                              disabled={!detailedRide.pickup_latitude || !detailedRide.dropoff_latitude}
                              onClick={(e) => {
                                const directUrl = `https://www.openstreetmap.org/directions?from=${detailedRide.pickup_latitude},${detailedRide.pickup_longitude}&to=${detailedRide.dropoff_latitude},${detailedRide.dropoff_longitude}`;
                                console.log('Simple route button clicked with URL:', directUrl);
                                console.log('Coordinates used:', {
                                  pickup: [detailedRide.pickup_latitude, detailedRide.pickup_longitude],
                                  dropoff: [detailedRide.dropoff_latitude, detailedRide.dropoff_longitude]
                                });
                              }}
                            >
                              Simple Direct Route
                            </Button>
                          </>
                        ) : (
                          <>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              No map data available for the complete trip route
                            </Typography>
                            <Button
                              variant="contained"
                              color="primary"
                              startIcon={<MapIcon />}
                              href={`https://www.openstreetmap.org/directions?from=${detailedRide.pickup_latitude},${detailedRide.pickup_longitude}&to=${detailedRide.dropoff_latitude},${detailedRide.dropoff_longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              disabled={!detailedRide.pickup_latitude || !detailedRide.dropoff_latitude}
                              onClick={(e) => {
                                const directUrl = `https://www.openstreetmap.org/directions?from=${detailedRide.pickup_latitude},${detailedRide.pickup_longitude}&to=${detailedRide.dropoff_latitude},${detailedRide.dropoff_longitude}`;
                                console.log('Fallback route button clicked with URL:', directUrl);
                                console.log('Coordinates available:', {
                                  pickup: [detailedRide.pickup_latitude, detailedRide.pickup_longitude],
                                  dropoff: [detailedRide.dropoff_latitude, detailedRide.dropoff_longitude]
                                });
                              }}
                            >
                              View Direct Route
                            </Button>
                          </>
                        )}

                        {/* Display coordinate info to help troubleshoot */}
                        <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1, textAlign: 'left' }}>
                          <Typography variant="caption" component="div" sx={{ mb: 1 }}>
                            Route coordinates:
                          </Typography>
                          <Typography variant="caption" component="div">
                            Pickup: {detailedRide.pickup_latitude}, {detailedRide.pickup_longitude}
                          </Typography>
                          <Typography variant="caption" component="div">
                            Dropoff: {detailedRide.dropoff_latitude}, {detailedRide.dropoff_longitude}
                          </Typography>
                        </Box>
                      </Box>
                    </CardMedia>
                  </Card>
                  
                  {/* Route Information */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Route
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>From:</strong> {detailedRide.pickup_location}
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>To:</strong> {detailedRide.dropoff_location}
                    </Typography>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Trip Schedule */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Schedule
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>Departure:</strong> {formatDate(detailedRide.departure_time)}
                    </Typography>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Driver Information (if available) */}
                  {detailedRide.ride && detailedRide.ride.driver && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="h6" gutterBottom>
                        Driver Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Avatar sx={{ mr: 2 }}>
                          <PersonIcon />
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle1">
                            {detailedRide.ride.driver.username || 'Driver Name'}
                          </Typography>
                          {detailedRide.ride.driver.email && (
                            <Typography variant="body2" color="text.secondary">
                              {detailedRide.ride.driver.email}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      
                      {detailedRide.ride.vehicle && (
                        <Typography variant="body2" paragraph>
                          <strong>Vehicle:</strong> {detailedRide.ride.vehicle.make} {detailedRide.ride.vehicle.model}
                        </Typography>
                      )}
                    </Box>
                  )}
                  
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Trip Details */}
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Trip Information
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>Status:</strong> {detailedRide.status}
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>Seats:</strong> {detailedRide.seats_needed || 1}
                    </Typography>
                    <Typography variant="body1" paragraph>
                      <strong>Created:</strong> {formatDate(detailedRide.created_at)}
                    </Typography>
                  </Box>
                </>
              ) : (
                <Typography variant="body1" align="center">
                  Failed to load ride details. Please try again.
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
              
              {selectedRide.status === 'ACCEPTED' && (
                <>
                  <Button 
                    color="error" 
                    onClick={() => handleCancelRide(selectedRide.id)}
                  >
                    Cancel Trip
                  </Button>
                  <Button 
                    color="primary" 
                    variant="contained"
                    onClick={() => handleCompleteRide(selectedRide.id)}
                  >
                    Mark as Complete
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default AcceptedRides; 