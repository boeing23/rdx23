// Test connection to backend API
import { API_BASE_URL, getAuthHeadersWithContentType } from './config';

// This is a simple utility script to test the API connection
// and the driver info extraction function

// Function to get driver information
const getDriverInfo = (ride) => {
  // Try to get driver from different places in the ride object
  let driverId = null;
  
  // Check direct driver object
  if (ride.driver && typeof ride.driver === 'object' && ride.driver.id) {
    return ride.driver;
  } 
  // Check direct driver ID
  else if (ride.driver && typeof ride.driver === 'number') {
    driverId = ride.driver;
  }
  // Check if driver is nested in ride.ride
  else if (ride.ride && ride.ride.driver) {
    driverId = ride.ride.driver;
  }
  // Check if we only have driver_id
  else if (ride.driver_id) {
    driverId = ride.driver_id;
  }
  
  // If we only have an ID, return a minimal object
  if (driverId) {
    return { id: driverId };
  }
  
  return null;
};

// Function to test the API connection
export const testApiConnection = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/rides/`, {
      headers: getAuthHeadersWithContentType()
    });
    
    if (response.ok) {
      console.log('✅ API connection successful!');
      return true;
    } else {
      console.error(`❌ API connection failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error('❌ API connection failed:', error);
    return false;
  }
};

// Function to test the getDriverInfo extraction
export const testDriverInfoExtraction = () => {
  // Test cases for different ride data structures
  const testCases = [
    {
      name: "Direct driver object",
      ride: { driver: { id: 1, name: "John Doe" } },
      expected: { id: 1, name: "John Doe" }
    },
    {
      name: "Driver as ID",
      ride: { driver: 1 },
      expected: { id: 1 }
    },
    {
      name: "Nested driver in ride",
      ride: { ride: { driver: 2 } },
      expected: { id: 2 }
    },
    {
      name: "Only driver_id",
      ride: { driver_id: 3 },
      expected: { id: 3 }
    },
    {
      name: "No driver data",
      ride: { },
      expected: null
    }
  ];
  
  // Run tests
  let passed = 0;
  testCases.forEach(test => {
    const result = getDriverInfo(test.ride);
    const success = JSON.stringify(result) === JSON.stringify(test.expected);
    
    console.log(`Test: ${test.name} - ${success ? '✅ PASSED' : '❌ FAILED'}`);
    if (!success) {
      console.log('  Expected:', test.expected);
      console.log('  Actual:', result);
    }
    
    if (success) passed++;
  });
  
  console.log(`✅ ${passed} of ${testCases.length} tests passed`);
  return passed === testCases.length;
};

// To run the tests in a browser console:
// import { testApiConnection, testDriverInfoExtraction } from './test-connection';
// testApiConnection();
// testDriverInfoExtraction(); 