import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config';

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
            const response = await axios.get(`${API_BASE_URL}/api/users/me/`, {
              headers: {
                Authorization: `Token ${token}`
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
      // Use the correct login endpoint that your backend supports
      const response = await axios.post(`${API_BASE_URL}/api/users/login/`, {
        username,
        password
      });
      
      console.log('Login response status:', response.status);
      console.log('Login response data:', response.data);

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
      
      try {
        // Get user info with the new token
        const userResponse = await axios.get(`${API_BASE_URL}/api/users/me/`, {
          headers: {
            Authorization: `Token ${token}`
          }
        });
        
        // Update auth state with user data
        setAuthState({
          token,
          user: userResponse.data,
          isAuthenticated: true,
          isLoading: false
        });
        
        return { success: true, user: userResponse.data };
      } catch (userError) {
        console.error('Error fetching user data after login:', userError);
        
        // Still consider login successful even if we couldn't fetch user data
        setAuthState({
          token,
          user: null,
          isAuthenticated: true,
          isLoading: false
        });
        
        return { success: true };
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
    localStorage.removeItem('token');
    setAuthState({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false
    });
  };

  // Register function
  const register = async (userData) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/users/register/`, userData);
      
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