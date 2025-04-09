"""
Django production settings for carpool_project.
"""

import os
import sys
from pathlib import Path
from datetime import timedelta
import dj_database_url
import traceback

# Print version info
print("Initializing Django settings...", file=sys.stderr)
print(f"Python version: {sys.version}", file=sys.stderr)
print(f"Current directory: {os.getcwd()}", file=sys.stderr)

# Import all settings from the base settings file
try:
    from .settings import *
    print("Successfully imported base settings", file=sys.stderr)
except Exception as e:
    print(f"ERROR importing base settings: {e}", file=sys.stderr)
    raise

# Override settings for production
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# Print settings information for debugging
print(f"Running with DEBUG={DEBUG}", file=sys.stderr)
print(f"DATABASE_URL is {'set' if 'DATABASE_URL' in os.environ else 'NOT SET'}", file=sys.stderr)
print(f"ALLOWED_HOSTS={os.environ.get('ALLOWED_HOSTS', '.railway.app')}", file=sys.stderr)

# Use environment variable for secret key with a fallback
SECRET_KEY = os.environ.get('SECRET_KEY', 'temporary-key-for-build-only')

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '.railway.app', '*']

# Database - use DATABASE_URL from environment
try:
    # Check if we're running on Railway
    is_on_railway = 'RAILWAY_ENVIRONMENT' in os.environ or 'RAILWAY_SERVICE_ID' in os.environ
    
    # Print debug info
    if 'DATABASE_URL' in os.environ:
        db_url = os.environ['DATABASE_URL']
        db_url_masked = '***' if '@' not in db_url else db_url.split('@')[0].split(':')[0] + ':***@' + db_url.split('@')[1]
        print(f"Found DATABASE_URL: {db_url_masked}", file=sys.stderr)
        print(f"Database URL starts with: {db_url[:10]}...", file=sys.stderr)
    else:
        print("No DATABASE_URL found in environment", file=sys.stderr)
    
    # Configure database - on Railway, we should use the provided DATABASE_URL
    if is_on_railway:
        # Railway provides its own DATABASE_URL
        print("Running on Railway, using provided DATABASE_URL", file=sys.stderr)
        
        # Parse the DATABASE_URL to check its format
        if 'DATABASE_URL' in os.environ:
            raw_db_url = os.environ['DATABASE_URL']
            
            # Log connection attempt details
            print(f"Attempting to connect to database using URL: {raw_db_url[:10]}...", file=sys.stderr)
            
            # Configure database with Railway settings
            DATABASES = {
                'default': dj_database_url.config(
                    conn_max_age=600,
                    conn_health_checks=True,
                    ssl_require=True
                )
            }
        else:
            raise Exception("No DATABASE_URL found in Railway environment")
    else:
        # For local development, use SQLite
        print("Running locally, using SQLite database", file=sys.stderr)
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
            }
        }
    
    # Log database details (safely)
    print(f"Database engine: {DATABASES['default']['ENGINE']}", file=sys.stderr)
    if 'NAME' in DATABASES['default']:
        print(f"Database name: {DATABASES['default']['NAME']}", file=sys.stderr)
    if 'HOST' in DATABASES['default']:
        print(f"Database host: {DATABASES['default']['HOST']}", file=sys.stderr)
    
    # Import and use our enhanced database connection helper
    try:
        from .database_helpers import update_database_settings
        DATABASES = update_database_settings(DATABASES)
        print("Enhanced database connection parameters applied", file=sys.stderr)
    except Exception as e:
        print(f"Failed to apply enhanced database parameters: {e}", file=sys.stderr)
        print(traceback.format_exc(), file=sys.stderr)

except Exception as e:
    print(f"ERROR configuring database: {e}", file=sys.stderr)
    print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
    # Provide a fallback SQLite configuration instead of failing
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
        }
    }
    print("Using fallback SQLite database due to configuration error", file=sys.stderr)

# Add a custom middleware to gracefully handle database connection errors
# Make sure it's added early in the middleware list
db_middleware = 'carpool_project.db_middleware.DatabaseConnectionMiddleware'
if db_middleware not in MIDDLEWARE:
    MIDDLEWARE.insert(0, db_middleware)

# Increase database connection timeouts
for db in DATABASES.values():
    db.setdefault('CONN_MAX_AGE', 60)
    db.setdefault('CONN_HEALTH_CHECKS', True)
    db.setdefault('OPTIONS', {})
    db.setdefault('ATOMIC_REQUESTS', True)
    
    # Add timeout and keepalive settings
    if db.get('ENGINE') == 'django.db.backends.postgresql':
        db['OPTIONS'].setdefault('connect_timeout', 10)
        db['OPTIONS'].setdefault('keepalives', 1)
        db['OPTIONS'].setdefault('keepalives_idle', 30)
        db['OPTIONS'].setdefault('keepalives_interval', 10)
        db['OPTIONS'].setdefault('keepalives_count', 5)

# Print final database configuration for debugging
print(f"Final database configuration: ENGINE={DATABASES['default']['ENGINE']}, HOST={DATABASES['default'].get('HOST', 'N/A')}", file=sys.stderr)

# Static files
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATIC_URL = '/static/'

# Email settings from environment
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 465))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'False') == 'True'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'True') == 'True'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER
SERVER_EMAIL = EMAIL_HOST_USER

# CORS settings - very permissive for troubleshooting
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ORIGIN_ALLOW_ALL = True

# Make sure corsheaders middleware is at the beginning of the middleware list
if 'corsheaders.middleware.CorsMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('corsheaders.middleware.CorsMiddleware')
MIDDLEWARE.insert(0, 'corsheaders.middleware.CorsMiddleware')

# Remove CorsPostCsrfMiddleware if it's causing errors
if 'corsheaders.middleware.CorsPostCsrfMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('corsheaders.middleware.CorsPostCsrfMiddleware')

# Remove custom CORS middleware if it's causing issues
if 'carpool_project.cors_middleware.CORSMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('carpool_project.cors_middleware.CORSMiddleware')

# Explicit CORS allowed origins
CORS_ALLOWED_ORIGINS = [
    "https://ridex-frontend.up.railway.app",
    "https://rdx23-production-frontend.up.railway.app",
    "https://compassionate-nurturing-production.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3006"
]

# Very permissive CORS settings for debugging
CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "*",
]

# Very verbose logging for debugging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'django.db.backends': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'gunicorn': {
            'handlers': ['console'],
            'level': 'INFO',
        },
        'corsheaders': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

print("Django settings loaded successfully", file=sys.stderr)

# Security settings - relaxed for troubleshooting
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # Railway handles SSL
SESSION_COOKIE_SECURE = False  # Temporarily disabled for troubleshooting
CSRF_COOKIE_SECURE = False  # Temporarily disabled for troubleshooting 