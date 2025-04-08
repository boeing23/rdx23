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
  Tabs,
  Tab
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DateRangeIcon from '@mui/icons-material/DateRange';
import MapIcon from '@mui/icons-material/Map';
import InfoIcon from '@mui/icons-material/Info';
import './RideCard.css';
import MapComponent from './MapComponent';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

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

function AcceptedRides() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [tabValue, setTabValue] = useState(0);
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
    setTabValue(0); // Reset to first tab when opening dialog
  }, []);

  const handleCloseDialog = useCallback(() => {
    setOpenDialog(false);
  }, []);

  const handleTabChange = useCallback((event, newValue) => {
    setTabValue(newValue);
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
      <Dialog 
        open={openDialog} 
        onClose={handleCloseDialog} 
        maxWidth="md" 
        fullWidth
      >
        {selectedRide && (
          <>
            <DialogTitle>
              Ride Details
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
                  Route
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>From:</strong> {selectedRide.origin_display_name}
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>To:</strong> {selectedRide.destination_display_name}
                </Typography>
                
                <Typography variant="h6" gutterBottom>
                  Schedule
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Departure:</strong> {formatDate(selectedRide.departure_time)}
                </Typography>
                
                <Typography variant="h6" gutterBottom>
                  Trip Information
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Status:</strong> {selectedRide.status}
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Distance:</strong> {selectedRide.distance ? `${selectedRide.distance.toFixed(1)} miles` : "Not available"}
                </Typography>
                <Typography variant="body1" paragraph>
                  <strong>Estimated Duration:</strong> {selectedRide.duration ? `${Math.round(selectedRide.duration / 60)} minutes` : "Not available"}
                </Typography>
              </TabPanel>
              
              <TabPanel value={tabValue} index={1}>
                <MapComponent 
                  pickupLocation={selectedRide.origin_display_name}
                  dropoffLocation={selectedRide.destination_display_name}
                  pickupCoordinates={{
                    latitude: selectedRide.pickup_latitude || selectedRide.origin_latitude,
                    longitude: selectedRide.pickup_longitude || selectedRide.origin_longitude
                  }}
                  dropoffCoordinates={{
                    latitude: selectedRide.dropoff_latitude || selectedRide.destination_latitude,
                    longitude: selectedRide.dropoff_longitude || selectedRide.destination_longitude
                  }}
                  optimizedPickupCoordinates={selectedRide.optimal_pickup_point}
                  optimizedDropoffCoordinates={selectedRide.nearest_dropoff_point}
                  showUserLocation={true}
                />
              </TabPanel>
            </DialogContent>
            
            <DialogActions>
              <Button onClick={handleCloseDialog}>Close</Button>
              
              {selectedRide.status === 'ACCEPTED' && (
                <>
                  <Button 
                    color="error" 
                    onClick={() => handleCancelRide(selectedRide.id)}
                  >
                    Cancel Ride
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