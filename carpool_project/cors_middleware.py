"""
Custom CORS middleware to ensure headers are properly added to responses.
"""
from django.http import HttpResponse

class CORSMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # For OPTIONS requests, return a response immediately
        if request.method == "OPTIONS":
            # Handle preflight requests
            response = HttpResponse()
            response.status_code = 200  # Ensure we return 200 OK for preflight
            response["Access-Control-Allow-Origin"] = "*"
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Max-Age"] = "86400"  # 24 hours
            return response
            
        # For non-OPTIONS requests, get response from the next middleware
        response = self.get_response(request)
        
        # Add CORS headers to every response
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        
        return response 