"""
Custom CORS middleware to ensure headers are properly added to responses.
"""
from django.http import HttpResponse
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class CORSMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Get origin
        origin = request.META.get('HTTP_ORIGIN')
        
        # For OPTIONS requests, return a response immediately
        if request.method == "OPTIONS":
            # Handle preflight requests
            response = HttpResponse()
            response.status_code = 200  # Ensure we return 200 OK for preflight
            
            # Set appropriate Access-Control-Allow-Origin
            if origin and origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
                response["Access-Control-Allow-Origin"] = origin
            else:
                # Default to frontend if no origin or not in allowed list
                response["Access-Control-Allow-Origin"] = "https://compassionate-nurturing-production.up.railway.app"
                
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Max-Age"] = "86400"  # 24 hours
            
            logger.debug(f"CORS middleware preflight response: Origin={response.get('Access-Control-Allow-Origin')}")
            return response
            
        # For non-OPTIONS requests, get response from the next middleware
        response = self.get_response(request)
        
        # Add CORS headers to every response
        if origin and origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
            response["Access-Control-Allow-Origin"] = origin
        else:
            # Default to frontend if no origin or not in allowed list
            response["Access-Control-Allow-Origin"] = "https://compassionate-nurturing-production.up.railway.app"
            
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        
        return response 