"""Custom middleware to ensure CORS headers are added to all responses."""

class CorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Add CORS headers to all responses
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Headers"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response["Access-Control-Allow-Credentials"] = "true"
        
        # Print for debugging
        print(f"CorsMiddleware: Added CORS headers to response for {request.path}")
        
        return response 