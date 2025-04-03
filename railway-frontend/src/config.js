// API Configuration
export const API_BASE_URL = 'https://rdx23-production.up.railway.app';
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app'; // Same for now, can be changed if there's a backup server

// Add constants for health check endpoints
export const API_HEALTH_CHECK_URL = `${API_BASE_URL}/api/rides/`;

// Token handling functions
export const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  if (!token) return {};
  
  // Important: Use 'Token' prefix for Django TokenAuthentication
  return {
    'Authorization': `Token ${token}`
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