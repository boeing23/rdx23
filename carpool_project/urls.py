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

logger = logging.getLogger(__name__)

def api_root(request):
    try:
        # Simple response that will always succeed
        return JsonResponse({
            "status": "ok",
            "message": "Welcome to the Carpool API",
            "endpoints": {
                "users": "/api/users/",
                "rides": "/api/rides/",
                "status": "/railway-status/"
            }
        }, status=200)
    except Exception as e:
        # Log the error but still return 200 for healthcheck
        logger.error(f"Error in root endpoint: {str(e)}")
        return HttpResponse("OK", status=200)

urlpatterns = [
    path('', api_root, name='api-root'),
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/rides/', include('rides.urls_fixed')),
    # Add the railway status endpoint
    path('railway-status/', status_check, name='railway_status'),
]
