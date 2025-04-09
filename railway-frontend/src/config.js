// API Configuration
// Get API URL from environment or use fallbacks
const getApiBaseUrl = () => {
  // Check if environment variables are available
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
  }
  
  // Fallback URLs
  return 'https://rdx23-production.up.railway.app';
};

// Server that handles CORS properly - Railway app with CORS setup
export const API_BASE_URL = getApiBaseUrl();
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app';

// URLs for API endpoints
export const REGISTER_URL = `${API_BASE_URL}/api/users/register/`;
export const LOGIN_URL = `${API_BASE_URL}/api/users/login/`;
export const API_HEALTH_CHECK_URL = `${API_BASE_URL}/railway-status/`;

// Token handling functions
export const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  if (!token) return {};
  
  // Use Bearer prefix for JWT authentication
  return {
    'Authorization': `Bearer ${token}`
  };
};

export const getAuthHeadersWithContentType = () => {
  return {
    ...getAuthHeader(),
    'Content-Type': 'application/json'
  };
};

// Function to check if API is reachable
export const checkApiConnection = async () => {
  try {
    // First try the health check endpoint
    const response = await fetch(API_HEALTH_CHECK_URL);
    return response.status < 500; // Any response that's not a server error
  } catch (error) {
    console.error('API connection check failed:', error);
    return false;
  }
};

// Custom API caller with built-in error handling
export const callApi = async (url, method = 'GET', data = null, additionalHeaders = {}) => {
  // Basic headers for all requests
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...additionalHeaders
  };

  // For authenticated endpoints, add the auth token if available
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    console.log(`Making ${method} request to: ${url}`);
    
    // Setup request options
    const options = {
      method,
      headers,
      mode: 'cors', // Standard CORS mode
      credentials: 'omit' // Don't send cookies - avoids the wildcard + credentials issue
    };
    
    // Add body data for non-GET requests
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    // Make the fetch request
    const response = await fetch(url, options);
    
    // Check if the response is ok (status 200-299)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        detail: `Error ${response.status}: ${response.statusText}`
      }));
      
      throw new Error(errorData.detail || errorData.non_field_errors?.[0] || 
        `HTTP error ${response.status}: ${response.statusText}`);
    }
    
    // Parse and return the JSON response
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    
    // Use a more generic error message for network issues
    if (error.message === 'Failed to fetch') {
      throw new Error('Cannot connect to the server. Please check your internet connection and try again.');
    }
    
    throw error;
  }
};

// Specialized methods for common API operations
export const loginUser = async (username, password) => {
  return callApi(LOGIN_URL, 'POST', { username, password });
};

export const registerUser = async (userData) => {
  return callApi(REGISTER_URL, 'POST', userData);
};

export const getUserProfile = async () => {
  return callApi(`${API_BASE_URL}/api/users/me/`, 'GET');
};

// Other configuration constants can be added here 