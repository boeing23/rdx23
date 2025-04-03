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
import { Schedule, LocationOn, Person, Phone, Email, Event, AccessTime, Cancel, Refresh, DirectionsCar, DriveEta } from '@mui/icons-material';
import { API_BASE_URL } from '../config';
import { format } from 'date-fns';

const RiderAcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryable, setRetryable] = useState(false);

  const fetchAcceptedRides = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching accepted rides...');
      const token = localStorage.getItem('token');
      
      // Log token info for debugging (without exposing full token)
      if (token) {
        console.log(`Token available (length: ${token.length})`);
      } else {
        console.error('No token available for fetch');
      }
      
      // First make a test request to check server status
      try {
        console.log('Testing server connection...');
        const pingResponse = await fetch(`${API_BASE_URL}/api/rides/`);
        console.log(`Server health check status: ${pingResponse.status}`);
      } catch (pingError) {
        console.warn('Server health check failed:', pingError.message);
      }
      
      // Clean the token to ensure proper formatting
      const cleanToken = token ? token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '') : '';
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        // Try to get more detailed error information
        let errorDetail = '';
        try {
          const errorResponse = await response.text();
          console.error('Error response:', errorResponse);
          
          // Check if the error might be related to optimal_pickup_point
          if (errorResponse.includes('optimal_pickup_point')) {
            console.error('Error appears to be related to optimal_pickup_point field');
            errorDetail = ' (Database schema issue detected)';
            throw new Error('Database schema error: optimal_pickup_point field');
          }
          
          // Try to parse as JSON if possible
          try {
            const errorJson = JSON.parse(errorResponse);
            console.error('Error details:', errorJson);
            errorDetail = errorJson.detail || errorJson.message || errorJson.error_details
              ? ` - ${errorJson.detail || errorJson.message || errorJson.error_details}`
              : '';
          } catch (e) {
            // Not JSON, use text
            errorDetail = errorResponse ? ` - ${errorResponse.substring(0, 100)}...` : '';
          }
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
        }
        
        if (response.status === 500) {
          throw new Error(`Server error (500)${errorDetail}`);
        } else if (response.status === 401) {
          throw new Error('Authentication error - please log in again');
        } else {
          throw new Error(`Error ${response.status}${errorDetail}`);
        }
      }
      
      const data = await response.json();
      console.log('Accepted rides data (full):', JSON.stringify(data));
      console.log('First ride structure:', data.length > 0 ? Object.keys(data[0]) : 'No rides');
      if (data.length > 0) {
        console.log('Has ride_details?', data[0].hasOwnProperty('ride_details'));
        console.log('Has ride?', data[0].hasOwnProperty('ride'));
        if (data[0].ride) {
          console.log('Direct ride object fields:', Object.keys(data[0].ride));
        }
        if (data[0].ride_details) {
          console.log('ride_details fields:', Object.keys(data[0].ride_details));
          console.log('Has driver in ride_details?', data[0].ride_details.hasOwnProperty('driver'));
          if (data[0].ride_details.driver) {
            console.log('Driver fields in ride_details:', Object.keys(data[0].ride_details.driver));
          }
        }
      }
      
      // Process the data based on format
      // The backend might return a simplified format if there were serialization issues
      if (data.length > 0) {
        if (data[0].hasOwnProperty('ride_details')) {
          // Standard format
          console.log('Received standard ride request format');
          setAcceptedRides(data);
          if (data.length > 0) {
            setSelectedRide(data[0]);
          }
        } else if (data[0].hasOwnProperty('ride_id')) {
          // Simplified fallback format
          console.log('Received simplified fallback format');
          // Map the simplified data to a format that works with our UI
          const mappedData = data.map(item => ({
            id: item.id,
            status: item.status,
            pickup_location: item.pickup_location,
            dropoff_location: item.dropoff_location,
            departure_time: new Date(item.departure_time),
            seats_needed: item.seats_needed,
            ride: item.ride || null, // Keep this for backward compatibility
            rider: {
              name: item.rider_name
            },
            ride_details: {
              id: item.ride_id,
              driver: {
                first_name: item.driver_name?.split(' ')[0] || '',
                last_name: item.driver_name?.split(' ')[1] || '',
                email: item.driver_email || '',
                phone_number: item.driver_phone || '',
                vehicle_make: item.vehicle_make || '',
                vehicle_model: item.vehicle_model || '',
                vehicle_color: item.vehicle_color || '',
                license_plate: item.license_plate || ''
              }
            }
          }));
          
          console.log('Mapped data (first item):', mappedData.length > 0 ? mappedData[0] : 'No rides');
          setAcceptedRides(mappedData);
          if (mappedData.length > 0) {
            setSelectedRide(mappedData[0]);
          }
        } else {
          console.error('Unknown data format received:', data);
          setError('Received unexpected data format from server');
        }
      } else {
        // Empty array - no rides
        setAcceptedRides([]);
        setSelectedRide(null);
      }
    } catch (error) {
      console.error('Error fetching accepted rides:', error);
      
      // Set a more detailed error message
      if (error.message.includes('Database schema error')) {
        setError('Server is being updated. Please try again later.');
      } else {
        setError(`Failed to load rides: ${error.message}`);
      }
      
      // If the error might be fixable with a retry, set retryable flag
      setRetryable(true);
    } finally {
      setLoading(false);
    }
  };

  // Add this function to help explore available API endpoints
  const exploreApiEndpoints = async (token) => {
    if (!token) return;
    
    const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
    const headers = {
      'Authorization': `Bearer ${cleanToken}`,
      'Content-Type': 'application/json'
    };
    
    try {
      // Check the API root
      console.log('Exploring API endpoints...');
      const rootResponse = await fetch(`${API_BASE_URL}/api/`, { headers });
      if (rootResponse.ok) {
        const rootData = await rootResponse.json();
        console.log('API root endpoints:', rootData);
      }
      
      // Check users endpoint
      const usersResponse = await fetch(`${API_BASE_URL}/api/users/`, { headers });
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        console.log('Users API response:', usersData);
        
        // If we have user objects, check the first one's structure
        if (Array.isArray(usersData) && usersData.length > 0) {
          console.log('Example user object structure:', Object.keys(usersData[0]));
        }
      }
    } catch (error) {
      console.error('Error exploring API:', error);
    }
  };

  // Add this to the useEffect to explore API on component mount
  useEffect(() => {
    fetchAcceptedRides();
    
    // Also explore available API endpoints for debugging
    const token = localStorage.getItem('token');
    if (token) {
      exploreApiEndpoints(token);
    }
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    setLoading(true);
    setError('');
    fetchAcceptedRides();
  };

  const handleRideClick = async (ride) => {
    // Log the ride structure to understand what we're working with
    console.log('Selected ride details:', ride);
    console.log('Ride structure:', {
      hasRideDetails: !!ride.ride_details,
      hasDriver: !!(ride.ride_details?.driver),
      driverInfo: ride.ride_details?.driver,
      hasRideProperty: !!ride.ride,
      rideDriverInfo: ride.ride?.driver
    });
    
    setSelectedRide(ride);
    
    // Get the driver info
    const driverInfo = getDriverInfo(ride);
    console.log('Driver info from getDriverInfo:', driverInfo);
    
    // Check if we need to fetch complete driver details
    const needsDriverDetails = driverInfo && 
      (driverInfo.id || driverInfo.username) && 
      (!driverInfo.vehicle_make || !driverInfo.vehicle_model || !driverInfo.phone_number);
    
    if (needsDriverDetails) {
      try {
        // Show loading indicator
        setLoading(true);
        
        // Get the token
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No token available for detailed fetch');
          return;
        }
        
        // Clean the token
        const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
        
        // Get driver user ID
        const driverId = driverInfo.id || driverInfo.username;
        console.log(`Fetching detailed driver data for user ${driverId}`);
        
        // Fetch user details from the users API endpoint
        const response = await fetch(`${API_BASE_URL}/api/users/${driverId}/`, {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch driver details: ${response.status}`);
        }
        
        const driverUserData = await response.json();
        console.log('Detailed driver user data:', driverUserData);
        
        // Create updated driver info with complete profile
        const completeDriverInfo = {
          ...driverInfo,
          // Add or update these fields from user data
          first_name: driverUserData.first_name || driverInfo.first_name,
          last_name: driverUserData.last_name || driverInfo.last_name,
          email: driverUserData.email || driverInfo.email,
          phone_number: driverUserData.phone_number || driverInfo.phone_number,
          vehicle_make: driverUserData.vehicle_make || driverInfo.vehicle_make,
          vehicle_model: driverUserData.vehicle_model || driverInfo.vehicle_model,
          vehicle_color: driverUserData.vehicle_color || driverInfo.vehicle_color,
          vehicle_year: driverUserData.vehicle_year || driverInfo.vehicle_year,
          license_plate: driverUserData.license_plate || driverInfo.license_plate
        };
        
        console.log('Complete driver info:', completeDriverInfo);
        
        // Update selected ride with the complete driver information
        const updatedRide = { ...ride };
        
        // Update the driver info in the appropriate place
        if (updatedRide.ride_details?.driver) {
          updatedRide.ride_details.driver = completeDriverInfo;
        } else if (updatedRide.ride?.driver) {
          updatedRide.ride.driver = completeDriverInfo;
        } else if (updatedRide.ride_details) {
          updatedRide.ride_details.driver = completeDriverInfo;
        } else {
          // Create ride_details if it doesn't exist
          updatedRide.ride_details = {
            ...(updatedRide.ride_details || {}),
            driver: completeDriverInfo
          };
        }
        
        console.log('Updated ride with complete driver info:', updatedRide);
        setSelectedRide(updatedRide);
      } catch (error) {
        console.error('Error fetching detailed driver data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    // If ride_details exists but driver info is missing or incomplete, also try fetching detailed ride data
    if (ride.ride_details && ride.ride_details.id && 
        (!ride.ride_details.driver || !ride.ride_details.driver.first_name)) {
      try {
        // Show loading indicator for the details panel
        setLoading(true);
        
        // Get the token
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No token available for detailed fetch');
          return;
        }
        
        // Clean the token
        const cleanToken = token.trim().replace(/^["'](.*)["']$/, '$1').replace(/^Bearer\s+/i, '');
        
        // Get detailed ride data
        console.log(`Fetching detailed data for ride ${ride.id}`);
        const response = await fetch(`${API_BASE_URL}/api/rides/${ride.ride_details.id}/`, {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ride details: ${response.status}`);
        }
        
        const detailedRideData = await response.json();
        console.log('Detailed ride data:', detailedRideData);
        
        // Update selected ride with more complete data
        if (detailedRideData.driver) {
          // Create a new object merging the existing ride with detailed driver data
          const updatedRide = {
            ...ride,
            ride_details: {
              ...ride.ride_details,
              driver: detailedRideData.driver
            }
          };
          console.log('Updated ride with detailed driver info:', updatedRide);
          setSelectedRide(updatedRide);
        }
      } catch (error) {
        console.error('Error fetching detailed ride data:', error);
      } finally {
        setLoading(false);
      }
    }
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

  const getDriverInfo = (ride) => {
    // First check ride_details.driver (standard API format)
    if (ride?.ride_details?.driver) {
      return ride.ride_details.driver;
    }
    
    // Then check ride.driver (possible legacy or different format)
    if (ride?.ride?.driver) {
      return ride.ride.driver;
    }
    
    // Finally check if we're dealing with a simplified structure
    // where ride object itself might contain driver info
    if (ride?.ride && typeof ride.ride === 'object') {
      const possibleDriver = ride.ride;
      // Check if this object looks like a driver (has typical driver fields)
      if (possibleDriver.first_name || possibleDriver.last_name || 
          possibleDriver.email || possibleDriver.phone_number) {
        return possibleDriver;
      }
    }
    
    // Add explicit logging when we fail to find driver info
    console.warn('No driver info found for ride:', ride);
    
    // As a last resort, if we have driver name but no other details,
    // create a placeholder driver object with the name and default values
    // for a better user experience
    if (ride && ride.driver_name) {
      const nameParts = ride.driver_name.split(' ');
      return {
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        email: 'Contact through ChalBeyy app',
        phone_number: 'Contact through ChalBeyy app',
        vehicle_make: 'Vehicle details available at pickup',
        vehicle_model: '',
        vehicle_color: '',
        license_plate: 'Available at pickup'
      };
    }
    
    return null;
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

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress size={40} sx={{ mr: 2 }} />
          <Typography>Loading your trips...</Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              retryable && (
                <Button 
                  color="inherit" 
                  size="small" 
                  onClick={fetchAcceptedRides} 
                  disabled={loading}
                >
                  {loading ? <CircularProgress size={20} color="inherit" /> : 'Retry'}
                </Button>
              )
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', mb: 4 }}>
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
            <Schedule sx={{ fontSize: 80, color: '#861F41', mb: 2, opacity: 0.8 }} />
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41' }}>
              Rides waiting, seats inviting!
            </Typography>
            <Typography variant="body1" gutterBottom color="text.secondary" sx={{ maxWidth: 600, mb: 3 }}>
              Your journey begins with just one click! Find your perfect ride and let the adventures begin.
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => window.location.href = '/request-ride'}
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
              Find a Ride
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
                      primary={getFullName(getDriverInfo(ride))}
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
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Cancel />}
                        onClick={() => handleOpenCancelDialog(selectedRide)}
                      >
                        Cancel
                      </Button>
                    )}
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="subtitle1" gutterBottom>
                        Driver Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Person sx={{ mr: 1 }} />
                        <Typography>{getFullName(getDriverInfo(selectedRide))}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Phone sx={{ mr: 1 }} />
                        <Typography>{getPhoneNumber(getDriverInfo(selectedRide))}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Email sx={{ mr: 1 }} />
                        <Typography>{getEmail(getDriverInfo(selectedRide))}</Typography>
                      </Box>
                      
                      {getDriverInfo(selectedRide) && (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <DirectionsCar sx={{ mr: 1 }} />
                            <Typography>
                              Vehicle: {(() => {
                                const driver = getDriverInfo(selectedRide);
                                // Try different vehicle field variations
                                const make = driver.vehicle_make || driver.make;
                                const model = driver.vehicle_model || driver.model;
                                const color = driver.vehicle_color || driver.color;
                                const year = driver.vehicle_year || driver.year;
                                
                                // Create vehicle description with available information
                                const parts = [];
                                if (year) parts.push(year);
                                if (make) parts.push(make);
                                if (model) parts.push(model);
                                
                                let vehicleText = parts.join(' ');
                                if (color && vehicleText) {
                                  vehicleText += ` (${color})`;
                                }
                                
                                return vehicleText || 'Not provided';
                              })()}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <DriveEta sx={{ mr: 1 }} />
                            <Typography>
                              License Plate: {(() => {
                                const driver = getDriverInfo(selectedRide);
                                return driver.license_plate || driver.licensePlate || driver.plate || 'Not provided';
                              })()}
                            </Typography>
                          </Box>
                        </>
                      )}
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

                    {getDriverInfo(selectedRide) && (
                      <Grid item xs={12}>
                        <Box mt={2}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {getPhoneNumber(getDriverInfo(selectedRide)) === 'Not provided' && 
                             getEmail(getDriverInfo(selectedRide)) === 'Not provided' ? 
                              'Contact Options:' : ''}
                          </Typography>
                          
                          {getPhoneNumber(getDriverInfo(selectedRide)) === 'Not provided' && 
                           getEmail(getDriverInfo(selectedRide)) === 'Not provided' && (
                            <Button 
                              variant="outlined" 
                              color="primary" 
                              size="small"
                              startIcon={<Email />}
                              onClick={() => window.open('mailto:support@chalbeyy.com?subject=Contact%20Driver', '_blank')}
                              sx={{ mr: 1, mb: 1 }}
                            >
                              Contact Support
                            </Button>
                          )}
                        </Box>
                      </Grid>
                    )}
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
    </Container>
  );
};

export default RiderAcceptedRides; 