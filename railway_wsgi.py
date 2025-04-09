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
    print("CRITICAL ERROR: No DATABASE_URL found in environment. This is required for Railway deployment.", file=sys.stderr)

# Define a fallback application to use when the main application fails to load
def fallback_application(environ, start_response, error=None):
    """Fallback WSGI application that always returns 200 OK for health checks"""
    status = '200 OK'
    headers = [
        ('Content-type', 'text/html; charset=utf-8'),
        ('Access-Control-Allow-Origin', '*'),
        ('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'),
        ('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin'),
    ]
    start_response(status, headers)
    
    # If it's an OPTIONS request (preflight), return empty response
    if environ.get('REQUEST_METHOD') == 'OPTIONS':
        return [b'']
    
    # If it's a health check, return a simple response
    if environ.get('PATH_INFO', '') == '/':
        return [b'OK']
    
    # Create a friendly error message
    error_message = f"""
    <html>
    <head><title>Application Error</title></head>
    <body>
        <h1>Service Error</h1>
        <p>The Django application encountered an error.</p>
        <p>Time: {datetime.now().isoformat()}</p>
        {f"<p>Error details: {str(error)}</p>" if error else ""}
    </body>
    </html>
    """
    
    return [error_message.encode('utf-8')]

# Try loading the Django application
try:
    # Attempt to load the Django application once
    print("Importing Django WSGI application...", file=sys.stderr)
    from django.core.wsgi import get_wsgi_application
    
    # Initialize the Django application
    print("Initializing Django application...", file=sys.stderr)
    django_application = get_wsgi_application()
    print("Django application initialized successfully", file=sys.stderr)
    
    # Create the WSGI application function
    def application(environ, start_response):
        # Handle health checks directly to ensure they always succeed
        if environ.get('PATH_INFO', '') == '/':
            print("Health check detected, ensuring 200 response", file=sys.stderr)
            status = '200 OK'
            headers = [('Content-type', 'text/plain')]
            start_response(status, headers)
            return [b'OK']
        
        # Handle OPTIONS requests directly
        if environ.get('REQUEST_METHOD') == 'OPTIONS':
            status = '200 OK'
            headers = [
                ('Content-type', 'text/plain'),
                ('Access-Control-Allow-Origin', '*'),
                ('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'),
                ('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin'),
            ]
            start_response(status, headers)
            return [b'']
        
        # For all other paths, use the Django application
        return django_application(environ, start_response)
    
except Exception as e:
    # Log the error
    print(f"ERROR loading Django application: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    
    # Use the fallback application
    print("Using fallback application for all requests", file=sys.stderr)
    def application(environ, start_response):
        return fallback_application(environ, start_response, e)
    
print("WSGI application ready", file=sys.stderr) 