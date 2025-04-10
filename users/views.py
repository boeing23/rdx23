from django.shortcuts import render
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth import get_user_model, authenticate
from .serializers import UserSerializer, RatingSerializer, UserRegistrationSerializer
from .models import Rating, User
from rest_framework_simplejwt.views import TokenObtainPairView
from django.db.models import Avg
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.views.decorators.csrf import csrf_exempt
import logging
import json
from django.http import JsonResponse
from django.contrib.auth import login
from django.urls import reverse
from django.shortcuts import redirect
from allauth.socialaccount.models import SocialApp, SocialAccount, SocialToken
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.facebook.views import FacebookOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from rest_framework.views import APIView

User = get_user_model()
logger = logging.getLogger(__name__)

# Adding Social Authentication views
class SocialLoginView(APIView):
    permission_classes = (AllowAny,)
    
    def post(self, request):
        """
        Handle social authentication and return JWT tokens
        """
        try:
            provider = request.data.get('provider', None)
            access_token = request.data.get('access_token', None)
            code = request.data.get('code', None)
            
            if not provider:
                return Response({"error": "Provider is required"}, status=status.HTTP_400_BAD_REQUEST)
                
            if not (access_token or code):
                return Response({"error": "Either access_token or code is required"}, status=status.HTTP_400_BAD_REQUEST)
                
            # Process based on provider
            if provider == 'google':
                return self.login_with_google(access_token, code)
            elif provider == 'facebook':
                return self.login_with_facebook(access_token)
            elif provider == 'github':
                return self.login_with_github(code)
            else:
                return Response({"error": "Provider not supported"}, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            logger.error(f"Social login error: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def login_with_google(self, access_token=None, code=None):
        """Handle Google login"""
        try:
            adapter = GoogleOAuth2Adapter()
            if code:
                # Exchange code for token
                client = OAuth2Client(
                    settings.SOCIALACCOUNT_PROVIDERS['google']['APP']['client_id'],
                    settings.SOCIALACCOUNT_PROVIDERS['google']['APP']['secret'],
                    redirect_uri=request.build_absolute_uri(reverse('google_callback'))
                )
                token = client.get_access_token(code)
                access_token = token['access_token']
            
            # Authenticate with the token
            social_token = SocialToken(token=access_token)
            login_data = adapter.complete_login(request, app, token, response=None)
            email = login_data.account.extra_data.get('email')
            
            # Get or create user
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Create new user from Google data
                user = User.objects.create(
                    email=email,
                    username=email,  # Use email as username
                    first_name=login_data.account.extra_data.get('given_name', ''),
                    last_name=login_data.account.extra_data.get('family_name', ''),
                    user_type='RIDER',  # Default to RIDER, can be updated later
                    is_verified=True,  # Social users are verified by default
                )
                user.set_unusable_password()
                user.save()
                
                # Create social account link
                SocialAccount.objects.create(
                    user=user, 
                    provider='google',
                    uid=login_data.account.uid, 
                    extra_data=login_data.account.extra_data
                )
                
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': UserSerializer(user).data
            })
            
        except Exception as e:
            logger.error(f"Google login error: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def login_with_facebook(self, access_token):
        """Handle Facebook login"""
        try:
            adapter = FacebookOAuth2Adapter()
            app = SocialApp.objects.get(provider='facebook')
            
            # Authenticate with the token
            social_token = SocialToken(token=access_token)
            login_data = adapter.complete_login(request, app, social_token, response=None)
            email = login_data.account.extra_data.get('email')
            
            # Get or create user
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Create new user from Facebook data
                user = User.objects.create(
                    email=email,
                    username=email,  # Use email as username
                    first_name=login_data.account.extra_data.get('first_name', ''),
                    last_name=login_data.account.extra_data.get('last_name', ''),
                    user_type='RIDER',  # Default to RIDER, can be updated later
                    is_verified=True,  # Social users are verified by default
                )
                user.set_unusable_password()
                user.save()
                
                # Create social account link
                SocialAccount.objects.create(
                    user=user, 
                    provider='facebook',
                    uid=login_data.account.uid, 
                    extra_data=login_data.account.extra_data
                )
                
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': UserSerializer(user).data
            })
            
        except Exception as e:
            logger.error(f"Facebook login error: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def login_with_github(self, code):
        """Handle GitHub login"""
        try:
            adapter = GitHubOAuth2Adapter()
            app = SocialApp.objects.get(provider='github')
            
            # Exchange code for token
            client = OAuth2Client(
                settings.SOCIALACCOUNT_PROVIDERS['github']['APP']['client_id'],
                settings.SOCIALACCOUNT_PROVIDERS['github']['APP']['secret'],
                redirect_uri=request.build_absolute_uri(reverse('github_callback'))
            )
            token = client.get_access_token(code)
            access_token = token['access_token']
            
            # Authenticate with the token
            social_token = SocialToken(token=access_token)
            login_data = adapter.complete_login(request, app, social_token, response=None)
            email = login_data.account.extra_data.get('email')
            
            # Handle case where GitHub doesn't provide email
            if not email:
                return Response({"error": "Email not provided by GitHub"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get or create user
            try:
                user = User.objects.get(email=email)
            except User.DoesNotExist:
                # Get name from GitHub data
                name = login_data.account.extra_data.get('name', '')
                first_name, last_name = '', ''
                if name:
                    name_parts = name.split(' ', 1)
                    first_name = name_parts[0]
                    last_name = name_parts[1] if len(name_parts) > 1 else ''
                
                # Create new user from GitHub data
                user = User.objects.create(
                    email=email,
                    username=login_data.account.extra_data.get('login', email),
                    first_name=first_name,
                    last_name=last_name,
                    user_type='RIDER',  # Default to RIDER, can be updated later
                    is_verified=True,  # Social users are verified by default
                )
                user.set_unusable_password()
                user.save()
                
                # Create social account link
                SocialAccount.objects.create(
                    user=user, 
                    provider='github',
                    uid=login_data.account.uid, 
                    extra_data=login_data.account.extra_data
                )
                
            # Generate JWT tokens
            refresh = RefreshToken.for_user(user)
            return Response({
                'refresh': str(refresh),
                'access': str(refresh.access_token),
                'user': UserSerializer(user).data
            })
            
        except Exception as e:
            logger.error(f"GitHub login error: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# OAuth callback views for redirecting back from providers
@api_view(['GET'])
@permission_classes([AllowAny])
def google_callback(request):
    """Handle Google OAuth callback and redirect to frontend with token in URL params"""
    try:
        code = request.GET.get('code')
        if not code:
            return Response({"error": "Authorization code not provided"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Redirect to frontend with the code
        redirect_url = f"{settings.FRONTEND_URL}/auth/google/callback?code={code}"
        return redirect(redirect_url)
    except Exception as e:
        logger.error(f"Google callback error: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([AllowAny])
def github_callback(request):
    """Handle GitHub OAuth callback and redirect to frontend with token in URL params"""
    try:
        code = request.GET.get('code')
        if not code:
            return Response({"error": "Authorization code not provided"}, status=status.HTTP_400_BAD_REQUEST)
            
        # Redirect to frontend with the code
        redirect_url = f"{settings.FRONTEND_URL}/auth/github/callback?code={code}"
        return redirect(redirect_url)
    except Exception as e:
        logger.error(f"GitHub callback error: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return UserRegistrationSerializer
        return UserSerializer
    
    def retrieve(self, request, pk=None):
        """
        Get user details by ID
        """
        try:
            # Log the request for debugging
            logger.info(f"Fetching user details for ID: {pk}")
            
            # Fetch the user
            user = self.get_object()
            
            logger.info(f"Found user: {user.username}, type: {user.user_type}")
            
            # Serialize the user data
            serializer = self.get_serializer(user)
            
            # Log fields for debugging
            logger.info(f"Serialized fields: {list(serializer.data.keys())}")
            
            # Return the user data
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"Error retrieving user: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search for users by name
        """
        try:
            name = request.query_params.get('name', '')
            if not name:
                return Response({"error": "Name parameter is required"}, 
                               status=status.HTTP_400_BAD_REQUEST)
                
            # Split the name into parts to search in first_name and last_name
            name_parts = name.split()
            
            # Start with an empty queryset
            queryset = User.objects.none()
            
            # If there's at least one part, search for it in first_name or last_name
            if len(name_parts) > 0:
                queryset = User.objects.filter(first_name__icontains=name_parts[0]) | \
                          User.objects.filter(last_name__icontains=name_parts[0])
                          
            # If there's a second part, search for users with that in first_name or last_name
            if len(name_parts) > 1:
                queryset = queryset | User.objects.filter(first_name__icontains=name_parts[1]) | \
                          User.objects.filter(last_name__icontains=name_parts[1])
                          
            # Log the results for debugging
            logger.info(f"Search for name '{name}' found {queryset.count()} users")
            
            # Serialize and return the results
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"Error searching users: {str(e)}")
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def me(self, request):
        user = request.user
        logger.info(f"Fetching profile data for user: {user.username}, type: {user.user_type}")
        
        # Handle special case for RIDER users
        if user.user_type == 'RIDER':
            logger.info("Handling RIDER user profile, ensuring vehicle fields are null")
        
        serializer = self.get_serializer(user)
        logger.info(f"Serialized user profile with fields: {list(serializer.data.keys())}")
        return Response(serializer.data)

    @action(detail=False, methods=['post', 'options'])
    @csrf_exempt
    def register(self, request):
        """
        Register a new user via the ViewSet
        
        Handles both POST requests for registration and OPTIONS requests for CORS preflight.
        """
        # Handle OPTIONS preflight requests for CORS
        if request.method == 'OPTIONS':
            logger.info("Handling OPTIONS preflight for ViewSet registration endpoint")
            response = Response()
            response["Access-Control-Allow-Origin"] = "*"
            response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Max-Age"] = "86400"  # 24 hours
            return response
            
        # Handle actual registration (POST requests)
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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

@csrf_exempt
@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])
def register_user(request):
    """
    Register a new user
    
    Handles both POST requests for registration and OPTIONS requests for CORS preflight.
    """
    # Handle OPTIONS preflight requests for CORS
    if request.method == 'OPTIONS':
        logger.info("Handling OPTIONS preflight for registration endpoint")
        response = Response()
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        return response
    
    # Handle actual registration (POST requests)
    try:
        logger.info("Registration request received with data type: %s", type(request.data))
        logger.info("Registration request data: %s", request.data)
        
        # Use UserRegistrationSerializer which handles vehicle fields correctly
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            logger.info("Registration data is valid")
            user = serializer.save()
            logger.info("User saved successfully: %s, %s, %s", user.id, user.username, user.user_type)
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'token': str(refresh.access_token),
                'user_type': user.user_type
            }, status=status.HTTP_201_CREATED)
        else:
            logger.warning("Registration data validation failed: %s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger.error("Unexpected error in registration: %s", str(e))
        import traceback
        logger.error(traceback.format_exc())
        return Response({
            'detail': f'Server error: {str(e)}' 
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])
def login_user(request):
    """
    Login a user
    
    Handles both POST requests for login and OPTIONS requests for CORS preflight.
    """
    # Handle OPTIONS preflight requests for CORS
    if request.method == 'OPTIONS':
        logger.info("Handling OPTIONS preflight for login endpoint")
        response = Response()
        response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
        response["Access-Control-Allow-Credentials"] = "true"
        response["Access-Control-Max-Age"] = "86400"  # 24 hours
        return response
        
    # Handle actual login (POST requests)
    username = request.data.get('username')
    password = request.data.get('password')
    
    user = authenticate(username=username, password=password)
    if user is not None:
        logger.info(f"User {username} logged in successfully")
        logger.info(f"User type: {user.user_type}")
        
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        
        # Serialize user data with UserSerializer to ensure proper field handling
        user_data = UserSerializer(user).data
        
        # For RIDER users, explicitly set vehicle fields to null to prevent validation errors
        if user.user_type == 'RIDER':
            logger.info(f"Setting vehicle fields to null for RIDER user: {username}")
            user_data_for_response = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'user_type': user.user_type
            }
        else:
            user_data_for_response = {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'user_type': user.user_type
            }
        
        # Return response in the format expected by the frontend
        return Response({
            'token': access_token,
            'user_type': user.user_type,
            'user': user_data_for_response
        })
    else:
        return Response(
            {'detail': 'Invalid credentials'}, 
            status=status.HTTP_401_UNAUTHORIZED
        )
