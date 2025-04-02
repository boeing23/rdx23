/**
 * Location utility functions for the ChalBeyy app
 */

// Default location for Blacksburg, VA (Virginia Tech)
export const DEFAULT_LOCATION = {
  lat: 37.2284,
  lng: -80.4234,
  label: 'Blacksburg, VA'
};

/**
 * Gets the user's current location using the browser's geolocation API
 * @returns {Promise} Promise that resolves to {lat, lng} or null if geolocation is not available
 */
export const getUserCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.log('Geolocation is not supported by this browser');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.warn('Error getting location:', error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  });
};

/**
 * Enhances a Nominatim search URL with viewbox or proximity parameters
 * @param {string} baseUrl - The base Nominatim search URL
 * @param {Object} location - The location to bias towards {lat, lng}
 * @param {number} radiusKm - The radius in kilometers to search around
 * @returns {string} Enhanced URL with viewbox or proximity parameters
 */
export const enhanceSearchUrl = (baseUrl, location, radiusKm = 10) => {
  if (!location) return baseUrl;
  
  // Calculate deltas based on radius (approximately)
  // 1 degree of latitude is ~111km, 1 degree of longitude varies by latitude
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(location.lat * Math.PI / 180));
  
  // Add viewbox parameter
  let url = baseUrl;
  url += `&viewbox=${location.lng - lonDelta},${location.lat - latDelta},${location.lng + lonDelta},${location.lat + latDelta}`;
  url += '&bounded=0'; // Don't restrict results strictly to the viewbox, just prioritize them
  
  return url;
};

/**
 * Geocodes a location string with priority given to results near a reference location
 * @param {string} locationText - The location text to geocode
 * @param {Object} nearLocation - The location to prioritize results near
 * @returns {Promise} Promise that resolves to the geocoded location
 */
export const geocodeWithPriority = async (locationText, nearLocation = null) => {
  try {
    // Base URL for Nominatim geocoding
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText)}`;
    
    // Add viewbox or proximity parameters if we have a reference location
    if (nearLocation) {
      url = enhanceSearchUrl(url, nearLocation);
    }
    
    // Add a custom user agent as per Nominatim usage policy
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ChalBeyy-RideSharing-App'
      }
    });
    
    const data = await response.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error geocoding location:', error);
    return null;
  }
}; 