import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
// Import commented out until SSO is properly configured
// import { GoogleOAuthProvider } from '@react-oauth/google';
import theme from './theme';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { AuthProvider } from './contexts/AuthContext';

// Get Google client ID from environment or use a placeholder for development
const getGoogleClientId = () => {
  if (process.env.REACT_APP_GOOGLE_CLIENT_ID) {
    return process.env.REACT_APP_GOOGLE_CLIENT_ID;
  }
  // Placeholder - actual client ID should be configured in environment variables
  return 'GOOGLE_CLIENT_ID_PLACEHOLDER';
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* Google auth provider temporarily disabled until properly configured */}
    {/* <GoogleOAuthProvider clientId={getGoogleClientId()}> */}
      <AuthProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </AuthProvider>
    {/* </GoogleOAuthProvider> */}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
