from django.shortcuts import render
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth import get_user_model, authenticate
from .serializers import UserSerializer, RatingSerializer
from .models import Rating
from rest_framework_simplejwt.views import TokenObtainPairView
from django.db.models import Avg
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
import logging

User = get_user_model()
logger = logging.getLogger(__name__)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    
    def get_permissions(self):
        if self.action == 'create':
            permission_classes = [AllowAny]
        else:
            permission_classes = [IsAuthenticated]
        return [permission() for permission in permission_classes]

    @action(detail=True, methods=['post'])
    def rate_user(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response(
                {"error": "You cannot rate yourself"},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = RatingSerializer(data=request.data)
        if serializer.is_valid():
            rating = Rating.objects.create(
                from_user=request.user,
                to_user=user,
                rating=serializer.validated_data['rating'],
                comment=serializer.validated_data.get('comment', '')
            )

            # Update user's average rating
            avg_rating = Rating.objects.filter(to_user=user).aggregate(
                Avg('rating')
            )['rating__avg']
            user.rating = avg_rating
            user.save()

            return Response(RatingSerializer(rating).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def ratings(self, request, pk=None):
        user = self.get_object()
        ratings = Rating.objects.filter(to_user=user)
        serializer = RatingSerializer(ratings, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=['put'])
    def update_profile(self, request):
        user = request.user
        serializer = self.get_serializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CustomTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.get(username=request.data['username'])
            response.data['user'] = UserSerializer(user).data
        return response

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """
    Register a new user
    """
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        print("Registration data:", request.data)
        user = serializer.save()
        print("Created user type:", user.user_type)
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'token': str(refresh.access_token),
            'user_type': user.user_type
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    
    user = authenticate(username=username, password=password)
    if user is not None:
        logger.info(f"User {username} logged in successfully")
        logger.info(f"User type: {user.user_type}")
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'token': str(refresh.access_token),
            'user_type': user.user_type,
            'user': UserSerializer(user).data
        })
    else:
        return Response(
            {'detail': 'Invalid credentials'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )
