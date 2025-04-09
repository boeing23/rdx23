"""
Custom middleware for DRF views that handles CORS headers properly.
"""
from django.http import HttpResponse
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class DRFCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("DRF CORS Middleware initialized")
        
    def __call__(self, request):
        # Handle OPTIONS pre-flight requests for API endpoints
        if request.method == 'OPTIONS' and request.path.startswith('/api/'):
            logger.debug(f"DRF CORS middleware handling OPTIONS for API: {request.path}")
            response = HttpResponse()
            response.status_code = 200
            self._add_cors_headers(response, request)
            return response
            
        # Process the request normally
        response = self.get_response(request)
        
        # Add CORS headers for API responses
        if request.path.startswith('/api/'):
            self._add_cors_headers(response, request)
            
        return response
    
    def _add_cors_headers(self, response, request):
        """Add required CORS headers to the response"""
        origin = request.META.get('HTTP_ORIGIN')
        
        # Set appropriate Access-Control-Allow-Origin
        if origin and origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
            response["Access-Control-Allow-Origin"] = origin
        else:
            # Default to frontend if no origin or not in allowed list
            response["Access-Control-Allow-Origin"] = "https://compassionate-nurturing-production.up.railway.app"
            
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        
        if request.method == 'OPTIONS':
            response["Access-Control-Max-Age"] = "86400"  # 24 hours cache preflight results
            response.status_code = 200
            
        # Log the headers we've added for debugging
        logger.debug(f"DRF CORS middleware added headers: Origin={response.get('Access-Control-Allow-Origin')}") 