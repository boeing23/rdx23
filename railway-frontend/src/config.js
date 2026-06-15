// API Configuration
// Get API URL from environment or use fallbacks
const getApiBaseUrl = () => {
  // Check if environment variables are available
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
  }
  
  // Fallback URLs - use localhost for development
  return 'http://localhost:8002';
};

// Server that handles CORS properly - Railway app with CORS setup
export const API_BASE_URL = getApiBaseUrl();
export const FALLBACK_API_URL = 'http://localhost:8002';

// URLs for API endpoints
export const REGISTER_URL = `${API_BASE_URL}/api/users/register/`;
export const LOGIN_URL = `${API_BASE_URL}/api/users/login/`;
export const API_HEALTH_CHECK_URL = `${API_BASE_URL}/railway-status/`;
export const CSRF_URL = `${API_BASE_URL}/api/get-csrf-token/`;

// Function to get CSRF token from cookies
export const getCsrfToken = () => {
  const name = 'csrftoken';
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
};

// Function to fetch a fresh CSRF token
export const fetchCsrfToken = async () => {
  try {
    // First check if we already have a CSRF token in cookies
    const existingToken = getCsrfToken();
    if (existingToken) {
      console.log('Using existing CSRF token from cookies');
      return existingToken;
    }
    
    console.log('Fetching a fresh CSRF token...');
    
    try {
      // Try the Django admin login page which always sets a CSRF token
      const response = await fetch(`${API_BASE_URL}/admin/login/`, {
        method: 'GET',
        credentials: 'include', // Important for cookies
      });
      
      // If that worked, we should now have a CSRF token
      const tokenAfterAdmin = getCsrfToken();
      if (tokenAfterAdmin) {
        console.log('Got CSRF token from admin login page');
        return tokenAfterAdmin;
      }
    } catch (adminError) {
      console.log('Admin login page not available for CSRF token, trying fallback');
    }
    
    // Fallback to our custom endpoint
    try {
      const response = await fetch(CSRF_URL, {
        method: 'GET',
        credentials: 'include', // Important for cookies
      });
      
      if (response.ok) {
        const tokenAfterCustom = getCsrfToken();
        if (tokenAfterCustom) {
          console.log('Got CSRF token from custom endpoint');
          return tokenAfterCustom;
        }
      }
    } catch (csrfError) {
      console.log('Custom CSRF endpoint not available');
    }
    
    // Final fallback - just try to make any GET request to the API
    try {
      const response = await fetch(`${API_BASE_URL}/api/`, {
        method: 'GET',
        credentials: 'include',
      });
      
      const finalToken = getCsrfToken();
      if (finalToken) {
        console.log('Got CSRF token from API root');
        return finalToken;
      }
    } catch (rootError) {
      console.log('Could not get CSRF token from API root');
    }
    
    console.warn('Could not fetch a CSRF token from any endpoint');
    return null;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
};

// Token handling functions
export const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  if (!token) return {};
  
  // Use Bearer prefix for JWT authentication
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  };
};

export const getAuthHeadersWithContentType = () => {
  return {
    ...getAuthHeader(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
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
    'Origin': window.location.origin,
    ...additionalHeaders
  };

  // For authenticated endpoints, add the auth token if available
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add CSRF token for non-exempt routes
  // Skip CSRF token for login/register/social routes which are typically CSRF exempt
  const isAuthRoute = url.includes('/login/') || url.includes('/register/') || url.includes('/social/');
  
  if (!isAuthRoute) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
  }

  try {
    console.log(`Making ${method} request to: ${url}`);
    console.log('Request headers:', headers);
    
    // Setup request options
    const options = {
      method,
      headers,
      mode: 'cors',
      credentials: 'include' // Always include credentials for cookie handling
    };
    
    // Add body data for non-GET requests
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
      console.log('Request body:', options.body);
    }
    
    // Make the fetch request
    const response = await fetch(url, options);
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
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
    console.error('Full error details:', {
      message: error.message,
      url,
      method,
      headers
    });
    
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