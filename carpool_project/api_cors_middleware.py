"""
DRF-specific CORS middleware to ensure proper handling of preflight requests
for all Django REST Framework API endpoints.
"""
from django.http import HttpResponse
import logging

logger = logging.getLogger(__name__)

class DRFCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("DRF CORS Middleware initialized")
        
    def __call__(self, request):
        # First log the incoming request for debugging
        logger.debug(f"DRF CORS Middleware processing: {request.method} {request.path} from {request.META.get('HTTP_ORIGIN', 'unknown')}")
        
        # Handle OPTIONS preflight requests immediately
        if request.method == 'OPTIONS':
            logger.info(f"Handling OPTIONS preflight for: {request.path}")
            response = HttpResponse()
            response.status_code = 200
            self._add_cors_headers(response, request)
            return response
            
        # For non-OPTIONS requests, get the response from the view first
        response = self.get_response(request)
        
        # Then add CORS headers to the response
        self._add_cors_headers(response, request)
        
        return response
    
    def _add_cors_headers(self, response, request):
        """Add required CORS headers to the response"""
        # Always use wildcard for development/troubleshooting
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        
        if request.method == 'OPTIONS':
            response["Access-Control-Max-Age"] = "86400"  # 24 hours cache preflight results
            response.status_code = 200
            
        # Log the headers we've added for debugging
        logger.debug(f"Added CORS headers: {response.get('Access-Control-Allow-Origin')}") 