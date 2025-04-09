# Railway CORS Proxy

A dedicated CORS proxy service designed to sit between the frontend and backend services on Railway, ensuring proper CORS headers are applied to all API requests.

## Features

- Proxies requests from frontend to backend with proper CORS headers
- Handles preflight OPTIONS requests automatically
- Provides debug endpoints for troubleshooting
- Custom error handling and logging
- Docker support for easy deployment

## Local Development

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm run dev
   ```

3. The proxy will be available at `http://localhost:3001`

## Usage

### Proxied Endpoints

- General proxy: `http://localhost:3001/proxy/any/backend/path`
- Direct registration endpoint: `http://localhost:3001/api/users/register`
- Direct login endpoint: `http://localhost:3001/api/users/login`

### Debug Endpoints

- Health check: `http://localhost:3001/`
- Request debug: `http://localhost:3001/debug`

## Environment Variables

- `PORT`: Port to run the server on (default: 3001)
- `BACKEND_URL`: URL of the backend service (default: https://rdx23-production.up.railway.app)
- `NODE_ENV`: Environment mode (development/production)

## Deployment to Railway

1. Create a new service in your Railway project:
   ```
   railway init
   ```

2. Link to your existing project:
   ```
   railway link
   ```

3. Set environment variables:
   ```
   railway variables set BACKEND_URL=https://rdx23-production.up.railway.app
   ```

4. Deploy the service:
   ```
   railway up
   ```

## Updating Frontend to Use the Proxy

Update your frontend `config.js` to point to the proxy service:

```javascript
export const API_BASE_URL = 'https://your-proxy-service.up.railway.app';
export const REGISTER_URL = `${API_BASE_URL}/api/users/register/`;
export const LOGIN_URL = `${API_BASE_URL}/api/users/login/`;
```

## Monitoring and Logs

Check the service logs in Railway dashboard to monitor requests and debug any issues.

## License

MIT 