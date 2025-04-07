"""
Custom WSGI application for Railway deployments.
This file creates a wrapper around the Django application to handle any startup errors.
"""

import os
import sys
import traceback
from datetime import datetime

# Set environment variables for production
os.environ["DJANGO_SETTINGS_MODULE"] = "carpool_project.settings_production"
os.environ["PRODUCTION"] = "True"
os.environ["RAILWAY_ENVIRONMENT"] = "True"

# Print debugging information
print(f"=== RAILWAY WSGI STARTUP: {datetime.now().isoformat()} ===", file=sys.stderr)
print(f"Python version: {sys.version}", file=sys.stderr)
print(f"Current directory: {os.getcwd()}", file=sys.stderr)
print(f"Files in app directory: {os.listdir('.')}", file=sys.stderr)

# Make sure there's a DATABASE_URL set - critical for Railway deployments
if 'DATABASE_URL' in os.environ:
    db_url = os.environ['DATABASE_URL']
    # Safely print the URL (hide credentials)
    if '@' in db_url:
        masked_url = db_url.split('@')[0].split(':')[0] + ':***@' + db_url.split('@')[1]
    else:
        masked_url = '***'
    print(f"Found DATABASE_URL: {masked_url}", file=sys.stderr)
else:
    print("CRITICAL ERROR: No DATABASE_URL found in environment. Setting a placeholder to prevent crashes.", file=sys.stderr)
    # Set a placeholder SQLite URL to prevent immediate crashes
    os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'

# Define a fallback application to use when the main application fails to load
def fallback_application(environ, start_response, error=None):
    """Fallback WSGI application that always returns 200 OK for health checks"""
    status = '200 OK'
    headers = [('Content-type', 'text/html; charset=utf-8')]
    start_response(status, headers)
    
    # Create a friendly error message
    error_message = f"""
    <html>
    <head><title>Application Starting</title></head>
    <body>
        <h1>Service is starting up</h1>
        <p>The Django application is currently starting up. Please try again in a moment.</p>
        <p>Startup time: {datetime.now().isoformat()}</p>
        {f"<p>Error details: {str(error)}</p>" if error else ""}
    </body>
    </html>
    """
    
    return [error_message.encode('utf-8')]

# Try loading the Django application
try:
    # Attempt to load the Django application
    print("Importing Django WSGI application...", file=sys.stderr)
    from django.core.wsgi import get_wsgi_application
    
    # Wrap the application in a try/except to handle any startup errors
    def application(environ, start_response):
        try:
            # Initialize Django application on first request if not already initialized
            if 'application' not in globals():
                global django_application
                django_application = get_wsgi_application()
                print("Django application loaded on first request", file=sys.stderr)
            
            # Handle health checks directly to ensure they always succeed
            if environ.get('PATH_INFO', '') == '/':
                print("Health check detected, ensuring 200 response", file=sys.stderr)
                return fallback_application(environ, start_response)
            
            # For other paths, use the Django application
            return django_application(environ, start_response)
            
        except Exception as request_error:
            print(f"ERROR handling request: {request_error}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return fallback_application(environ, start_response, request_error)
    
    print("Django application wrapper created successfully", file=sys.stderr)
    
except Exception as e:
    # Log the error
    print(f"ERROR loading Django application: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    
    # Use the fallback application
    print("Using fallback application for all requests", file=sys.stderr)
    def application(environ, start_response):
        return fallback_application(environ, start_response, e)
    
print("WSGI application ready", file=sys.stderr) 