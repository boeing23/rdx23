import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  TextField,
  Button,
  Avatar,
  Divider,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { API_BASE_URL } from '../config';
import { Edit, Save, Person, Phone, Email, LocationOn, DirectionsCar } from '@mui/icons-material';

const UserProfile = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [success, setSuccess] = useState('');
  const [updating, setUpdating] = useState(false);
  const userType = localStorage.getItem('userType');
  const isDriver = userType === 'DRIVER';

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to view your profile');
        setLoading(false);
        return;
      }

      console.log('Fetching user data...');
      const response = await fetch(`${API_BASE_URL}/api/users/me/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.status}`);
      }

      const data = await response.json();
      console.log('User data fetched:', data);
      setUserData(data);
      
      // Initialize form data with user data
      setFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        ...(isDriver ? {
          vehicle_make: data.vehicle_make || '',
          vehicle_model: data.vehicle_model || '',
          vehicle_year: data.vehicle_year || '',
          vehicle_color: data.vehicle_color || '',
          license_plate: data.license_plate || '',
          max_passengers: data.max_passengers || 4
        } : {})
      });
      
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to update your profile');
        return;
      }

      console.log('Updating user profile with data:', formData);
      const response = await fetch(`${API_BASE_URL}/api/users/update_profile/`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update profile');
      }

      const data = await response.json();
      setUserData(data);
      setSuccess('Profile updated successfully!');
      setEditing(false);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading your profile...
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <Typography variant="h4" className="page-title" gutterBottom>
        My Profile
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' }, 
          justifyContent: 'space-between', 
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          mb: 3 
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            mb: { xs: 2, sm: 0 }
          }}>
            <Avatar 
              sx={{ 
                width: 80, 
                height: 80, 
                bgcolor: '#861F41', 
                fontSize: '2rem',
                mr: 2
              }}
            >
              {userData?.first_name?.charAt(0) || userData?.email?.charAt(0) || 'U'}
            </Avatar>
            <Box>
              <Typography variant="h5" gutterBottom sx={{ mb: 0 }}>
                {userData?.first_name && userData?.last_name 
                  ? `${userData.first_name} ${userData.last_name}`
                  : userData?.email || 'User'}
              </Typography>
              <Typography variant="body1" color="textSecondary">
                {userType === 'DRIVER' ? 'Driver' : 'Rider'}
              </Typography>
            </Box>
          </Box>
          <Button
            variant={editing ? "contained" : "outlined"}
            color={editing ? "success" : "primary"}
            startIcon={editing ? <Save /> : <Edit />}
            onClick={() => editing ? null : setEditing(true)}
            type={editing ? "submit" : "button"}
            form={editing ? "profile-form" : undefined}
            disabled={updating}
            sx={{
              minWidth: { xs: '100%', sm: 'auto' },
              p: { xs: 1, sm: 'auto' },
              whiteSpace: 'nowrap',
              mt: { xs: 1, sm: 0 }
            }}
          >
            {updating ? 'Saving...' : editing ? 'Save Changes' : 'Edit Profile'}
          </Button>
        </Box>

        <Divider sx={{ mb: 4 }} />

        {editing ? (
          <form id="profile-form" onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  variant="outlined"
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  variant="outlined"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  variant="outlined"
                  type="email"
                  required
                  disabled
                  helperText="Email cannot be changed"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  name="phone_number"
                  value={formData.phone_number}
                  onChange={handleInputChange}
                  variant="outlined"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  variant="outlined"
                />
              </Grid>

              {isDriver && (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mt: 2, mb: 2 }}>
                      Vehicle Information
                    </Typography>
                    <Divider />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Vehicle Make"
                      name="vehicle_make"
                      value={formData.vehicle_make}
                      onChange={handleInputChange}
                      variant="outlined"
                      required={isDriver}
                      placeholder="e.g., Toyota"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Vehicle Model"
                      name="vehicle_model"
                      value={formData.vehicle_model}
                      onChange={handleInputChange}
                      variant="outlined"
                      required={isDriver}
                      placeholder="e.g., Camry"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Vehicle Year"
                      name="vehicle_year"
                      value={formData.vehicle_year}
                      onChange={handleInputChange}
                      variant="outlined"
                      required={isDriver}
                      placeholder="e.g., 2020"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Vehicle Color"
                      name="vehicle_color"
                      value={formData.vehicle_color}
                      onChange={handleInputChange}
                      variant="outlined"
                      required={isDriver}
                      placeholder="e.g., Blue"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="License Plate"
                      name="license_plate"
                      value={formData.license_plate}
                      onChange={handleInputChange}
                      variant="outlined"
                      required={isDriver}
                      placeholder="e.g., ABC123"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth>
                      <InputLabel id="max-passengers-label">Max Passengers</InputLabel>
                      <Select
                        labelId="max-passengers-label"
                        id="max-passengers"
                        name="max_passengers"
                        value={formData.max_passengers}
                        label="Max Passengers"
                        onChange={handleInputChange}
                        required={isDriver}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                          <MenuItem key={num} value={num}>{num}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              )}

              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button 
                    variant="outlined" 
                    color="error" 
                    onClick={() => {
                      setEditing(false);
                      // Reset form data to original user data
                      setFormData({
                        first_name: userData.first_name || '',
                        last_name: userData.last_name || '',
                        email: userData.email || '',
                        phone_number: userData.phone_number || '',
                        address: userData.address || '',
                        ...(isDriver ? {
                          vehicle_make: userData.vehicle_make || '',
                          vehicle_model: userData.vehicle_model || '',
                          vehicle_year: userData.vehicle_year || '',
                          vehicle_color: userData.vehicle_color || '',
                          license_plate: userData.license_plate || '',
                          max_passengers: userData.max_passengers || 4
                        } : {})
                      });
                    }}
                    sx={{ mr: 2 }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    type="submit"
                    disabled={updating}
                  >
                    {updating ? 'Saving...' : 'Save Changes'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </form>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                <Person sx={{ mr: 2, color: '#861F41' }} />
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Name
                  </Typography>
                  <Typography variant="body1">
                    {userData?.first_name && userData?.last_name 
                      ? `${userData.first_name} ${userData.last_name}`
                      : 'Not provided'}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                <Email sx={{ mr: 2, color: '#861F41' }} />
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Email
                  </Typography>
                  <Typography variant="body1">
                    {userData?.email || 'Not provided'}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                <Phone sx={{ mr: 2, color: '#861F41' }} />
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Phone
                  </Typography>
                  <Typography variant="body1">
                    {userData?.phone_number || 'Not provided'}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                <LocationOn sx={{ mr: 2, color: '#861F41' }} />
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Address
                  </Typography>
                  <Typography variant="body1">
                    {userData?.address || 'Not provided'}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {isDriver && (
              <>
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Vehicle Information
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                    <DirectionsCar sx={{ mr: 2, color: '#861F41' }} />
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Vehicle
                      </Typography>
                      <Typography variant="body1">
                        {userData?.vehicle_year && userData?.vehicle_make && userData?.vehicle_model 
                          ? `${userData.vehicle_year} ${userData.vehicle_make} ${userData.vehicle_model}`
                          : 'Not provided'}
                        {userData?.vehicle_color ? ` (${userData.vehicle_color})` : ''}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                    <DirectionsCar sx={{ mr: 2, color: '#861F41' }} />
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        License Plate
                      </Typography>
                      <Typography variant="body1">
                        {userData?.license_plate || 'Not provided'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3 }}>
                    <DirectionsCar sx={{ mr: 2, color: '#861F41' }} />
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Max Passengers
                      </Typography>
                      <Typography variant="body1">
                        {userData?.max_passengers || '4'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </>
            )}
          </Grid>
        )}
      </Paper>
    </Container>
  );
};

export default UserProfile; 