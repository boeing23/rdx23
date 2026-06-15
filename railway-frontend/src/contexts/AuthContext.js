import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  API_BASE_URL,
  LOGIN_URL,
  REGISTER_URL,
  loginUser,
  registerUser, 
  getUserProfile,
  getAuthHeadersWithContentType,
  callApi,
  getCsrfToken,
  fetchCsrfToken
} from '../config';

/**
 * Authentication Context
 * 
 * Handles all authentication-related logic including:
 * - Login (with CSRF token support)
 * - Registration
 * - Token management
 * - User session management
 */
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
            // Get the user data with the token
            const userData = await getUserProfile();
            
            // If we got user data, the token is valid
            setAuthState({
              token,
              user: userData,
              isAuthenticated: true,
              isLoading: false
            });
          } catch (error) {
            console.error('Token validation failed:', error);
            // Clear invalid token
            localStorage.removeItem('token');
            localStorage.removeItem('userType');
            localStorage.removeItem('userId');
            
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
      console.log('Attempting login with username:', username);
      
      // Fetch CSRF token before making the login request
      console.log('Fetching CSRF token before login...');
      await fetchCsrfToken();
      
      // Get the CSRF token from cookies
      const csrfToken = getCsrfToken();
      console.log('Using CSRF token:', csrfToken);
      
      // Direct fetch request with CSRF token
      const response = await fetch(`${API_BASE_URL}/api/users/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
      });
      
      // Handle non-2xx responses
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Login error response:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.detail || 'Login failed');
        } catch (e) {
          throw new Error(errorText || 'Login failed');
        }
      }
      
      // Parse the successful response
      const loginData = await response.json();
      console.log('Login successful:', loginData);
      
      // Extract the token from response
      const token = loginData.token || loginData.access;
      
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
      if (loginData.user_type) {
        localStorage.setItem('userType', loginData.user_type);
      }
      
      // Save user ID if available
      if (loginData.user?.id) {
        localStorage.setItem('userId', loginData.user.id);
      }
      
      try {
        // Get full user profile with the new token
        const userData = await getUserProfile();
        
        // Also save user type from the user profile if available
        if (userData.user_type) {
          localStorage.setItem('userType', userData.user_type);
        }
        
        if (userData.id) {
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
        
        // Still consider login successful even if we couldn't fetch complete user data
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
        error: error.message || 'Login failed. Please check your credentials.'
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
      console.log('Attempting registration with data:', userData);
      
      // Fetch CSRF token before making the registration request
      console.log('Fetching CSRF token before registration...');
      await fetchCsrfToken();
      
      // Get the CSRF token from cookies
      const csrfToken = getCsrfToken();
      console.log('Using CSRF token for registration:', csrfToken);
      
      // Direct fetch request with CSRF token
      const response = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(userData),
        credentials: 'include'
      });
      
      // Handle non-2xx responses
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Registration error response:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.detail || 'Registration failed');
        } catch (e) {
          throw new Error(errorText || 'Registration failed');
        }
      }
      
      // Parse the successful response
      const registrationData = await response.json();
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
    register,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 