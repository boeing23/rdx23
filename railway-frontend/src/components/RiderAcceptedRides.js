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
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// Replace with web components
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native-web';
// Remove unnecessary imports
// import { Icon } from 'react-native-elements';

const RiderAcceptedRides = () => {
  const [acceptedRides, setAcceptedRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [openCancelDialog, setOpenCancelDialog] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const { authState } = useAuth();

  const fetchAcceptedRides = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching accepted rides...');
      const response = await axios.get(`${API_BASE_URL}/api/rides/requests/accepted/`, {
        headers: {
          Authorization: `Token ${authState.token}`
        }
      });
      
      console.log('Full accepted rides data:', JSON.stringify(response.data, null, 2));
      
      // Map the response data based on its structure
      let mappedRides = [];
      
      if (Array.isArray(response.data)) {
        console.log('Response is array format (simplified fallback)');
        // This is the simplified fallback format returned by the backend
        mappedRides = response.data.map(ride => {
          console.log('Processing ride in simplified format:', ride);
          
          // Parse driver name into first and last name if available
          let firstName = '', lastName = '';
          if (ride.driver_name) {
            const nameParts = ride.driver_name.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
          }
          
          // Create mapped object with all available driver info from API
          return {
            id: ride.id,
            status: ride.status,
            ride_id: ride.ride_id,
            pickup_location: ride.pickup_location,
            dropoff_location: ride.dropoff_location,
            departure_time: ride.departure_time,
            seats_needed: ride.seats_needed,
            ride_details: null, // Not available in this format
            driver: {
              id: ride.driver_id || null,
              first_name: firstName,
              last_name: lastName,
              full_name: ride.driver_name || 'Unknown Driver',
              email: ride.driver_email || null,
              phone_number: ride.driver_phone || null,
              vehicle_make: ride.vehicle_make || null,
              vehicle_model: ride.vehicle_model || null,
              vehicle_color: ride.vehicle_color || null,
              vehicle_year: ride.vehicle_year || null,
              license_plate: ride.license_plate || null
            }
          };
        });
      } else {
        console.log('Response appears to be in standard format');
        mappedRides = response.data.map(ride => {
          console.log('Processing ride in standard format:', ride);
          
          // Check if ride_details and driver are populated
          const hasRideDetails = ride.ride_details && typeof ride.ride_details === 'object';
          const hasDriverInRideDetails = hasRideDetails && ride.ride_details.driver;
          
          // Get driver info from the most appropriate location
          const driver = hasDriverInRideDetails ? ride.ride_details.driver : 
                        (ride.driver ? ride.driver : null);
          
          console.log('Driver info available:', driver ? 'Yes' : 'No');
          
          return {
            ...ride,
            driver: driver
          };
        });
      }
      
      console.log(`Processed ${mappedRides.length} rides`);
      
      // Get the user IDs of all drivers
      const driverIds = mappedRides
        .filter(ride => ride.driver && ride.driver.id)
        .map(ride => ride.driver.id);
      
      console.log('Driver IDs to fetch:', driverIds);
      
      // If we have driver IDs, fetch their full details from users table
      if (driverIds.length > 0) {
        try {
          // Fetch driver details from users_user table
          await Promise.all(driverIds.map(async (driverId) => {
            if (!driverId) return;
            
            try {
              console.log(`Fetching details for driver ID: ${driverId}`);
              const userResponse = await axios.get(`${API_BASE_URL}/api/users/${driverId}/`, {
                headers: {
                  Authorization: `Token ${authState.token}`
                }
              });
              
              console.log(`User data for driver ${driverId}:`, userResponse.data);
              
              // Update the corresponding ride with complete driver info
              mappedRides = mappedRides.map(ride => {
                if (ride.driver && ride.driver.id === driverId) {
                  return {
                    ...ride,
                    driver: {
                      ...ride.driver,
                      ...userResponse.data,
                      // Keep the original full_name if it exists
                      full_name: ride.driver.full_name || `${userResponse.data.first_name} ${userResponse.data.last_name}`
                    }
                  };
                }
                return ride;
              });
            } catch (err) {
              console.error(`Error fetching driver ${driverId} details:`, err);
            }
          }));
        } catch (err) {
          console.error('Error fetching driver details:', err);
        }
      }
      
      setAcceptedRides(mappedRides);
      console.log(`Final rides data with ${mappedRides.length} rides`);
    } catch (err) {
      console.error('Error fetching accepted rides:', err);
      if (err.response) {
        console.error('Error response:', err.response.data);
        console.error('Status code:', err.response.status);
        setError(`Error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
      } else {
        setError('Network error. Please check your connection.');
      }
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
    console.log('Selected ride:', ride);
    
    // Check if driver info is incomplete
    const isDriverInfoIncomplete = !ride.driver || 
                                  !ride.driver.phone_number || 
                                  !ride.driver.vehicle_make || 
                                  !ride.driver.license_plate;
    
    if (isDriverInfoIncomplete && ride.driver && ride.driver.id) {
      try {
        console.log(`Fetching complete driver details for ID: ${ride.driver.id}`);
        
        // Get driver ID from the appropriate source
        const driverId = ride.driver.id;
        
        // Fetch user details from the users API
        const userResponse = await axios.get(`${API_BASE_URL}/api/users/${driverId}/`, {
          headers: {
            Authorization: `Token ${authState.token}`
          }
        });
        
        console.log('Fetched user details:', userResponse.data);
        
        // Create updated ride with complete driver information
        const updatedRide = {
          ...ride,
          driver: {
            ...ride.driver,
            ...userResponse.data
          }
        };
        
        // Update the ride in the list
        setAcceptedRides(acceptedRides.map(r => r.id === ride.id ? updatedRide : r));
        
        // Update selected ride
        setSelectedRide(updatedRide);
      } catch (err) {
        console.error('Error fetching driver details:', err);
        
        // Still select the ride even if fetching details failed
        setSelectedRide(ride);
      }
    } else {
      // If driver info is already complete, just select the ride
      setSelectedRide(ride);
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
    if (!ride) return null;
    
    // Try to get driver from ride_details.driver first
    if (ride.ride_details && ride.ride_details.driver) {
      console.log('Using driver from ride_details.driver');
      return ride.ride_details.driver;
    }
    
    // Then try ride.driver
    if (ride.driver) {
      console.log('Using driver from ride.driver');
      return ride.driver;
    }
    
    // Fallback for driver name only (simplified format)
    if (ride.driver_name) {
      console.log('Using driver_name fallback');
      
      // Create placeholder driver object
      const nameParts = ride.driver_name.split(' ');
      return {
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        full_name: ride.driver_name,
        email: ride.driver_email || 'Contact through support',
        phone_number: ride.driver_phone || 'Contact through app',
        vehicle_make: ride.vehicle_make || 'Available at pickup',
        vehicle_model: ride.vehicle_model || '',
        vehicle_color: ride.vehicle_color || '',
        vehicle_year: ride.vehicle_year || '',
        license_plate: ride.license_plate || 'Provided before pickup'
      };
    }
    
    console.warn('No driver info found');
    return {
      first_name: 'Unknown',
      last_name: 'User',
      full_name: 'Unknown User',
      email: null,
      phone_number: null,
      vehicle_make: null,
      vehicle_model: null,
      vehicle_color: null,
      vehicle_year: null,
      license_plate: null
    };
  };

  const getVehicleInfo = (driver) => {
    if (!driver) return 'Not provided';
    
    const make = driver.vehicle_make;
    const model = driver.vehicle_model;
    const color = driver.vehicle_color;
    const year = driver.vehicle_year;
    const plate = driver.license_plate;
    
    if (!make && !model && !color && !year && !plate) {
      return 'Vehicle details will be available at pickup';
    }
    
    let vehicleInfo = '';
    
    if (year) vehicleInfo += `${year} `;
    if (color) vehicleInfo += `${color} `;
    if (make) vehicleInfo += `${make} `;
    if (model) vehicleInfo += `${model}`;
    
    vehicleInfo = vehicleInfo.trim();
    
    if (plate) {
      vehicleInfo += vehicleInfo ? `, License: ${plate}` : `License: ${plate}`;
    }
    
    return vehicleInfo || 'Vehicle details will be available at pickup';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    try {
      const date = new Date(dateString);
      return format(date, 'PPpp'); // e.g., "Apr 3, 2023, 2:30 PM"
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  const handleOpenCancelDialog = (ride) => {
    setSelectedRide(ride);
    setOpenCancelDialog(true);
  };

  const handleCloseCancelDialog = () => {
    setOpenCancelDialog(false);
  };

  // Remove direct link handling
  const handleCall = (phoneNumber) => {
    if (!phoneNumber) {
      alert('No Phone Number: The driver has not provided a phone number.');
      return;
    }
    window.open(`tel:${phoneNumber}`, '_blank');
  };

  const handleEmail = (email) => {
    if (!email) {
      alert('No Email: The driver has not provided an email address.');
      return;
    }
    window.open(`mailto:${email}`, '_blank');
  };

  const renderRideItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleRideClick(item)}>
      <Box sx={{ 
        borderRadius: '8px', 
        marginBottom: '10px', 
        padding: '15px',
        boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
        background: '#fff'
      }}>
        <Typography variant="h6">{item.pickup_location} → {item.dropoff_location}</Typography>
        <Typography sx={{ fontSize: '14px', color: '#555', marginBottom: '8px' }}>
          {formatDate(item.departure_time)}
        </Typography>
        <Typography sx={{ fontSize: '14px', marginBottom: '5px' }}>
          Status: <span style={{ 
            color: item.status === 'ACCEPTED' ? 'green' : 
                  item.status === 'PENDING' ? 'orange' :
                  item.status === 'COMPLETED' ? 'blue' : 'red',
            fontWeight: 'bold'
          }}>{item.status}</span>
        </Typography>
        <Typography sx={{ fontSize: '14px', marginBottom: '3px' }}>
          Driver: {item.driver ? (item.driver.full_name || `${item.driver.first_name} ${item.driver.last_name}`) : (item.driver_name || 'Not assigned')}
        </Typography>
        <Typography sx={{ fontSize: '14px', marginBottom: '3px' }}>
          Seats: {item.seats_needed}
        </Typography>
      </Box>
    </TouchableOpacity>
  );

  const renderSelectedRide = () => {
    if (!selectedRide) return null;
    
    const driver = getDriverInfo(selectedRide);
    
    return (
      <Paper sx={{ borderRadius: '8px', padding: '15px', margin: 0 }}>
        <Typography variant="h5" sx={{ marginBottom: '15px' }}>Ride Details</Typography>
        <Box sx={{ maxHeight: '70vh', overflow: 'auto' }}>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>From:</Typography>
            <Typography sx={{ flex: 1 }}>{selectedRide.pickup_location}</Typography>
          </Box>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>To:</Typography>
            <Typography sx={{ flex: 1 }}>{selectedRide.dropoff_location}</Typography>
          </Box>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>When:</Typography>
            <Typography sx={{ flex: 1 }}>{formatDate(selectedRide.departure_time)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>Status:</Typography>
            <Typography sx={{ 
              flex: 1,
              color: selectedRide.status === 'ACCEPTED' ? 'green' : 
                     selectedRide.status === 'PENDING' ? 'orange' :
                     selectedRide.status === 'COMPLETED' ? 'blue' : 'red',
              fontWeight: 'bold'
            }}>
              {selectedRide.status}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>Seats:</Typography>
            <Typography sx={{ flex: 1 }}>{selectedRide.seats_needed}</Typography>
          </Box>
          
          <Box sx={{ height: '1px', backgroundColor: '#e0e0e0', margin: '15px 0' }} />
          
          <Typography variant="h6" sx={{ marginBottom: '10px' }}>Driver Information</Typography>
          <Box sx={{ display: 'flex', marginBottom: '10px' }}>
            <Typography sx={{ width: '80px', fontWeight: 'bold' }}>Name:</Typography>
            <Typography sx={{ flex: 1 }}>
              {driver.full_name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Unknown Driver'}
            </Typography>
          </Box>
          
          {/* Contact options */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-around', 
            flexWrap: 'wrap',
            margin: '10px 0'
          }}>
            {driver.phone_number ? (
              <Button
                variant="contained"
                startIcon={<Phone />}
                onClick={() => handleCall(driver.phone_number)}
                sx={{ minWidth: '120px', margin: '5px' }}
              >
                Call
              </Button>
            ) : (
              <Typography sx={{ 
                width: '100%', 
                textAlign: 'center', 
                color: '#555', 
                margin: '10px 0'
              }}>
                Contact through ChalBeyy app
              </Typography>
            )}
            
            {driver.email ? (
              <Button
                variant="contained"
                startIcon={<Email />}
                onClick={() => handleEmail(driver.email)}
                sx={{ minWidth: '120px', margin: '5px' }}
              >
                Email
              </Button>
            ) : (
              <Typography sx={{ 
                width: '100%', 
                textAlign: 'center', 
                color: '#555', 
                margin: '10px 0'
              }}>
                Contact through ChalBeyy app
              </Typography>
            )}
            
            {(!driver.phone_number && !driver.email) && (
              <Button
                variant="contained"
                color="warning"
                onClick={() => window.open('mailto:support@chalbeyy.com', '_blank')}
                sx={{ minWidth: '250px', margin: '5px' }}
              >
                Contact Support
              </Button>
            )}
          </Box>
          
          <Box sx={{ height: '1px', backgroundColor: '#e0e0e0', margin: '15px 0' }} />
          
          <Typography variant="h6" sx={{ marginBottom: '10px' }}>Vehicle Information</Typography>
          <Typography sx={{ marginTop: '5px', lineHeight: '24px' }}>
            {getVehicleInfo(driver)}
          </Typography>
        </Box>
        
        <Box sx={{ marginTop: '20px' }}>
          <Button
            variant="contained"
            color="inherit"
            onClick={() => setSelectedRide(null)}
            sx={{ backgroundColor: '#999' }}
          >
            Back to List
          </Button>
        </Box>
      </Paper>
    );
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '60vh'
      }}>
        <CircularProgress size={40} sx={{ marginBottom: 2 }} />
        <Typography>Loading rides...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        flexDirection: 'column',
        padding: '20px'
      }}>
        <Alert severity="error" sx={{ marginBottom: 2, width: '100%' }}>
          {error}
        </Alert>
        <Button
          variant="contained"
          onClick={fetchAcceptedRides}
          startIcon={<Refresh />}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  if (acceptedRides.length === 0) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '60vh'
      }}>
        <Typography>You don't have any rides yet.</Typography>
      </Box>
    );
  }

  return (
    <Container sx={{ padding: '10px', backgroundColor: '#f5f5f5', minHeight: '80vh' }}>
      {selectedRide ? (
        renderSelectedRide()
      ) : (
        <List sx={{ paddingBottom: '20px' }}>
          {acceptedRides.map(ride => (
            <ListItem 
              key={ride.id.toString()} 
              button 
              onClick={() => handleRideClick(ride)}
              sx={{ 
                padding: 0, 
                marginBottom: '10px',
                display: 'block'
              }}
            >
              {renderRideItem({ item: ride })}
            </ListItem>
          ))}
        </List>
      )}
    </Container>
  );
};

export default RiderAcceptedRides; 