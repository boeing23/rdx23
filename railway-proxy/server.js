/**
 * Railway CORS Proxy Server
 * 
 * This service acts as a proxy between the frontend and backend services,
 * ensuring proper CORS headers are applied to all responses.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Configuration
const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_URL || 'https://rdx23-production.up.railway.app';
const ALLOWED_ORIGINS = [
  'https://compassionate-nurturing-production.up.railway.app',
  'https://rdx23-production-frontend.up.railway.app',
  'http://localhost:3000'
];

// Create Express app
const app = express();

// Logging middleware
app.use(morgan('combined'));

// CORS middleware with proper configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      console.warn(`Request from disallowed origin: ${origin}`);
      // Still allow the request in production for flexibility
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Special handling for OPTIONS requests
app.options('*', (req, res) => {
  console.log(`Handling OPTIONS request for ${req.path}`);
  res.status(200).end();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Railway CORS proxy is running',
    backend: BACKEND_URL,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check headers
app.get('/debug', (req, res) => {
  res.json({
    headers: req.headers,
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
});

// Proxy configuration
const proxyOptions = {
  target: BACKEND_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/proxy': '' // Remove /proxy prefix when forwarding
  },
  // Customize the proxied request
  onProxyReq: (proxyReq, req, res) => {
    // Log the proxied request
    console.log(`Proxying ${req.method} request to: ${BACKEND_URL}${req.path.replace(/^\/proxy/, '')}`);
    
    // If the request has a body, we need to restream it
    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  // Customize the response from the backend
  onProxyRes: (proxyRes, req, res) => {
    // Ensure CORS headers are present in the response
    proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin';
    proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
    proxyRes.headers['Access-Control-Max-Age'] = '86400'; // 24 hours
    
    // Log response status
    console.log(`Proxy response from ${req.path}: ${proxyRes.statusCode}`);
  },
  // Error handling
  onError: (err, req, res) => {
    console.error(`Proxy error: ${err.message}`);
    res.status(500).json({
      error: 'Proxy Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
      timestamp: new Date().toISOString()
    });
  }
};

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up the proxy middleware for routes starting with /proxy
app.use('/proxy', createProxyMiddleware(proxyOptions));

// Specific proxy for registration endpoint (without /proxy prefix for simplicity)
app.use('/api/users/register', createProxyMiddleware({
  ...proxyOptions,
  pathRewrite: {
    '^/api/users/register': '/api/users/register' // Don't rewrite this path
  }
}));

// Specific proxy for login endpoint (without /proxy prefix for simplicity)
app.use('/api/users/login', createProxyMiddleware({
  ...proxyOptions,
  pathRewrite: {
    '^/api/users/login': '/api/users/login' // Don't rewrite this path
  }
}));

// General error handler
app.use((err, req, res, next) => {
  console.error(`Server error: ${err.message}`);
  res.status(500).json({
    error: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Railway CORS Proxy running on port ${PORT}`);
  console.log(`Proxying requests to: ${BACKEND_URL}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
}); 