import React, { useState } from 'react';
import { Box, Container, Typography, TextField, Button, Paper, FormControl, RadioGroup, FormControlLabel, Radio, FormLabel } from '@mui/material';
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

const FormContainer = styled(Box)(({ theme }) => ({
  position: 'absolute',
  top: 0,
  height: '100%',
  transition: 'all 0.6s ease-in-out',
  padding: theme.spacing(4),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  backgroundColor: '#fff',
}));

const SignInContainer = styled(FormContainer)(({ theme }) => ({
  left: 0,
  width: '50%',
  zIndex: isSignUp => (isSignUp ? 1 : 2),
  opacity: isSignUp => (isSignUp ? 0 : 1),
  transform: isSignUp => isSignUp ? 'translateX(-100%)' : 'translateX(0)',
}));

const SignUpContainer = styled(FormContainer)(({ theme }) => ({
  left: 0,
  width: '50%',
  opacity: isSignUp => (isSignUp ? 1 : 0),
  zIndex: isSignUp => (isSignUp ? 2 : 1),
  transform: isSignUp => isSignUp ? 'translateX(100%)' : 'translateX(0)',
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
  transform: isSignUp => isSignUp ? 'translateX(-100%)' : 'translateX(0)',
}));

const Overlay = styled(Box)(({ theme }) => ({
  background: 'linear-gradient(to right, #861F41, #A52A55)',
  color: '#FFFFFF',
  position: 'relative',
  left: '-100%',
  height: '100%',
  width: '200%',
  transform: isSignUp => isSignUp ? 'translateX(50%)' : 'translateX(0)',
  transition: 'transform 0.6s ease-in-out',
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
}));

const LeftOverlayPanel = styled(OverlayPanel)(({ theme }) => ({
  transform: isSignUp => isSignUp ? 'translateX(0)' : 'translateX(-20%)',
}));

const RightOverlayPanel = styled(OverlayPanel)(({ theme }) => ({
  right: 0,
  transform: isSignUp => isSignUp ? 'translateX(20%)' : 'translateX(0)',
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

const FormPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: '10px',
  boxShadow: '0 0 15px rgba(0,0,0,0.1)',
  width: '100%',
  maxWidth: '400px',
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
        <SignInContainer isSignUp={isSignUp}>
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

        <SignUpContainer isSignUp={isSignUp}>
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
              sx={{ mb: 3 }}
            />
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
              sx={{ mb: 3 }}
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
          <Overlay isSignUp={isSignUp}>
            <LeftOverlayPanel isSignUp={isSignUp}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                Welcome Back!
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Ready to continue your journey with ChalBeyy? Sign in to access your rides and connect with fellow travelers.
              </Typography>
              <GhostButton onClick={handleSignInClick}>
                Sign In
              </GhostButton>
            </LeftOverlayPanel>
            <RightOverlayPanel isSignUp={isSignUp}>
              <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
                Hello, Friend!
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>
                Join ChalBeyy today and experience hassle-free ride sharing. Create your account to start your journey!
              </Typography>
              <GhostButton onClick={handleSignUpClick}>
                Sign Up
              </GhostButton>
            </RightOverlayPanel>
          </Overlay>
        </OverlayContainer>
      </Box>
    </StyledContainer>
  );
};

export default AuthPage; 