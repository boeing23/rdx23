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
// The proxies we're using have different issues, let's switch to a different approach
export const CORS_PROXY_URL = "https://proxy.cors.sh/";
// Backup proxies in case the main one fails
export const BACKUP_CORS_PROXIES = [
  "https://thingproxy.freeboard.io/fetch/",
  "https://cors-proxy.fringe.zone/",
  "https://cors-anywhere.herokuapp.com/"
];

export const API_BASE_URL = getApiBaseUrl();
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app';

// Request headers to ensure we get JSON responses, not HTML
export const getProxyHeaders = () => {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Cors-Proxy-Request': 'true',
  };
};

// Function to get proxied URL if needed
export const getProxiedUrl = (url) => {
  if (!USE_CORS_PROXY) {
    return url;
  }
  
  // Get proxy setting from localStorage or use default
  const proxyIndex = parseInt(localStorage.getItem('corsProxyIndex') || '0');
  
  // First try the main proxy
  if (proxyIndex === 0) {
    return `${CORS_PROXY_URL}${url}`;
  }
  
  // If a backup proxy is selected (after a failure), use it
  if (proxyIndex > 0 && proxyIndex <= BACKUP_CORS_PROXIES.length) {
    const backupProxy = BACKUP_CORS_PROXIES[proxyIndex - 1];
    return `${backupProxy}${url}`;
  }
  
  // If all proxies have been tried, try direct connection
  if (proxyIndex > BACKUP_CORS_PROXIES.length) {
    console.log('All proxies failed, trying direct connection');
    return url;
  }
  
  // Default to main proxy
  return `${CORS_PROXY_URL}${url}`;
};

// Alternative approach - setup a function to make proxied requests directly
export const makeProxiedRequest = async (url, method = 'GET', data = null, headers = {}) => {
  // Get proxy setting from localStorage or use default
  const proxyIndex = parseInt(localStorage.getItem('corsProxyIndex') || '0');
  
  // Base headers that ensure we get JSON
  const baseHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  };
  
  // Create a complete headers object
  const completeHeaders = {
    ...baseHeaders,
    ...headers
  };
  
  // Try direct connection first if we've tried all proxies
  if (proxyIndex > BACKUP_CORS_PROXIES.length) {
    console.log('Trying direct API connection...');
    
    try {
      const response = await fetch(url, {
        method,
        headers: completeHeaders,
        body: data ? JSON.stringify(data) : undefined,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Direct API connection failed:', error);
      throw error;
    }
  }
  
  // Get appropriate proxy URL
  let proxyUrl;
  if (proxyIndex === 0) {
    proxyUrl = CORS_PROXY_URL;
  } else if (proxyIndex <= BACKUP_CORS_PROXIES.length) {
    proxyUrl = BACKUP_CORS_PROXIES[proxyIndex - 1];
  } else {
    proxyUrl = CORS_PROXY_URL; // Fallback to main proxy as last resort
  }
  
  // Add proxy-specific headers
  const proxyHeaders = { 
    ...completeHeaders,
    'X-Cors-Proxy-Request': 'true'
  };
  
  // Make the proxied request
  try {
    console.log(`Making ${method} request via proxy: ${proxyUrl}${url}`);
    
    const response = await fetch(`${proxyUrl}${url}`, {
      method,
      headers: proxyHeaders,
      body: data ? JSON.stringify(data) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
    
    // Try to parse JSON
    try {
      return await response.json();
    } catch (parseError) {
      console.error('Error parsing JSON response', parseError);
      const text = await response.text();
      console.error('Raw response:', text);
      throw new Error('Invalid JSON response from server');
    }
  } catch (error) {
    console.error(`Proxy request failed (index: ${proxyIndex}):`, error);
    
    // Try the next proxy
    switchToNextProxy();
    
    // If we have more proxies to try, retry the request recursively
    if (proxyIndex < BACKUP_CORS_PROXIES.length + 1) {
      console.log('Retrying with next proxy...');
      return makeProxiedRequest(url, method, data, headers);
    }
    
    throw error;
  }
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