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
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { Icon } from 'react-native-elements';

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

  const handleCall = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'The driver has not provided a phone number.');
      return;
    }
    
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleEmail = (email) => {
    if (!email) {
      Alert.alert('No Email', 'The driver has not provided an email address.');
      return;
    }
    
    Linking.openURL(`mailto:${email}`);
  };

  const renderRideItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleRideClick(item)}>
      <Card containerStyle={styles.card}>
        <Card.Title>{item.pickup_location} → {item.dropoff_location}</Card.Title>
        <Text style={styles.dateText}>
          {formatDate(item.departure_time)}
        </Text>
        <Text style={styles.statusText}>
          Status: <Text style={styles[item.status.toLowerCase()]}>{item.status}</Text>
        </Text>
        <Text style={styles.infoText}>
          Driver: {item.driver ? (item.driver.full_name || `${item.driver.first_name} ${item.driver.last_name}`) : (item.driver_name || 'Not assigned')}
        </Text>
        <Text style={styles.infoText}>
          Seats: {item.seats_needed}
        </Text>
      </Card>
    </TouchableOpacity>
  );

  const renderSelectedRide = () => {
    if (!selectedRide) return null;
    
    const driver = getDriverInfo(selectedRide);
    
    return (
      <Card containerStyle={styles.detailCard}>
        <Card.Title>Ride Details</Card.Title>
        <ScrollView>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>From:</Text>
            <Text style={styles.detailValue}>{selectedRide.pickup_location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To:</Text>
            <Text style={styles.detailValue}>{selectedRide.dropoff_location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>When:</Text>
            <Text style={styles.detailValue}>{formatDate(selectedRide.departure_time)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={[styles.detailValue, styles[selectedRide.status.toLowerCase()]]}>
              {selectedRide.status}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Seats:</Text>
            <Text style={styles.detailValue}>{selectedRide.seats_needed}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Driver Information</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Name:</Text>
            <Text style={styles.detailValue}>
              {driver.full_name || `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Unknown Driver'}
            </Text>
          </View>
          
          {/* Contact options */}
          <View style={styles.contactContainer}>
            {driver.phone_number ? (
              <Button
                buttonStyle={styles.contactButton}
                icon={<Icon name="phone" type="feather" color="#ffffff" />}
                title="Call"
                onPress={() => handleCall(driver.phone_number)}
              />
            ) : (
              <Text style={styles.contactInfo}>Contact through ChalBeyy app</Text>
            )}
            
            {driver.email ? (
              <Button
                buttonStyle={styles.contactButton}
                icon={<Icon name="mail" type="feather" color="#ffffff" />}
                title="Email"
                onPress={() => handleEmail(driver.email)}
              />
            ) : (
              <Text style={styles.contactInfo}>Contact through ChalBeyy app</Text>
            )}
            
            {(!driver.phone_number && !driver.email) && (
              <Button
                buttonStyle={styles.supportButton}
                title="Contact Support"
                onPress={() => Linking.openURL('mailto:support@chalbeyy.com')}
              />
            )}
          </View>
          
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Vehicle Information</Text>
          <Text style={styles.vehicleInfo}>
            {getVehicleInfo(driver)}
          </Text>
        </ScrollView>
        
        <View style={styles.backButtonContainer}>
          <Button
            buttonStyle={styles.backButton}
            title="Back to List"
            onPress={() => setSelectedRide(null)}
          />
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading rides...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Button
          title="Try Again"
          onPress={fetchAcceptedRides}
          buttonStyle={styles.retryButton}
        />
      </View>
    );
  }

  if (acceptedRides.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>You don't have any rides yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {selectedRide ? (
        renderSelectedRide()
      ) : (
        <FlatList
          data={acceptedRides}
          renderItem={renderRideItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    borderRadius: 8,
    marginBottom: 10,
    padding: 15,
  },
  detailCard: {
    borderRadius: 8,
    padding: 15,
    margin: 0,
  },
  dateText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 5,
  },
  infoText: {
    fontSize: 14,
    marginBottom: 3,
  },
  accepted: {
    color: 'green',
    fontWeight: 'bold',
  },
  pending: {
    color: 'orange',
    fontWeight: 'bold',
  },
  completed: {
    color: 'blue',
    fontWeight: 'bold',
  },
  cancelled: {
    color: 'red',
    fontWeight: 'bold',
  },
  rejected: {
    color: 'red',
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2089dc',
    paddingHorizontal: 30,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  detailLabel: {
    width: 80,
    fontWeight: 'bold',
  },
  detailValue: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  contactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 10,
  },
  contactButton: {
    backgroundColor: '#2089dc',
    minWidth: 120,
    margin: 5,
  },
  supportButton: {
    backgroundColor: '#f0ad4e',
    minWidth: 250,
    margin: 5,
  },
  contactInfo: {
    width: '100%',
    textAlign: 'center',
    color: '#555',
    marginVertical: 10,
  },
  vehicleInfo: {
    marginTop: 5,
    lineHeight: 24,
  },
  backButtonContainer: {
    marginTop: 20,
  },
  backButton: {
    backgroundColor: '#999',
  },
});

export default RiderAcceptedRides; 