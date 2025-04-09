"""
Middleware to handle database connection errors gracefully.
"""
import logging
import sys
from django.http import JsonResponse, HttpResponse
from django.db.utils import OperationalError, InterfaceError

logger = logging.getLogger(__name__)

class DatabaseConnectionMiddleware:
    """
    Middleware that catches database connection errors and returns a friendly response.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        try:
            # Try to verify the database connection before processing the request
            from django.db import connections
            connections['default'].ensure_connection()
            
            # Process the request normally
            return self.get_response(request)
            
        except (OperationalError, InterfaceError) as e:
            # Handle database connection errors
            error_message = str(e)
            print(f"Database connection error in middleware: {error_message}", file=sys.stderr)
            logger.error(f"Database connection error: {error_message}")
            
            # Check if this is an API request
            if request.path.startswith('/api/') or request.headers.get('Accept') == 'application/json':
                return JsonResponse({
                    "error": "database_error",
                    "message": "The server is currently unable to connect to the database. Please try again later.",
                    "details": error_message if 'DEBUG' in request.environ else None
                }, status=503)
            else:
                # Return a friendly HTML response for browser requests
                html = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Service Temporarily Unavailable</title>
                    <style>
                        body {{ font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }}
                        h1 {{ color: #861F41; }}
                        .card {{ border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                        .error {{ color: #721c24; background-color: #f8d7da; padding: 10px; border-radius: 4px; margin: 20px 0; }}
                    </style>
                </head>
                <body>
                    <h1>Service Temporarily Unavailable</h1>
                    <div class="card">
                        <p>We're sorry, but the service is currently unavailable due to a database connection issue.</p>
                        <p>Our team has been notified and is working to restore service as quickly as possible.</p>
                        <p>Please try again in a few moments.</p>
                    </div>
                </body>
                </html>
                """
                return HttpResponse(html, content_type='text/html', status=503)
        except Exception as e:
            # For any other exceptions, let Django handle them normally
            logger.exception("Unexpected error in database middleware")
            raise 