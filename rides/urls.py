from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RideViewSet, RideRequestViewSet, NotificationViewSet, health_check

router = DefaultRouter()
router.register(r'rides', RideViewSet, basename='ride')
router.register(r'requests', RideRequestViewSet, basename='ride-request')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
    path('health/', health_check, name='health-check'),
    path('rides/accepted/', RideRequestViewSet.as_view({'get': 'accepted'}), name='accepted-rides'),
    path('requests/accepted/', RideRequestViewSet.as_view({'get': 'accepted'}), name='accepted-requests'),
] 