"""
Custom middleware to ensure CORS headers are added to all responses.
This is a fallback in case django-cors-headers doesn't catch all responses.
"""
from django.http import HttpResponse

class CORSMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Special handling for OPTIONS requests (preflight)
        if request.method == 'OPTIONS':
            response = HttpResponse()
            response.status_code = 200
            response["Content-Length"] = "0"
        else:
            response = self.get_response(request)
        
        # Add CORS headers to all responses
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        
        return response 