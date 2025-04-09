"""
Global CORS middleware with highest priority to handle OPTIONS requests.
This ensures preflight requests are always properly handled.
"""
from django.http import HttpResponse
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

class GlobalCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("Global CORS Middleware initialized with highest priority")
        
    def __call__(self, request):
        # First log the incoming request for debugging
        origin = request.META.get('HTTP_ORIGIN', 'unknown')
        logger.debug(f"Global CORS Middleware processing: {request.method} {request.path} from {origin}")
        
        # Handle OPTIONS preflight requests immediately with highest priority
        if request.method == 'OPTIONS':
            logger.info(f"Global middleware handling OPTIONS preflight for: {request.path}")
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
        origin = request.META.get('HTTP_ORIGIN')
        
        # Check if the origin is in the allowed list
        if origin and origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
            response["Access-Control-Allow-Origin"] = origin
        elif settings.DEBUG:
            # In debug mode, we can be more permissive
            response["Access-Control-Allow-Origin"] = origin or '*'
        else:
            # In production, only accept specific origins
            response["Access-Control-Allow-Origin"] = "https://compassionate-nurturing-production.up.railway.app"
        
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        
        # Log the headers we've added for debugging
        logger.debug(f"Global CORS middleware added headers: Origin={response.get('Access-Control-Allow-Origin')}") 