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

// CORS Proxy configuration
export const USE_CORS_PROXY = true; // Set to false to disable proxy if needed
export const CORS_PROXY_URL = "https://corsproxy.io/?"; // Alternative: "https://cors-anywhere.herokuapp.com/"

export const API_BASE_URL = getApiBaseUrl();
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app';

// Function to get proxied URL if needed
export const getProxiedUrl = (url) => {
  if (USE_CORS_PROXY) {
    return `${CORS_PROXY_URL}${encodeURIComponent(url)}`;
  }
  return url;
};

// URLs for specific endpoints that need CORS proxy
export const REGISTER_URL = getProxiedUrl(`${API_BASE_URL}/api/users/register/`);
export const LOGIN_URL = getProxiedUrl(`${API_BASE_URL}/api/users/login/`);

// Add constants for health check endpoints
export const API_HEALTH_CHECK_URL = `${API_BASE_URL}/api/rides/`;

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

// Other configuration constants can be added here 