import React, { useState } from 'react';
import { Box, Container, Typography, TextField, Button, Paper, FormControl, FormLabel, Alert } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';
import { API_BASE_URL } from '../config';

const StyledContainer = styled(Container)(({ theme }) => ({
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f6f5f7',
  position: 'relative',
  overflow: 'hidden',
}));

const FormContainer = styled(Box)(({ theme, isActive }) => ({
  position: 'absolute',
  top: 0,
  height: '100%',
  width: '50%',
  transition: 'all 0.6s ease-in-out',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#fff',
  opacity: isActive ? 1 : 0,
  zIndex: isActive ? 5 : 1,
}));

const SignInContainer = styled(FormContainer)(({ theme, isActive }) => ({
  left: 0,
  transform: isActive ? 'translateX(0)' : 'translateX(-100%)',
}));

const SignUpContainer = styled(FormContainer)(({ theme, isActive }) => ({
  left: '50%',
  transform: isActive ? 'translateX(0)' : 'translateX(100%)',
}));

const OverlayContainer = styled(Box)(({ theme, isSignUp }) => ({
  position: 'absolute',
  top: 0,
  left: isSignUp ? 0 : '50%',
  width: '50%',
  height: '100%',
  overflow: 'hidden',
  transition: 'transform 0.6s ease-in-out, left 0.6s ease-in-out',
  zIndex: 10,
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

const FormPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: '10px',
  boxShadow: '0 0 15px rgba(0,0,0,0.1)',
  width: '90%',
  maxWidth: '400px',
  maxHeight: '90%',
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
  const [isSignUp, setIsSignUp] = useState(false);
  const [userType, setUserType] = useState('RIDER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
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
  });
  
  const navigate = useNavigate();

  const handleSignUpClick = () => {
    setIsSignUp(true);
    setError('');
  };

  const handleSignInClick = () => {
    setIsSignUp(false);
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
          // If not JSON, show the raw error
          setError(`Registration failed: ${errorText.substring(0, 100)}...`);
        }
        return;
      }
      
      const data = await response.json();
      console.log('Registration response:', data);

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
        maxWidth: '900px', 
        height: '600px',
        backgroundColor: '#fff',
        borderRadius: '20px',
        boxShadow: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
        overflow: 'hidden'
      }}>
        <SignInContainer isActive={!isSignUp}>
          <FormPaper>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41', textAlign: 'center' }}>
              Welcome Back!
            </Typography>
            <Typography variant="body1" sx={{ mb: 2, color: '#666', textAlign: 'center' }}>
              Ready to continue your journey with ChalBeyy?
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 3 }}
              />
              <Button
                fullWidth
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  backgroundColor: '#861F41',
                  '&:hover': { backgroundColor: '#A52A55' },
                  py: 1.5,
                  borderRadius: '25px',
                  textTransform: 'none',
                  fontSize: '16px',
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
                cursor: 'pointer'
              }}
              onClick={handleSignUpClick}
            >
              Don't have an account? Sign Up
            </Typography>
          </FormPaper>
        </SignInContainer>

        <SignUpContainer isActive={isSignUp}>
          <FormPaper>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41', textAlign: 'center' }}>
              Create Account
            </Typography>
            <Typography variant="body1" sx={{ mb: 2, color: '#666', textAlign: 'center' }}>
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
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
                sx={{ mb: 2 }}
              />
              
              <FormControl component="fieldset" sx={{ width: '100%', mb: 3 }}>
                <FormLabel component="legend" sx={{ mb: 1, color: '#666' }}>I want to register as:</FormLabel>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <UserTypeOption
                    selected={userType === 'RIDER'}
                    onClick={() => handleUserTypeChange('RIDER')}
                    sx={{ flex: 1 }}
                  >
                    <PersonIcon sx={{ color: '#861F41', mr: 1, fontSize: 28 }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Rider</Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>Request rides</Typography>
                    </Box>
                  </UserTypeOption>
                  <UserTypeOption
                    selected={userType === 'DRIVER'}
                    onClick={() => handleUserTypeChange('DRIVER')}
                    sx={{ flex: 1 }}
                  >
                    <DirectionsCarIcon sx={{ color: '#861F41', mr: 1, fontSize: 28 }} />
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Driver</Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>Offer rides</Typography>
                    </Box>
                  </UserTypeOption>
                </Box>
              </FormControl>
              
              <Button
                fullWidth
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  backgroundColor: '#861F41',
                  '&:hover': { backgroundColor: '#A52A55' },
                  py: 1.5,
                  borderRadius: '25px',
                  textTransform: 'none',
                  fontSize: '16px',
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
                cursor: 'pointer'
              }}
              onClick={handleSignInClick}
            >
              Already have an account? Sign In
            </Typography>
          </FormPaper>
        </SignUpContainer>

        <OverlayContainer isSignUp={isSignUp}>
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