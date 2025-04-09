import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  API_BASE_URL,
  loginUser,
  registerUser, 
  getUserProfile,
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
      
      // Use our login helper function
      const loginData = await loginUser(username, password);
      
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
      
      // Use our register helper function
      const registrationData = await registerUser(userData);
      
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