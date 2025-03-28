"""
WSGI config for carpool_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.0/howto/deployment/wsgi/
"""

import os
import sys

from django.core.wsgi import get_wsgi_application

# Check if we're running in production (on Railway or similar)
if 'RAILWAY_ENVIRONMENT' in os.environ or 'PRODUCTION' in os.environ:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "carpool_project.settings_production")
    print("Using production settings", file=sys.stderr)
else:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "carpool_project.settings")
    print("Using development settings", file=sys.stderr)

application = get_wsgi_application()
