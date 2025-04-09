"""
CORS diagnostic views and helpers.
"""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import logging

logger = logging.getLogger(__name__)

@csrf_exempt
def cors_preflight_check(request):
    """
    Handle OPTIONS preflight requests for CORS.
    This endpoint can be used for testing CORS configurations.
    """
    logger.info(f"CORS preflight check: {request.method} from {request.META.get('HTTP_ORIGIN', 'unknown')}")
    
    if request.method == 'OPTIONS':
        logger.info("Handling OPTIONS preflight request")
        response = JsonResponse({"status": "ok", "message": "Preflight check passed"})
    else:
        logger.info(f"Handling non-OPTIONS request: {request.method}")
        response = JsonResponse({
            "status": "ok",
            "message": "CORS is properly configured",
            "method": request.method,
            "origin": request.META.get('HTTP_ORIGIN', 'unknown'),
            "headers": dict(request.headers),
            "cors_middleware_enabled": True
        })
    
    # Add CORS headers - explicit for this view
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
    response["Access-Control-Allow-Credentials"] = "true"
    
    if request.method == 'OPTIONS':
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
    
    logger.info(f"CORS headers set: {response.headers}")
    return response 