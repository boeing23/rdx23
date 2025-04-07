from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Import from our fixed views file instead
from .views_fixed import RideViewSet, RideRequestViewSet, NotificationViewSet

router = DefaultRouter()
router.register(r'rides', RideViewSet, basename='ride')
router.register(r'requests', RideRequestViewSet, basename='ride-request')
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
] 