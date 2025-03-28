"""
Django production settings for carpool_project.
"""

import os
from pathlib import Path
from datetime import timedelta
import dj_database_url

# Import all settings from the base settings file
from .settings import *

# Override settings for production
DEBUG = False

# Use environment variable for secret key with a fallback
SECRET_KEY = os.environ.get('SECRET_KEY', 'temporary-key-for-build-only')

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '.railway.app', '*']

# Database - use DATABASE_URL from environment
DATABASES = {
    'default': dj_database_url.config(
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

# CORS settings
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    "https://ridex-frontend.up.railway.app",
    "https://rdx23-production-frontend.up.railway.app"
]

# Simplified logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

# Security settings
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False  # Railway handles SSL
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True 