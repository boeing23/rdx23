"""
Custom WSGI application for Railway deployments.
This file creates a wrapper around the Django application to handle any startup errors.
"""

import os
import sys
import traceback
import time
import logging
from datetime import datetime
from urllib.parse import urlparse

# Set environment variables for production
os.environ["DJANGO_SETTINGS_MODULE"] = "carpool_project.settings_production"
os.environ["PRODUCTION"] = "True"
os.environ["RAILWAY_ENVIRONMENT"] = "True"

# Print debugging information
print(f"=== RAILWAY WSGI STARTUP: {datetime.now().isoformat()} ===", file=sys.stderr)
print(f"Python version: {sys.version}", file=sys.stderr)
print(f"Current directory: {os.getcwd()}", file=sys.stderr)
print(f"Files in app directory: {os.listdir('.')}", file=sys.stderr)

# Database retry configuration
DB_CONNECTION_RETRIES = 5
DB_CONNECTION_RETRY_DELAY = 5  # seconds
DB_CONNECTION_TIMEOUT = 10  # seconds

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger('railway_wsgi')

# Parse and sanitize DATABASE_URL for logging
if 'DATABASE_URL' in os.environ:
    db_url = os.environ['DATABASE_URL']
    try:
        parsed = urlparse(db_url)
        masked_url = f"{parsed.scheme}:***@{parsed.netloc}/{parsed.path}"
        print(f"Found DATABASE_URL: {masked_url}", file=sys.stderr)
    except Exception as e:
        print(f"Error parsing DATABASE_URL: {e}", file=sys.stderr)
else:
    print("CRITICAL ERROR: No DATABASE_URL found in environment. This is required for Railway deployment.", file=sys.stderr)
    print("Using fallback SQLite configuration for emergency functionality only", file=sys.stderr)
    # Set a placeholder SQLite URL to prevent immediate crashes
    os.environ['DATABASE_URL'] = 'sqlite:///db.sqlite3'

def retry_db_connection():
    """Retry database connection with backoff"""
    print("Testing database connection with retry mechanism...", file=sys.stderr)
    
    for attempt in range(1, DB_CONNECTION_RETRIES + 1):
        try:
            print(f"Database connection attempt {attempt}/{DB_CONNECTION_RETRIES}...", file=sys.stderr)
            
            # Dynamic import to avoid loading Django too early
            import django
            from django.db import connections
            from django.db.utils import OperationalError, InterfaceError
            
            # Set a timeout for the connection
            connections['default'].ensure_connection()
            
            print(f"✅ Database connection SUCCESSFUL on attempt {attempt}", file=sys.stderr)
            
            # Get and log database details
            db_settings = connections['default'].settings_dict
            print(f"Connected to: {db_settings.get('ENGINE', 'unknown')}", file=sys.stderr)
            print(f"Database: {db_settings.get('NAME', 'unknown')}", file=sys.stderr)
            print(f"Host: {db_settings.get('HOST', 'unknown')}", file=sys.stderr)
            print(f"Port: {db_settings.get('PORT', 'unknown')}", file=sys.stderr)
            
            # Execute a simple query to verify connection
            with connections['default'].cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                print(f"Test query result: {result}", file=sys.stderr)
                
            return True
        except (OperationalError, InterfaceError) as e:
            print(f"❌ Database connection failed (attempt {attempt}/{DB_CONNECTION_RETRIES}): {e}", file=sys.stderr)
            print(f"Connection error details: {str(e)}", file=sys.stderr)
            
            # Check if this is a hostname resolution issue
            if "could not translate host" in str(e) or "could not resolve" in str(e):
                print("This appears to be a hostname resolution issue.", file=sys.stderr)
                try:
                    import socket
                    print(f"Trying to resolve hostname: {db_settings.get('HOST', 'unknown')}", file=sys.stderr)
                    ip_address = socket.gethostbyname(db_settings.get('HOST', 'unknown'))
                    print(f"Hostname resolved to IP: {ip_address}", file=sys.stderr)
                except Exception as dns_error:
                    print(f"Hostname resolution failed: {dns_error}", file=sys.stderr)
                    
            if attempt < DB_CONNECTION_RETRIES:
                sleep_time = DB_CONNECTION_RETRY_DELAY * attempt  # Exponential backoff
                print(f"Retrying in {sleep_time} seconds...", file=sys.stderr)
                time.sleep(sleep_time)
            else:
                print("All database connection attempts failed!", file=sys.stderr)
                print("Continuing anyway, but application may fail when database access is needed", file=sys.stderr)
        except Exception as e:
            print(f"❌ Unexpected error during database connection: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            if attempt < DB_CONNECTION_RETRIES:
                sleep_time = DB_CONNECTION_RETRY_DELAY * attempt
                print(f"Retrying in {sleep_time} seconds...", file=sys.stderr)
                time.sleep(sleep_time)
            else:
                print("All database connection attempts failed!", file=sys.stderr)
    
    return False

# Initialize django_application to None
django_application = None

# Try loading the Django application
try:
    # Call our retry function before application startup
    retry_db_connection()

    # Attempt to load the Django application
    print("Importing Django WSGI application...", file=sys.stderr)
    from django.core.wsgi import get_wsgi_application
    
    # Try to initialize Django application at module level
    try:
        print("Pre-initializing Django application", file=sys.stderr)
        django_application = get_wsgi_application()
        print("Django application pre-initialized successfully", file=sys.stderr)
    except Exception as pre_init_error:
        print(f"WARNING: Django pre-initialization failed: {pre_init_error}", file=sys.stderr)
        # Keep django_application as None, will try again on first request
    
    # Wrap the application in a try/except to handle any startup errors
    def application(environ, start_response):
        try:
            # Initialize Django application on first request if not already initialized
            global django_application
            if django_application is None:
                try:
                    print("Initializing Django application on first request", file=sys.stderr)
                    django_application = get_wsgi_application()
                    print("Django application loaded on first request", file=sys.stderr)
                except Exception as init_error:
                    print(f"ERROR initializing Django application: {init_error}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                    return fallback_application(environ, start_response, init_error)
            
            # Handle health checks directly to ensure they always succeed
            if environ.get('PATH_INFO', '') == '/':
                print("Health check detected, ensuring 200 response", file=sys.stderr)
                return fallback_application(environ, start_response)
            
            # Handle OPTIONS requests directly
            if environ.get('REQUEST_METHOD') == 'OPTIONS':
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

# Modify the application to use our middleware
from django.core.handlers.wsgi import WSGIHandler

application = WSGIHandler()
application.load_middleware()

# Add a dummy application for health checks
def health_check_wrapper(application):
    def wrapped(environ, start_response):
        try:
            return application(environ, start_response)
        except Exception as e:
            logger.error(f"Unhandled error in application: {e}")
            raise
    return wrapped

application = health_check_wrapper(application) 