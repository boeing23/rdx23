"""
Global CORS middleware with highest priority to handle OPTIONS requests.
This ensures preflight requests are always properly handled.
"""
from django.http import HttpResponse
import logging

logger = logging.getLogger(__name__)

class GlobalCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("Global CORS Middleware initialized with highest priority")
        
    def __call__(self, request):
        # First log the incoming request for debugging
        logger.debug(f"Global CORS Middleware processing: {request.method} {request.path} from {request.META.get('HTTP_ORIGIN', 'unknown')}")
        
        # Handle OPTIONS preflight requests immediately with highest priority
        if request.method == 'OPTIONS':
            logger.info(f"Global middleware handling OPTIONS preflight for: {request.path}")
            response = HttpResponse()
            response.status_code = 200
            self._add_cors_headers(response)
            return response
            
        # For non-OPTIONS requests, get the response from the view first
        response = self.get_response(request)
        
        # Then add CORS headers to the response
        self._add_cors_headers(response)
        
        return response
    
    def _add_cors_headers(self, response):
        """Add required CORS headers to the response"""
        # Always use wildcard for development/troubleshooting
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        
        # Log the headers we've added for debugging
        logger.debug(f"Global CORS middleware added headers: {response.get('Access-Control-Allow-Origin')}") 