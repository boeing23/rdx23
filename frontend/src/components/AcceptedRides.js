import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Divider,
  Chip,
  Alert,
  Button,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction
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
  PinDrop,
  ExpandMore,
  AccessTime
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';

const AcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [expandedRide, setExpandedRide] = useState(null);
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
      
      const response = await fetch(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      });
      
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
        console.log('Full accepted rides data:', data);
        
        // If we have rides, automatically select the first one
        setSelectedRide(data[0]?.id || null);
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

  const handleCancelRide = async (rideRequestId, event) => {
    if (event) {
      event.stopPropagation(); // Prevent accordion from toggling
    }
    
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

  const handleCompleteRide = async (rideRequestId, event) => {
    if (event) {
      event.stopPropagation(); // Prevent accordion from toggling
    }
    
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

  const handleRideClick = (rideId) => {
    setSelectedRide(rideId === selectedRide ? null : rideId);
  };

  const handleAccordionChange = (rideId) => (event, isExpanded) => {
    setExpandedRide(isExpanded ? rideId : null);
  };

  if (loading) {
    return (
      <Container maxWidth="md">
        <Typography>Loading your trips...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md">
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

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

  const renderRideListItem = (ride) => {
    // Get ride data from either the ride object or the ride.ride_details object
    const rideData = ride.ride_details || ride.ride || {};
    const dateTime = formatDateTime(rideData.departure_time || ride.departure_time);
    
    // Get pickup/dropoff locations
    const pickupLocation = ride.pickup_location || 'N/A';
    const dropoffLocation = ride.dropoff_location || 'N/A';
    
    // Shorten location names for the list view
    const shortenLocation = (location, maxLength = 25) => {
      if (location.length <= maxLength) return location;
      
      // Try to extract meaningful part from the address
      const parts = location.split(',');
      if (parts.length > 1) {
        // Use first part plus the next meaningful part
        const firstPart = parts[0].trim();
        const secondPart = parts.slice(1).find(p => p.trim().length > 3)?.trim() || '';
        
        if (firstPart) {
          if (secondPart && (firstPart.length + secondPart.length + 3) <= maxLength) {
            return `${firstPart}, ${secondPart}...`;
          }
          return `${firstPart.substring(0, maxLength - 3)}...`;
        }
      }
      
      return `${location.substring(0, maxLength - 3)}...`;
    };

    return (
      <Accordion 
        key={ride.id}
        expanded={expandedRide === ride.id}
        onChange={handleAccordionChange(ride.id)}
        sx={{ 
          mb: 1,
          borderLeft: expandedRide === ride.id ? '4px solid #1976d2' : 'none',
          boxShadow: expandedRide === ride.id ? '0 4px 6px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMore />}
          sx={{ 
            minHeight: '72px',
            '&.Mui-expanded': { minHeight: '72px' },
            '& .MuiAccordionSummary-content': { margin: '12px 0' }
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <Typography variant="subtitle1" fontWeight="500">
                {shortenLocation(pickupLocation)} → {shortenLocation(dropoffLocation)}
              </Typography>
              {getStatusChip(ride.status)}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
              <AccessTime fontSize="small" sx={{ fontSize: '1rem', color: 'text.secondary', mr: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                {dateTime.date}, {dateTime.time}
              </Typography>
            </Box>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ pt: 0, pb: 2 }}>
          {renderRideDetails(ride)}
        </AccordionDetails>
      </Accordion>
    );
  };

  const renderRideDetails = (ride) => {
    // Try to get driver details from multiple potential sources
    const driverInfo = ride.driver_details || (ride.ride_details && ride.ride_details.driver) || {};
    
    // Get ride data from either the ride object or the ride.ride_details object
    const rideData = ride.ride_details || ride.ride || {};
    
    const isDriver = userType === 'DRIVER';
    
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
      <Box sx={{ mt: 2 }}>
        <Divider sx={{ mb: 2 }} />
        
        {/* Ride Details */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="600" gutterBottom>Ride Details</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
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
            </Grid>
            
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
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
            </Grid>
            
            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Event color="primary" sx={{ fontSize: '1.25rem' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Date:</Typography>
                  <Typography>{dateTime.date}</Typography>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Schedule color="primary" sx={{ fontSize: '1.25rem' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Time:</Typography>
                  <Typography>{dateTime.time}</Typography>
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person color="primary" sx={{ fontSize: '1.25rem' }} />
                <Box>
                  <Typography variant="body2" color="text.secondary">Seats:</Typography>
                  <Typography>{ride.seats_needed} seat(s)</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>
        
        {/* Driver Details */}
        {!isDriver && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="600" gutterBottom>Driver Details</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person color="primary" sx={{ fontSize: '1.25rem' }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">Name:</Typography>
                    <Typography>{getFullName(driverInfo)}</Typography>
                  </Box>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Email color="primary" sx={{ fontSize: '1.25rem' }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">Email:</Typography>
                    <Typography>{driverInfo.email || 'N/A'}</Typography>
                  </Box>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Phone color="primary" sx={{ fontSize: '1.25rem' }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">Phone:</Typography>
                    <Typography>{driverInfo.phone_number || 'N/A'}</Typography>
                  </Box>
                </Box>
              </Grid>
              
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DirectionsCar color="primary" sx={{ fontSize: '1.25rem' }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">Vehicle:</Typography>
                    <Typography>
                      {driverInfo.vehicle_make || 'N/A'} {driverInfo.vehicle_model || ''}
                      {driverInfo.vehicle_color ? ` (${driverInfo.vehicle_color})` : ''}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              
              {driverInfo.license_plate && (
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DirectionsCar color="primary" sx={{ fontSize: '1.25rem' }} />
                    <Box>
                      <Typography variant="body2" color="text.secondary">License Plate:</Typography>
                      <Typography>{driverInfo.license_plate}</Typography>
                    </Box>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Box>
        )}
        
        {/* Ride Actions */}
        {ride.status === 'ACCEPTED' && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button 
              variant="outlined" 
              color="error" 
              onClick={(e) => handleCancelRide(ride.id, e)}
              sx={{ mr: 1 }}
            >
              Cancel Ride
            </Button>
            {isDriver && (
              <Button 
                variant="contained" 
                color="success" 
                onClick={(e) => handleCompleteRide(ride.id, e)}
              >
                Mark as Completed
              </Button>
            )}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 2, fontWeight: 600 }}>
        My Trips
      </Typography>
      
      {acceptedRides.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          You don't have any booked trips yet.
          {userType === 'RIDER' ? " Try requesting a ride!" : " Wait for ride requests from riders."}
        </Alert>
      ) : (
        <Box sx={{ mt: 1 }}>
          {acceptedRides.map(ride => renderRideListItem(ride))}
        </Box>
      )}
    </Container>
  );
};

export default AcceptedRides; 