from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RideViewSet, RideRequestViewSet, NotificationViewSet, health_check, proxy_openrouteservice, geocode_proxy

router = DefaultRouter()
router.register(r'rides', RideViewSet, basename='ride')
router.register(r'requests', RideRequestViewSet, basename='ride-request')
# Alias: the frontend calls /api/rides/ride-requests/. Register the same
# viewset under that prefix too so both paths work.
router.register(r'ride-requests', RideRequestViewSet, basename='ride-request-alias')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', health_check, name='health-check'),
    path('rides/accepted/', RideRequestViewSet.as_view({'get': 'accepted'}), name='accepted-rides'),
    path('requests/accepted/', RideRequestViewSet.as_view({'get': 'accepted'}), name='accepted-requests'),
    path('rides/requests/accept_match/', RideRequestViewSet.as_view({'post': 'accept_match'}), name='accept-match'),
    path('rides/requests/reject_match/', RideRequestViewSet.as_view({'post': 'reject_match'}), name='reject-match'),
    path('directions/', proxy_openrouteservice, name='proxy_openrouteservice'),
    path('geocode/', geocode_proxy, name='geocode_proxy'),
] 