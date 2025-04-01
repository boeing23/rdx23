import React, { useState } from 'react';
import { Box, Container, Typography, TextField, Button, Paper, FormControl, FormLabel } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PersonIcon from '@mui/icons-material/Person';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const navigate = useNavigate();

  const handleSignUpClick = () => {
    setIsSignUp(true);
  };

  const handleSignInClick = () => {
    setIsSignUp(false);
  };

  const handleUserTypeChange = (type) => {
    setUserType(type);
  };

  const handleLogin = () => {
    // Simulated login logic
    console.log('Logging in with:', { email, password });
    // navigate to appropriate page after login
    navigate(userType === 'DRIVER' ? '/offer' : '/rides');
  };

  const handleSignup = () => {
    // Simulated signup logic
    console.log('Signing up with:', { fullName, email, password, userType });
    // navigate to appropriate page after signup
    navigate(userType === 'DRIVER' ? '/offer' : '/rides');
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
            <Typography variant="body1" sx={{ mb: 4, color: '#666', textAlign: 'center' }}>
              Ready to continue your journey with ChalBeyy?
            </Typography>
            
            <TextField
              fullWidth
              label="Email"
              variant="outlined"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 3 }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 4 }}
            />
            <Button
              fullWidth
              variant="contained"
              onClick={handleLogin}
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
              Sign In
            </Button>
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
            <Typography variant="body1" sx={{ mb: 3, color: '#666', textAlign: 'center' }}>
              Join ChalBeyy and start your journey today!
            </Typography>
            
            <TextField
              fullWidth
              label="Full Name"
              variant="outlined"
              margin="normal"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Email"
              variant="outlined"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              variant="contained"
              onClick={handleSignup}
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
              Sign Up
            </Button>
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