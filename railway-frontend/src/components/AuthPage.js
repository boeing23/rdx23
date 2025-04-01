import React, { useState } from 'react';
import { Box, Container, Typography, TextField, Button, Paper } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';

const StyledContainer = styled(Container)(({ theme }) => ({
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f6f5f7',
  position: 'relative',
  overflow: 'hidden',
}));

const FormContainer = styled(Paper)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  maxWidth: '400px',
  padding: theme.spacing(4),
  borderRadius: '20px',
  boxShadow: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
  transition: 'all 0.3s ease',
  '&.sign-up': {
    transform: 'translateX(100%)',
    opacity: 0,
    zIndex: 1,
  },
  '&.sign-in': {
    transform: 'translateX(0)',
    opacity: 1,
    zIndex: 2,
  },
  '&.active': {
    transform: 'translateX(0)',
    opacity: 1,
    zIndex: 5,
  },
}));

const OverlayContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: '50%',
  width: '50%',
  height: '100%',
  overflow: 'hidden',
  transition: 'transform 0.6s ease-in-out',
  zIndex: 100,
  '&.right-panel-active': {
    transform: 'translateX(-100%)',
  },
}));

const Overlay = styled(Box)(({ theme }) => ({
  background: 'linear-gradient(to right, #861F41, #A52A55)',
  color: '#FFFFFF',
  position: 'relative',
  left: '-100%',
  height: '100%',
  width: '200%',
  transform: 'translateX(0)',
  transition: 'transform 0.6s ease-in-out',
  '&.right-panel-active': {
    transform: 'translateX(50%)',
  },
}));

const OverlayPanel = styled(Box)(({ theme }) => ({
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  padding: theme.spacing(4),
  textAlign: 'center',
  top: 0,
  height: '100%',
  width: '50%',
  transform: 'translateX(0)',
  transition: 'transform 0.6s ease-in-out',
  '&.overlay-right': {
    right: 0,
    transform: 'translateX(0)',
  },
  '&.overlay-left': {
    transform: 'translateX(-20%)',
  },
  '&.right-panel-active .overlay-left': {
    transform: 'translateX(0)',
  },
  '&.right-panel-active .overlay-right': {
    transform: 'translateX(20%)',
  },
}));

const GhostButton = styled(Button)(({ theme }) => ({
  background: 'transparent',
  border: '1px solid #FFFFFF',
  color: '#FFFFFF',
  padding: theme.spacing(1, 3),
  borderRadius: '20px',
  fontSize: '14px',
  fontWeight: 'bold',
  cursor: 'pointer',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  transition: 'transform 80ms ease-in',
  '&:active': {
    transform: 'scale(0.95)',
  },
  '&:focus': {
    outline: 'none',
  },
}));

const AuthPage = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const handleSignUpClick = () => {
    setIsSignUp(true);
  };

  const handleSignInClick = () => {
    setIsSignUp(false);
  };

  return (
    <StyledContainer>
      <Box sx={{ 
        position: 'relative', 
        width: '100%', 
        maxWidth: '800px', 
        height: '600px',
        backgroundColor: '#fff',
        borderRadius: '20px',
        boxShadow: '0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22)',
        overflow: 'hidden'
      }}>
        <FormContainer className={`sign-in ${isSignUp ? 'active' : ''}`}>
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
            sx={{ mb: 3 }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            variant="outlined"
            margin="normal"
            sx={{ mb: 4 }}
          />
          <Button
            fullWidth
            variant="contained"
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
        </FormContainer>

        <FormContainer className={`sign-up ${isSignUp ? 'active' : ''}`}>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#861F41', textAlign: 'center' }}>
            Create Account
          </Typography>
          <Typography variant="body1" sx={{ mb: 4, color: '#666', textAlign: 'center' }}>
            Join ChalBeyy and start your journey today!
          </Typography>
          
          <TextField
            fullWidth
            label="Full Name"
            variant="outlined"
            margin="normal"
            sx={{ mb: 3 }}
          />
          <TextField
            fullWidth
            label="Email"
            variant="outlined"
            margin="normal"
            sx={{ mb: 3 }}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            variant="outlined"
            margin="normal"
            sx={{ mb: 4 }}
          />
          <Button
            fullWidth
            variant="contained"
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
        </FormContainer>

        <OverlayContainer className={isSignUp ? 'right-panel-active' : ''}>
          <Overlay className={isSignUp ? 'right-panel-active' : ''}>
            <OverlayPanel className="overlay-left">
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                Welcome Back!
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Ready to continue your journey with ChalBeyy? Sign in to access your rides and connect with fellow travelers.
              </Typography>
              <GhostButton onClick={handleSignInClick}>
                Sign In
              </GhostButton>
            </OverlayPanel>
            <OverlayPanel className="overlay-right">
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                Hello, Friend!
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Join ChalBeyy today and experience hassle-free ride sharing. Create your account to start your journey!
              </Typography>
              <GhostButton onClick={handleSignUpClick}>
                Sign Up
              </GhostButton>
            </OverlayPanel>
          </Overlay>
        </OverlayContainer>
      </Box>
    </StyledContainer>
  );
};

export default AuthPage; 