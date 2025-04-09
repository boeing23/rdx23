import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL, REGISTER_URL, LOGIN_URL, getProxiedUrl } from '../config';

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
            const response = await axios.get(getProxiedUrl(`${API_BASE_URL}/api/users/me/`), {
              headers: {
                Authorization: `Bearer ${token}`
              }
            });
            
            setAuthState({
              token,
              user: response.data,
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

  // Login function
  const login = async (username, password) => {
    try {
      console.log('Attempting login with credentials:', { username });
      
      // Use the proxied login endpoint
      const proxiedLoginUrl = getProxiedUrl(LOGIN_URL);
      console.log('Using proxied login URL:', proxiedLoginUrl);
      
      const response = await axios.post(proxiedLoginUrl, {
        username,
        password
      });
      
      console.log('Login response status:', response.status);
      console.log('Login response data:', response.data);

      // Django REST Framework SimpleJWT returns tokens as 'access' and 'refresh'
      // But our custom login endpoint returns 'token'
      const token = response.data.token || response.data.access;
      
      if (!token) {
        console.error('No token received in login response');
        return { 
          success: false, 
          error: 'Invalid server response. Please try again.'
        };
      }
      
      // Save token to local storage
      localStorage.setItem('token', token);
      
      // Save user type if available
      if (response.data.user_type) {
        // Save user type as a plain string, not stringified JSON
        localStorage.setItem('userType', response.data.user_type);
      }
      
      try {
        // Get user info with the new token
        const userUrl = `${API_BASE_URL}/api/users/me/`;
        const proxiedUserUrl = getProxiedUrl(userUrl);
        console.log('Fetching user data from:', proxiedUserUrl);
        
        const userResponse = await axios.get(proxiedUserUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        console.log('User data fetched successfully:', userResponse.data);
        
        // Also save user type from the user info if available
        if (userResponse.data && userResponse.data.user_type) {
          localStorage.setItem('userType', userResponse.data.user_type);
        }
        
        // Update auth state with user data
        setAuthState({
          token,
          user: userResponse.data,
          isAuthenticated: true,
          isLoading: false
        });
        
        // Store user ID for other components
        if (userResponse.data && userResponse.data.id) {
          localStorage.setItem('userId', userResponse.data.id);
        }
        
        // Store userType for routing purposes
        const effectiveUserType = userResponse.data?.user_type || response.data?.user_type || 'RIDER';
        console.log('Login successful, user type:', effectiveUserType);
        
        // Dispatch auth change event for components that listen to localStorage
        window.dispatchEvent(new Event('auth-change'));
        
        return { 
          success: true, 
          user: userResponse.data,
          userType: effectiveUserType
        };
      } catch (userError) {
        console.error('Error fetching user data after login:', userError);
        
        // Still consider login successful even if we couldn't fetch user data
        // Just use the data we got from the login response
        const userData = response.data.user || { user_type: response.data.user_type };
        
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
      
      // Provide better error information
      if (error.response) {
        if (error.response.status === 500) {
          return {
            success: false,
            error: 'Server error. Please try again later.'
          };
        }
        
        return { 
          success: false, 
          error: error.response?.data?.detail || error.response?.data?.non_field_errors?.[0] || 'Login failed. Please check your credentials.'
        };
      }
      
      return {
        success: false,
        error: 'Network error. Please check your connection and try again.'
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

  // Register function
  const register = async (userData) => {
    try {
      const response = await axios.post(REGISTER_URL, userData);
      
      return { success: true, user: response.data };
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.response?.data || 'Registration failed. Please try again.'
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