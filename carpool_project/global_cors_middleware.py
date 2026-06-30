"""
Global CORS middleware with highest priority to handle OPTIONS requests.

It echoes the request's Origin back in Access-Control-Allow-Origin **only when
that origin is in settings.CORS_ALLOWED_ORIGINS**. This is mandatory: when
Access-Control-Allow-Credentials is "true", the browser rejects any response
whose Allow-Origin is "*" or does not exactly equal the request Origin. The old
implementation hard-coded a fallback origin (the backend's own URL) for
unknown origins, which guaranteed a mismatch and blocked every credentialed
request from the deployed frontend.

To allow the production frontend, add its origin to the FRONTEND_URLS env var
(comma-separated); settings.py appends it to CORS_ALLOWED_ORIGINS.
"""
from django.http import HttpResponse
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-CSRFToken"


class GlobalCorsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("Global CORS Middleware initialized with highest priority")

    def __call__(self, request):
        origin = request.META.get('HTTP_ORIGIN')
        logger.debug(f"Global CORS Middleware processing: {request.method} {request.path} from {origin}")

        # Handle OPTIONS preflight requests immediately with highest priority
        if request.method == 'OPTIONS':
            logger.info(f"Global middleware handling OPTIONS preflight for: {request.path}")
            response = HttpResponse(status=200)
            self._add_cors_headers(response, request)
            return response

        response = self.get_response(request)
        self._add_cors_headers(response, request)
        return response

    def _is_allowed(self, origin):
        if not origin:
            return False
        if origin in getattr(settings, 'CORS_ALLOWED_ORIGINS', []):
            return True
        # In DEBUG, be permissive with localhost/127.0.0.1 on any port.
        if settings.DEBUG and (
            origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:")
        ):
            return True
        return False

    def _add_cors_headers(self, response, request):
        """Add CORS headers only for explicitly allowed origins."""
        origin = request.META.get('HTTP_ORIGIN')

        if not self._is_allowed(origin):
            # Unknown/absent origin: do NOT set Allow-Origin. Never echo a
            # wrong origin while credentials are enabled — that blocks the
            # browser anyway and masks the real config problem.
            if origin:
                logger.warning(f"CORS: origin not allowed, no ACAO header set: {origin}")
            return response

        response["Access-Control-Allow-Origin"] = origin
        response["Vary"] = "Origin"
        response["Access-Control-Allow-Methods"] = ALLOW_METHODS
        response["Access-Control-Allow-Headers"] = ALLOW_HEADERS
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        logger.debug(f"CORS: allowed origin echoed: {origin}")
        return response
