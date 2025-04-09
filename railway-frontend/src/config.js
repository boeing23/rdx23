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
export const USE_CORS_PROXY = true;
// Try a different CORS proxy service
export const CORS_PROXY_URL = "https://api.allorigins.win/raw?url=";
// Backup proxies in case the main one fails
export const BACKUP_CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://cors-anywhere.herokuapp.com/",
  "https://api.codetabs.com/v1/proxy?quest="
];

export const API_BASE_URL = getApiBaseUrl();
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app';

// Function to get proxied URL if needed
export const getProxiedUrl = (url) => {
  if (!USE_CORS_PROXY) {
    return url;
  }
  
  // Get proxy setting from localStorage or use default
  const proxyIndex = parseInt(localStorage.getItem('corsProxyIndex') || '0');
  
  // First try the main proxy
  if (proxyIndex === 0) {
    return `${CORS_PROXY_URL}${encodeURIComponent(url)}`;
  }
  
  // If a backup proxy is selected (after a failure), use it
  if (proxyIndex > 0 && proxyIndex <= BACKUP_CORS_PROXIES.length) {
    const backupProxy = BACKUP_CORS_PROXIES[proxyIndex - 1];
    return `${backupProxy}${encodeURIComponent(url)}`;
  }
  
  // If all proxies have been tried, try direct connection
  if (proxyIndex > BACKUP_CORS_PROXIES.length) {
    console.log('All proxies failed, trying direct connection');
    return url;
  }
  
  // Default to main proxy
  return `${CORS_PROXY_URL}${encodeURIComponent(url)}`;
};

// URLs for specific endpoints that don't use automatic proxying
export const REGISTER_URL = `${API_BASE_URL}/api/users/register/`;
export const LOGIN_URL = `${API_BASE_URL}/api/users/login/`;

// Add constants for health check endpoints
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

// Function to try next proxy if current one fails
export const switchToNextProxy = () => {
  // Get current proxy index
  const currentIndex = parseInt(localStorage.getItem('corsProxyIndex') || '0');
  // Switch to next proxy
  const nextIndex = currentIndex + 1;
  localStorage.setItem('corsProxyIndex', nextIndex.toString());
  console.log(`Switching to proxy #${nextIndex}`);
  return nextIndex <= BACKUP_CORS_PROXIES.length + 1; // +1 for direct connection
};

// Other configuration constants can be added here 