import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Chip,
  Alert,
  Button,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import { Schedule, LocationOn, Person, Phone, Email, Event, AccessTime, Cancel, CheckCircle, DirectionsCar, Refresh } from '@mui/icons-material';
import { API_BASE_URL } from '../config';
import { format } from 'date-fns';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});

const DriverAcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [openCompleteDialog, setOpenCompleteDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchAcceptedRides = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please log in to view your trips');
        setLoading(false);
        return;
      }

      // Clean the token (remove quotes or spaces)
      const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1');
      
      // Add a timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
      
      try {
        console.log(`Fetching accepted rides from: ${API_BASE_URL}/api/rides/accepted/`);
        
        const response = await fetch(`${API_BASE_URL}/api/rides/accepted/`, {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        // Handle common status codes
        if (response.status === 404) {
          console.log('No rides endpoint found (404) - user may have no trips yet');
          setAcceptedRides([]);
          setLoading(false);
          setError('');
          return;
        } 
        else if (response.status === 401) {
          console.log('Authentication failed (401) - token may be expired');
          localStorage.removeItem('token'); // Clear invalid token
          setError('Your session has expired. Please log in again.');
          setLoading(false);
          return;
        }
        else if (response.status === 403) {
          console.log('Permission denied (403) - user may not have driver role');
          setAcceptedRides([]);
          setError('You do not have permission to view trips. Please ensure you are registered as a driver.');
          setLoading(false);
          return;
        }
        else if (response.status === 500) {
          console.error('Server error (500) - backend issue');
          setError('The server encountered an error. Our team has been notified. Please try again later.');
          setLoading(false);
          return;
        }
        else if (!response.ok) {
          // For any other non-successful response
          console.error(`API response error: ${response.status} ${response.statusText}`);
          
          // Try to get error details from response
          let errorMessage = `Failed to fetch accepted rides: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.detail || errorData.message) {
              errorMessage = `Error: ${errorData.detail || errorData.message}`;
            }
          } catch (e) {
            // If JSON parsing fails, use the status text
            errorMessage = `Failed to fetch accepted rides: ${response.status} ${response.statusText}`;
          }
          
          setError(errorMessage);
          setLoading(false);
          return;
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
          console.error('Expected array but got:', typeof data, data);
          setError('Received invalid data format from the server');
          setAcceptedRides([]);
          setLoading(false);
          return;
        }
        
        // Log details of the first ride to see its structure
        if (data.length > 0) {
          console.log('Sample accepted ride data:', data[0]);
          console.log('Available fields:', Object.keys(data[0]));
          console.log('Coordinate fields present:', {
            pickup_latitude: 'pickup_latitude' in data[0],
            pickup_longitude: 'pickup_longitude' in data[0],
            dropoff_latitude: 'dropoff_latitude' in data[0],
            dropoff_longitude: 'dropoff_longitude' in data[0]
          });
        }
        
        // Process rides to ensure coordinate fields are properly mapped
        const processedRides = data.map(ride => {
          // Log the ride data structure to debug driver info
          console.log(`Processing ride ${ride.id}:`, {
            ride_driver: ride.ride?.driver,
            driver_field: ride.driver,
            driver_id_field: ride.driver_id,
            has_rider: !!ride.rider
          });
          
          // Return a new object with all existing properties plus any needed mapping
          return {
            ...ride,
            // Make sure coordinate fields are properly handled
            pickup_latitude: ride.pickup_latitude || (ride.optimal_pickup_point ? ride.optimal_pickup_point.latitude : null),
            pickup_longitude: ride.pickup_longitude || (ride.optimal_pickup_point ? ride.optimal_pickup_point.longitude : null),
            dropoff_latitude: ride.dropoff_latitude || (ride.nearest_dropoff_point ? ride.nearest_dropoff_point.latitude : null),
            dropoff_longitude: ride.dropoff_longitude || (ride.nearest_dropoff_point ? ride.nearest_dropoff_point.longitude : null),
            // Ensure driver data is properly mapped
            driver_id: ride.driver_id || (ride.ride && ride.ride.driver) || null
          };
        });
        
        // Sort rides by departure time (most recent first)
        const sortedRides = processedRides.sort((a, b) => 
          new Date(b.departure_time) - new Date(a.departure_time)
        );
        
        console.log(`Processed ${sortedRides.length} rides with coordinates`);
        setAcceptedRides(sortedRides);
        setError(''); // Clear any previous errors
        setLoading(false);
      } finally {
        clearTimeout(timeoutId); // Always clear the timeout
      }
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
      
      // Special handling for common errors
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your connection and try again.');
      } else if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        setError('Network error. Please check your internet connection and try again.');
      } else {
        setError(`Error: ${err.message || 'Something went wrong'}`);
      }
      
      setLoading(false);
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    fetchAcceptedRides();
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setLoading(true);
    setError('');
    fetchAcceptedRides();
  };

  const handleRideClick = (ride) => {
    console.log("Selected ride data:", {
      id: ride.id,
      status: ride.status,
      pickup_location: ride.pickup_location,
      dropoff_location: ride.dropoff_location,
      pickup_latitude: ride.pickup_latitude,
      pickup_longitude: ride.pickup_longitude,
      dropoff_latitude: ride.dropoff_latitude,
      dropoff_longitude: ride.dropoff_longitude,
      rider: ride.rider,
      ride_object: ride.ride,
      ride_driver_id: ride.ride?.driver,
      direct_driver_id: ride.driver_id,
      all_keys: Object.keys(ride)
    });
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

      fetchAcceptedRides();
    } catch (err) {
      console.error('Error completing ride:', err);
      setError('Failed to complete ride. Please try again.');
    }
  };

  const getFullName = (user) => {
    if (!user) return 'Unknown User';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Unknown User';
  };

  const getPhoneNumber = (user) => {
    return user?.phone_number || 'Not provided';
  };

  const getEmail = (user) => {
    return user?.email || 'Not provided';
  };

  const formatDate = (dateString) => {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  };

  const handleOpenCancelDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCancelDialog(true);
  };

  const handleCloseCancelDialog = () => {
    setOpenCancelDialog(false);
  };

  const handleOpenCompleteDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCompleteDialog(true);
  };

  const handleCloseCompleteDialog = () => {
    setOpenCompleteDialog(false);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ pt: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          My Trips
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
          <CircularProgress size={40} sx={{ mr: 2 }} />
          <Typography>Loading your trips...</Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom align="center">
          My Trips
        </Typography>
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <Button 
                color="inherit" 
                size="small" 
                startIcon={isRetrying ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
                onClick={handleRetry}
                disabled={isRetrying}
              >
                Retry
              </Button>
            }
          >
            {error}
          </Alert>
          <Typography variant="h5" gutterBottom>
            Unable to load your trips
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            We encountered a problem while trying to fetch your trip information. This could be due to:
          </Typography>
          <List>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Network connectivity issues" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Server maintenance" />
            </ListItem>
            <ListItem>
              <ListItemIcon><Cancel /></ListItemIcon>
              <ListItemText primary="Session timeout" />
            </ListItem>
          </List>
          <Box sx={{ mt: 2 }}>
            <Button 
              variant="contained" 
              color="primary"
              onClick={handleRetry}
              startIcon={isRetrying ? <CircularProgress size={20} color="inherit" /> : <Refresh />}
              disabled={isRetrying}
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pt: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
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
              No passengers yet? Your car is waiting!
            </Typography>
            <Typography variant="body1" gutterBottom color="text.secondary" sx={{ maxWidth: 600, mb: 3 }}>
              You haven't accepted any ride requests yet. Check out the available requests and start driving!
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => window.location.href = '/rides'}
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
              Find Passengers
            </Button>
          </Box>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* List of rides */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ maxHeight: '70vh', overflow: 'auto' }}>
              <List>
                {acceptedRides.map((ride) => (
                  <ListItem
                    key={ride.id}
                    button
                    selected={selectedRide?.id === ride.id}
                    onClick={() => handleRideClick(ride)}
                  >
                    <ListItemIcon>
                      <Avatar>
                        <Person />
                      </Avatar>
                    </ListItemIcon>
                    <ListItemText
                      primary={getFullName(ride.rider)}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {formatDate(ride.departure_time)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {ride.pickup_location} → {ride.dropoff_location}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      {getStatusChip(ride.status)}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          {/* Ride details */}
          <Grid item xs={12} md={8}>
            {selectedRide ? (
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Ride Details</Typography>
                    {selectedRide.status === 'ACCEPTED' && (
                      <Box>
                        <Button
                          variant="outlined"
                          color="error"
                          startIcon={<Cancel />}
                          onClick={() => handleOpenCancelDialog(selectedRide)}
                          sx={{ mr: 1 }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<CheckCircle />}
                          onClick={() => handleOpenCompleteDialog(selectedRide)}
                        >
                          Complete
                        </Button>
                      </Box>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom>
                        Passenger Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Person sx={{ mr: 1 }} />
                        <Typography>{getFullName(selectedRide.rider)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Phone sx={{ mr: 1 }} />
                        <Typography>{getPhoneNumber(selectedRide.rider)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Email sx={{ mr: 1 }} />
                        <Typography>{getEmail(selectedRide.rider)}</Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom>
                        Trip Details
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <LocationOn sx={{ mr: 1 }} />
                        <Typography>Pickup: {selectedRide.pickup_location}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <LocationOn sx={{ mr: 1 }} />
                        <Typography>Dropoff: {selectedRide.dropoff_location}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Event sx={{ mr: 1 }} />
                        <Typography>Date: {formatDate(selectedRide.departure_time)}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Schedule sx={{ mr: 1 }} />
                        <Typography>Seats: {selectedRide.seats_needed}</Typography>
                      </Box>
                    </Grid>

                    {/* Add Route Map */}
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom>
                        Route Map
                      </Typography>
                      <Box sx={{ height: '250px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                        {(() => {
                          // Log available coordinates for debugging
                          console.log("Ride coordinates:", {
                            pickup_lat: selectedRide.pickup_latitude,
                            pickup_lng: selectedRide.pickup_longitude,
                            dropoff_lat: selectedRide.dropoff_latitude,
                            dropoff_lng: selectedRide.dropoff_longitude
                          });
                          
                          // Use direct coordinate fields if available, otherwise fallback to extraction or defaults
                          const pickupCoords = [
                            selectedRide.pickup_latitude || 37.2284, 
                            selectedRide.pickup_longitude || -80.4234
                          ];
                          const dropoffCoords = [
                            selectedRide.dropoff_latitude || 37.2384, 
                            selectedRide.dropoff_longitude || -80.4134
                          ];
                          
                          // If direct coordinates aren't available, try to extract from location text
                          if (!selectedRide.pickup_latitude || !selectedRide.pickup_longitude) {
                            try {
                              const pickupMatch = selectedRide.pickup_location.match(/\(?\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)?/);
                              if (pickupMatch) {
                                pickupCoords[0] = parseFloat(pickupMatch[1]);
                                pickupCoords[1] = parseFloat(pickupMatch[2]);
                              }
                            } catch (e) {
                              console.error("Error parsing pickup coordinates:", e);
                            }
                          }
                          
                          if (!selectedRide.dropoff_latitude || !selectedRide.dropoff_longitude) {
                            try {
                              const dropoffMatch = selectedRide.dropoff_location.match(/\(?\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\)?/);
                              if (dropoffMatch) {
                                dropoffCoords[0] = parseFloat(dropoffMatch[1]);
                                dropoffCoords[1] = parseFloat(dropoffMatch[2]);
                              }
                            } catch (e) {
                              console.error("Error parsing dropoff coordinates:", e);
                            }
                          }
                          
                          // Calculate center position
                          const centerLat = (pickupCoords[0] + dropoffCoords[0]) / 2;
                          const centerLng = (pickupCoords[1] + dropoffCoords[1]) / 2;
                          
                          return (
                            <MapContainer 
                              center={[centerLat, centerLng]} 
                              zoom={13} 
                              style={{ height: '100%', width: '100%' }}
                            >
                              <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              />
                              <Marker position={pickupCoords}>
                                <Popup>Pickup: {selectedRide.pickup_location}</Popup>
                              </Marker>
                              <Marker position={dropoffCoords}>
                                <Popup>Dropoff: {selectedRide.dropoff_location}</Popup>
                              </Marker>
                              <Polyline 
                                positions={[pickupCoords, dropoffCoords]}
                                color="#861F41"
                                weight={4}
                              />
                            </MapContainer>
                          );
                        })()}
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ) : (
              <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography>Select a ride to view details</Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {/* Cancel Dialog */}
      <Dialog open={openCancelDialog} onClose={handleCloseCancelDialog}>
        <DialogTitle>Cancel Ride</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to cancel this ride? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCancelDialog}>No, Keep It</Button>
          <Button
            onClick={() => {
              handleCancelRide(selectedRide.id);
              handleCloseCancelDialog();
            }}
            color="error"
            variant="contained"
          >
            Yes, Cancel It
          </Button>
        </DialogActions>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={openCompleteDialog} onClose={handleCloseCompleteDialog}>
        <DialogTitle>Complete Ride</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to mark this ride as completed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCompleteDialog}>No, Keep It</Button>
          <Button
            onClick={() => {
              handleCompleteRide(selectedRide.id);
              handleCloseCompleteDialog();
            }}
            color="primary"
            variant="contained"
          >
            Yes, Complete It
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default DriverAcceptedRides; 