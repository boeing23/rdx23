// API Configuration
export const API_BASE_URL = 'https://rdx23-production.up.railway.app';
export const FALLBACK_API_URL = 'https://rdx23-production.up.railway.app'; // Same for now, can be changed if there's a backup server

// Function to check if API is reachable
export const checkApiConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${API_BASE_URL}/api/health-check/`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('API connection check failed:', error);
    return false;
  }
};

// Other configuration constants can be added here 