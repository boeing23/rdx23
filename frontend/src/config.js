// API Configuration
// Prefer the REACT_APP_API_URL env var (set per environment, e.g. on Railway);
// fall back to the production backend. For local dev set
// REACT_APP_API_URL=http://localhost:8000 in a .env file.
export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'https://rdx23-production.up.railway.app';

// Other configuration constants can be added here

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

// Function to make API calls with CSRF token
export const callApi = async (url, method = 'GET', data = null) => {
  try {
    // Get CSRF token
    const csrfToken = getCsrfToken();
    
    // Set up headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    // Add CSRF token if available
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }
    
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Set up request options
    const options = {
      method,
      headers,
      credentials: 'include', // Important for sending cookies
    };
    
    // Add body for non-GET requests
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    
    // Make the request
    const response = await fetch(url, options);
    
    // Check for error responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: `Error ${response.status}: ${response.statusText}`
      }));
      throw new Error(errorData.message || errorData.detail || `HTTP error ${response.status}: ${response.statusText}`);
    }
    
    // Return the JSON response
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    console.log('Full error details:', error);
    throw error;
  }
}; 