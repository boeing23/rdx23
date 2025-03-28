"""
Django production settings for carpool_project.
"""

import os
import sys
from pathlib import Path
from datetime import timedelta
import dj_database_url

# Import all settings from the base settings file
from .settings import *

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
DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///db.sqlite3',
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=True
    )
}

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

# CORS settings - more permissive for deployment troubleshooting
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOWED_ORIGINS = [
    "https://ridex-frontend.up.railway.app",
    "https://rdx23-production-frontend.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3006"
]

# Simplified logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
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
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

# Security settings - relaxed for troubleshooting
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # Railway handles SSL
SESSION_COOKIE_SECURE = False  # Temporarily disabled for troubleshooting
CSRF_COOKIE_SECURE = False  # Temporarily disabled for troubleshooting 