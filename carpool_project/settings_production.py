"""
Django production settings for carpool_project.
"""

import os
import sys
from pathlib import Path
from datetime import timedelta
import dj_database_url

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
    DATABASES = {
        'default': dj_database_url.config(
            default='sqlite:///db.sqlite3',
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=True
        )
    }
    print(f"Database engine: {DATABASES['default']['ENGINE']}", file=sys.stderr)
    print(f"Database name: {DATABASES['default'].get('NAME', 'unknown')}", file=sys.stderr)
    print(f"Database host: {DATABASES['default'].get('HOST', 'unknown')}", file=sys.stderr)
except Exception as e:
    print(f"ERROR configuring database: {e}", file=sys.stderr)
    raise

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

# Add our custom middleware to the beginning of the middleware list
MIDDLEWARE.insert(0, 'carpool_project.cors_middleware.CorsMiddleware')

# Make sure corsheaders middleware is near the beginning of the middleware list
if 'corsheaders.middleware.CorsMiddleware' in MIDDLEWARE:
    MIDDLEWARE.remove('corsheaders.middleware.CorsMiddleware')
MIDDLEWARE.insert(1, 'corsheaders.middleware.CorsMiddleware')

# Print middleware order for debugging
print("Middleware order:", file=sys.stderr)
for i, middleware in enumerate(MIDDLEWARE):
    print(f"{i}: {middleware}", file=sys.stderr)

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