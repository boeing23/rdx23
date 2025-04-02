import React, { useState, useEffect } from 'react';
import { Box, Container, Typography, TextField, Button, Paper, FormControl, FormLabel, Alert, useTheme, useMediaQuery } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate, useLocation } from 'react-router-dom';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';
import { API_BASE_URL } from '../config';

const StyledContainer = styled(Container)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f6f5f7',
  position: 'relative',
  overflow: 'hidden',
}));

const FormContainer = styled(Box)(({ theme, isActive, isMobile }) => ({
  position: isMobile ? 'relative' : 'absolute',
  top: 0,
  height: '100%',
  width: isMobile ? '100%' : '50%',
  transition: 'all 0.6s ease-in-out',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#fff',
  opacity: isActive ? 1 : 0,
  zIndex: isActive ? 5 : 1,
  padding: isMobile ? theme.spacing(2, 0) : 0,
}));

const SignInContainer = styled(FormContainer)(({ theme, isActive, isMobile }) => ({
  left: 0,
  transform: isMobile ? 'none' : (isActive ? 'translateX(0)' : 'translateX(-100%)'),
  display: isMobile ? (isActive ? 'flex' : 'none') : 'flex',
}));

const SignUpContainer = styled(FormContainer)(({ theme, isActive, isMobile }) => ({
  left: isMobile ? 0 : '50%',
  transform: isMobile ? 'none' : (isActive ? 'translateX(0)' : 'translateX(100%)'),
  display: isMobile ? (isActive ? 'flex' : 'none') : 'flex',
}));

const OverlayContainer = styled(Box)(({ theme, isSignUp, isMobile }) => ({
  position: 'absolute',
  top: 0,
  left: isSignUp ? 0 : '50%',
  width: '50%',
  height: '100%',
  overflow: 'hidden',
  transition: 'transform 0.6s ease-in-out, left 0.6s ease-in-out',
  zIndex: 10,
  display: isMobile ? 'none' : 'block', // Hide on mobile
}));

const Overlay = styled(Box)(({ theme }) => ({
  background: 'linear-gradient(to right, #861F41, #A52A55)',
  color: '#FFFFFF',
  position: 'relative',
  height: '100%',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
}));

const FormPaper = styled(Paper)(({ theme, isMobile }) => ({
  padding: isMobile ? theme.spacing(3) : theme.spacing(4),
  borderRadius: '10px',
  boxShadow: '0 0 15px rgba(0,0,0,0.1)',
  width: isMobile ? '95%' : '90%',
  maxWidth: '400px',
  maxHeight: isMobile ? '95vh' : '90%',
  overflowY: 'auto',
}));

const UserTypeOption = styled(Box)(({ theme, selected }) => ({
  border: `2px solid ${selected ? '#861F41' : '#e0e0e0'}`,
  borderRadius: '10px',
  padding: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  backgroundColor: selected ? 'rgba(134, 31, 65, 0.05)' : 'transparent',
  transition: 'all 0.3s ease',
  '&:hover': {
    backgroundColor: selected ? 'rgba(134, 31, 65, 0.1)' : 'rgba(0, 0, 0, 0.02)',
  }
}));

const AuthPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const location = useLocation();
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [userType, setUserType] = useState('RIDER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Set initial form based on route
  useEffect(() => {
    setIsSignUp(location.pathname === '/register');
  }, [location.pathname]);
  
  // Login form state
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });

  // Register form state
  const [registerData, setRegisterData] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    // Driver-specific fields
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_color: '',
    license_plate: '',
    max_passengers: ''
  });
  
  const navigate = useNavigate();

  const handleSignUpClick = () => {
    if (isMobile) {
      navigate('/register');
    } else {
      setIsSignUp(true);
    }
    setError('');
  };

  const handleSignInClick = () => {
    if (isMobile) {
      navigate('/login');
    } else {
      setIsSignUp(false);
    }
    setError('');
  };

  const handleUserTypeChange = (type) => {
    setUserType(type);
  };

  const handleLoginChange = (e) => {
    setLoginData({
      ...loginData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegisterChange = (e) => {
    setRegisterData({
      ...registerData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('Attempting login with:', { username: loginData.username });
      
      const response = await fetch(`${API_BASE_URL}/api/users/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginData)
      });

      console.log('Login response status:', response.status);
      
      const data = await response.json();
      console.log('Login response data:', data);

      if (response.ok) {
        // Store auth data
        localStorage.setItem('token', data.token);
        localStorage.setItem('userType', JSON.stringify(data.user_type));
        localStorage.setItem('userId', data.user.id);
        
        // Navigate based on user type
        const userTypeValue = data.user_type;
        navigate(userTypeValue === 'DRIVER' ? '/offer' : '/rides');
        window.location.reload(); // Force navbar update
      } else {
        setError(data.detail || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateRegisterData = () => {
    // Validate password match
    if (registerData.password !== registerData.password2) {
      setError('Passwords do not match');
      return false;
    }

    // Validate password strength
    if (registerData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }

    // Validate required fields
    const requiredFields = ['username', 'email', 'first_name', 'last_name', 'phone_number'];
    for (const field of requiredFields) {
      if (!registerData[field]) {
        setError(`${field.replace('_', ' ')} is required`);
        return false;
      }
    }

    // Validate phone number format
    const phoneRegex = /^\+?[\d\s-]{10,}$/;
    if (!phoneRegex.test(registerData.phone_number)) {
      setError('Please enter a valid phone number (at least 10 digits)');
      return false;
    }

    return true;
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!validateRegisterData()) {
      return;
    }
    
    setLoading(true);

    try {
      console.log('Sending registration data to backend');
      
      const response = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...registerData,
          user_type: userType
        })
      });

      console.log('Registration response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        
        try {
          // Try to parse as JSON if possible
          const errorData = JSON.parse(errorText);
          setError(errorData.detail || 'Registration failed');
        } catch (e) {
          // If not JSON, show the raw error or a generic message
          setError(`Registration failed: ${errorText.substring(0, 100)}...`);
        }
        return;
      }
      
      const data = await response.json();
      console.log('Registration successful, data:', data);
      
      // Store token and user type
      localStorage.setItem('token', data.token);
      localStorage.setItem('userType', JSON.stringify(data.user_type));
      localStorage.setItem('userId', data.user.id);
      
      // Navigate based on user type
      navigate(data.user_type === 'DRIVER' ? '/offer' : '/rides');
      window.location.reload(); // Force navbar update
    } catch (err) {
      console.error('Registration error:', err);
      setError('Network error during registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <StyledContainer>
      <Box sx={{
        position: 'relative',
        width: '100%',
        height: isMobile ? 'auto' : '550px',
        maxWidth: isMobile ? '450px' : '900px',
      }}>
        <SignInContainer isActive={!isSignUp} isMobile={isMobile}>
          <FormPaper isMobile={isMobile}>
            <Typography variant="h4" gutterBottom sx={{ 
              fontWeight: 'bold', 
              color: '#861F41', 
              textAlign: 'center',
              fontSize: isMobile ? '1.5rem' : '2rem',
            }}>
              Welcome Back
            </Typography>
            <Typography variant="body1" sx={{ 
              mb: 2, 
              color: '#666', 
              textAlign: 'center', 
              fontSize: isMobile ? '0.875rem' : '1rem'
            }}>
              Sign in to continue your journey
            </Typography>
            
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            <form onSubmit={handleLogin}>
              <TextField
                fullWidth
                label="Username"
                name="username"
                variant="outlined"
                margin="normal"
                value={loginData.username}
                onChange={handleLoginChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                variant="outlined"
                margin="normal"
                value={loginData.password}
                onChange={handleLoginChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 2 : 3 }}
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  backgroundColor: '#861F41',
                  '&:hover': { backgroundColor: '#A52A55' },
                  py: isMobile ? 1 : 1.5,
                  borderRadius: '25px',
                  textTransform: 'none',
                  fontSize: isMobile ? '14px' : '16px',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
            <Typography 
              variant="body2" 
              sx={{ 
                textAlign: 'center', 
                mt: 3, 
                color: '#861F41',
                cursor: 'pointer',
                fontSize: isMobile ? '0.8rem' : '0.875rem'
              }}
              onClick={handleSignUpClick}
            >
              Don't have an account? Sign Up
            </Typography>
          </FormPaper>
        </SignInContainer>

        <SignUpContainer isActive={isSignUp} isMobile={isMobile}>
          <FormPaper isMobile={isMobile}>
            <Typography variant="h4" gutterBottom sx={{ 
              fontWeight: 'bold', 
              color: '#861F41', 
              textAlign: 'center',
              fontSize: isMobile ? '1.5rem' : '2rem',
            }}>
              Create Account
            </Typography>
            <Typography variant="body1" sx={{ 
              mb: 2, 
              color: '#666', 
              textAlign: 'center',
              fontSize: isMobile ? '0.875rem' : '1rem'
            }}>
              Join ChalBeyy and start your journey today!
            </Typography>
            
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            
            <form onSubmit={handleSignup}>
              <TextField
                fullWidth
                label="Username"
                name="username"
                variant="outlined"
                margin="normal"
                value={registerData.username}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                variant="outlined"
                margin="normal"
                value={registerData.email}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="First Name"
                name="first_name"
                variant="outlined"
                margin="normal"
                value={registerData.first_name}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Last Name"
                name="last_name"
                variant="outlined"
                margin="normal"
                value={registerData.last_name}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Phone Number"
                name="phone_number"
                variant="outlined"
                margin="normal"
                value={registerData.phone_number}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                variant="outlined"
                margin="normal"
                value={registerData.password}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              <TextField
                fullWidth
                label="Confirm Password"
                name="password2"
                type="password"
                variant="outlined"
                margin="normal"
                value={registerData.password2}
                onChange={handleRegisterChange}
                required
                size={isMobile ? "small" : "medium"}
                sx={{ mb: isMobile ? 1.5 : 2 }}
              />
              
              <FormControl component="fieldset" sx={{ width: '100%', mb: isMobile ? 2 : 3 }}>
                <FormLabel component="legend" sx={{ mb: 1, color: '#666', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                  I want to register as:
                </FormLabel>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UserTypeOption
                    selected={userType === 'RIDER'}
                    onClick={() => handleUserTypeChange('RIDER')}
                    sx={{ flex: 1 }}
                  >
                    <PersonIcon sx={{ color: '#861F41', mr: 1, fontSize: isMobile ? 24 : 28 }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                        Rider
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
                        Request rides
                      </Typography>
                    </Box>
                  </UserTypeOption>
                  <UserTypeOption
                    selected={userType === 'DRIVER'}
                    onClick={() => handleUserTypeChange('DRIVER')}
                    sx={{ flex: 1 }}
                  >
                    <DirectionsCarIcon sx={{ color: '#861F41', mr: 1, fontSize: isMobile ? 24 : 28 }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.9rem' : '1rem' }}>
                        Driver
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
                        Offer rides
                      </Typography>
                    </Box>
                  </UserTypeOption>
                </Box>
              </FormControl>

              {userType === 'DRIVER' && (
                <Box sx={{ mb: isMobile ? 2 : 3 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, color: '#666', fontSize: isMobile ? '0.875rem' : '1rem' }}>
                    Vehicle Information
                  </Typography>
                  <TextField
                    fullWidth
                    label="Vehicle Make"
                    name="vehicle_make"
                    variant="outlined"
                    margin="normal"
                    value={registerData.vehicle_make}
                    onChange={handleRegisterChange}
                    required
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Vehicle Model"
                    name="vehicle_model"
                    variant="outlined"
                    margin="normal"
                    value={registerData.vehicle_model}
                    onChange={handleRegisterChange}
                    required
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Vehicle Year"
                    name="vehicle_year"
                    type="number"
                    variant="outlined"
                    margin="normal"
                    value={registerData.vehicle_year}
                    onChange={handleRegisterChange}
                    required
                    inputProps={{ min: "1900", max: "2025" }}
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Vehicle Color"
                    name="vehicle_color"
                    variant="outlined"
                    margin="normal"
                    value={registerData.vehicle_color}
                    onChange={handleRegisterChange}
                    required
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                  <TextField
                    fullWidth
                    label="License Plate"
                    name="license_plate"
                    variant="outlined"
                    margin="normal"
                    value={registerData.license_plate}
                    onChange={handleRegisterChange}
                    required
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                  <TextField
                    fullWidth
                    label="Maximum Passengers"
                    name="max_passengers"
                    type="number"
                    variant="outlined"
                    margin="normal"
                    value={registerData.max_passengers}
                    onChange={handleRegisterChange}
                    required
                    inputProps={{ min: "1", max: "8" }}
                    size={isMobile ? "small" : "medium"}
                    sx={{ mb: isMobile ? 1.5 : 2 }}
                  />
                </Box>
              )}
              
              <Button
                fullWidth
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  backgroundColor: '#861F41',
                  '&:hover': { backgroundColor: '#A52A55' },
                  py: isMobile ? 1 : 1.5,
                  borderRadius: '25px',
                  textTransform: 'none',
                  fontSize: isMobile ? '14px' : '16px',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Signing Up...' : 'Sign Up'}
              </Button>
            </form>
            <Typography 
              variant="body2" 
              sx={{ 
                textAlign: 'center', 
                mt: 3, 
                color: '#861F41',
                cursor: 'pointer',
                fontSize: isMobile ? '0.8rem' : '0.875rem'
              }}
              onClick={handleSignInClick}
            >
              Already have an account? Sign In
            </Typography>
          </FormPaper>
        </SignUpContainer>

        <OverlayContainer isSignUp={isSignUp} isMobile={isMobile}>
          <Overlay>
            {isSignUp ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Welcome Back!
                </Typography>
                <Typography variant="body1" sx={{ mb: 3 }}>
                  Ready to continue your journey with ChalBeyy? Sign in to access your rides.
                </Typography>
                <Button 
                  variant="outlined" 
                  onClick={handleSignInClick}
                  sx={{ 
                    color: 'white', 
                    borderColor: 'white',
                    '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
                  }}
                >
                  Sign In
                </Button>
              </Box>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Hello, Friend!
                </Typography>
                <Typography variant="body1" sx={{ mb: 3 }}>
                  Join ChalBeyy today and experience hassle-free ride sharing.
                </Typography>
                <Button 
                  variant="outlined" 
                  onClick={handleSignUpClick}
                  sx={{ 
                    color: 'white', 
                    borderColor: 'white',
                    '&:hover': { borderColor: 'white', backgroundColor: 'rgba(255,255,255,0.1)' }
                  }}
                >
                  Sign Up
                </Button>
              </Box>
            )}
          </Overlay>
        </OverlayContainer>
      </Box>
    </StyledContainer>
  );
};

export default AuthPage; 