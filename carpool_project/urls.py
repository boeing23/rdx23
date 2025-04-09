"""
URL configuration for carpool_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse, HttpResponse
import logging
# Import the status check view
from railway_status import status_check
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

# Add these imports for model patching
from django.db import connection
from django.apps import apps

logger = logging.getLogger(__name__)

def api_root(request):
    try:
        # Handle OPTIONS requests for CORS preflight
        if request.method == 'OPTIONS':
            response = HttpResponse()
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
            response['Access-Control-Max-Age'] = '86400'  # 24 hours
            return response
        
        # Simple response that will always succeed
        response = JsonResponse({
            "status": "ok",
            "message": "Welcome to the Carpool API",
            "endpoints": {
                "users": "/api/users/",
                "rides": "/api/rides/",
                "status": "/railway-status/"
            }
        }, status=200)
        
        # Add CORS headers to all responses
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        
        return response
    except Exception as e:
        # Log the error but still return 200 for healthcheck
        logger.error(f"Error in root endpoint: {str(e)}")
        response = HttpResponse("OK", status=200)
        
        # Add CORS headers even in case of error
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        
        return response

def check_driver_name_field(request):
    """
    View to verify the presence of driver_name field in Ride model.
    This is a deprecated endpoint that now returns a dummy response.
    """
    try:
        # Return a response indicating field is not available
        return JsonResponse({
            'success': True,
            'has_field_in_model': False,
            'has_field_in_db': False,
            'message': 'This feature has been deprecated'
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/rides/', include('rides.urls')),
    # Add the railway status endpoint
    path('railway-status/', status_check, name='railway_status'),
    path('api/check_driver_name/', check_driver_name_field),
    path('', TemplateView.as_view(template_name='index.html')),
] + static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
