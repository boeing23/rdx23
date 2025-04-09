import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { 
  API_BASE_URL, 
  REGISTER_URL, 
  LOGIN_URL, 
  getProxiedUrl, 
  switchToNextProxy, 
  makeProxiedRequest,
  getProxyHeaders,
  getAuthHeadersWithContentType
} from '../config';

// Create auth context
const AuthContext = createContext(null);

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    token: null,
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Initialize auth state from local storage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        
        if (token) {
          // Validate token by making a request to the backend
          try {
            // Reset proxy selection each session
            localStorage.setItem('corsProxyIndex', '0');
            
            // Use our new makeProxiedRequest function with the token
            const userData = await makeProxiedRequest(
              `${API_BASE_URL}/api/users/me/`,
              'GET',
              null,
              { 'Authorization': `Bearer ${token}` }
            );
            
            // If the request succeeds, set auth state
            setAuthState({
              token,
              user: userData,
              isAuthenticated: true,
              isLoading: false
            });
          } catch (error) {
            console.error('Error validating token:', error);
            localStorage.removeItem('token');
            setAuthState({
              token: null,
              user: null,
              isAuthenticated: false,
              isLoading: false
            });
          }
        } else {
          setAuthState({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false
          });
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setAuthState({
          token: null,
          user: null,
          isAuthenticated: false,
          isLoading: false
        });
      }
    };

    initializeAuth();
  }, []);

  // Login function with proxy retry mechanism
  const login = async (username, password) => {
    // Reset proxy index at the start of a new login attempt
    localStorage.setItem('corsProxyIndex', '0');
    
    try {
      console.log('Attempting login with username:', username);
      
      // Use our new makeProxiedRequest function
      const loginData = await makeProxiedRequest(
        LOGIN_URL,
        'POST',
        { username, password },
        getProxyHeaders()
      );
      
      console.log('Login response data:', loginData);
      
      // Extract token from the response
      const token = loginData.token || loginData.access;
      
      if (!token) {
        console.error('No token received in login response');
        return { 
          success: false, 
          error: 'Invalid server response. Please try again.'
        };
      }
      
      // Save token and user type to local storage
      localStorage.setItem('token', token);
      
      if (loginData.user_type) {
        localStorage.setItem('userType', loginData.user_type);
      }
      
      // Fetch user details
      try {
        // Get user data with the token
        const userData = await makeProxiedRequest(
          `${API_BASE_URL}/api/users/me/`,
          'GET',
          null,
          { 'Authorization': `Bearer ${token}` }
        );
        
        console.log('User data fetched successfully:', userData);
        
        // Save additional user information
        if (userData && userData.user_type) {
          localStorage.setItem('userType', userData.user_type);
        }
        
        if (userData && userData.id) {
          localStorage.setItem('userId', userData.id);
        }
        
        // Update auth state
        setAuthState({
          token,
          user: userData,
          isAuthenticated: true,
          isLoading: false
        });
        
        // Dispatch auth change event
        window.dispatchEvent(new Event('auth-change'));
        
        // Return success with user data
        const effectiveUserType = userData?.user_type || loginData?.user_type || 'RIDER';
        return { 
          success: true, 
          user: userData,
          userType: effectiveUserType
        };
      } catch (userError) {
        console.error('Error fetching user data after login:', userError);
        
        // Consider login successful even without complete user data
        const userData = loginData.user || { user_type: loginData.user_type };
        
        setAuthState({
          token,
          user: userData,
          isAuthenticated: true,
          isLoading: false
        });
        
        // Dispatch auth change event
        window.dispatchEvent(new Event('auth-change'));
        
        return { success: true, user: userData };
      }
    } catch (error) {
      console.error('Login error:', error);
      
      return {
        success: false,
        error: error.message || 'Login failed. Please try again.'
      };
    }
  };

  // Logout function
  const logout = () => {
    console.log('Logging out, clearing localStorage and authState');
    
    // Clear all auth-related items from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    
    // Reset auth state
    setAuthState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false
    });
    
    // Force a page reload to ensure clean state
    window.location.href = '/login';
  };

  // Register function with proxy retry mechanism
  const register = async (userData) => {
    // Reset proxy index at the start
    localStorage.setItem('corsProxyIndex', '0');
    
    try {
      console.log('Attempting registration with data:', userData);
      
      // Use our new makeProxiedRequest function
      const registrationData = await makeProxiedRequest(
        REGISTER_URL,
        'POST',
        userData,
        getProxyHeaders()
      );
      
      console.log('Registration successful:', registrationData);
      return { success: true, user: registrationData };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.message || 'Registration failed. Please try again.'
      };
    }
  };

  // Context value
  const value = {
    authState,
    login,
    logout,
    register
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 