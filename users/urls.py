from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    UserViewSet, 
    CustomTokenObtainPairView, 
    register_user, 
    login_user, 
    SocialLoginView,
    google_callback,
    github_callback
)

router = DefaultRouter()
router.register(r'', UserViewSet)

urlpatterns = [
    path('register/', register_user, name='register'),
    path('login/', login_user, name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Social authentication endpoints
    path('social/login/', SocialLoginView.as_view(), name='social_login'),
    path('social/google/callback/', google_callback, name='google_callback'),
    path('social/github/callback/', github_callback, name='github_callback'),
    
    path('', include(router.urls)),
] 