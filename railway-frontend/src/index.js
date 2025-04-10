import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { GoogleOAuthProvider } from '@react-oauth/google';
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
  return '398380664395-v4r5utmd4cl4t9f6gcj6cfjt2vgddsqo.apps.googleusercontent.com'; // Placeholder ID
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={getGoogleClientId()}>
      <AuthProvider>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
