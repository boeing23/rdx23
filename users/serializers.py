from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Rating
import logging

User = get_user_model()
logger = logging.getLogger(__name__)

class UserSerializer(serializers.ModelSerializer):
    password2 = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 
            'phone_number', 'user_type',
            'vehicle_make', 'vehicle_model', 'vehicle_color', 
            'vehicle_year', 'license_plate', 'max_passengers',
            'password', 'password2'  # Added password and password2 fields
        ]
        extra_kwargs = {'password': {'write_only': True}}
        
    def to_representation(self, instance):
        """Custom representation to include all driver details when needed"""
        data = super().to_representation(instance)
        
        # Log what fields are available for debugging
        logger.info(f"Serializing user {instance.id} with fields: {list(data.keys())}")
        
        # For RIDER users, ensure vehicle fields are empty strings or zeros, not null
        if instance.user_type == 'RIDER':
            # Set string vehicle fields to empty strings
            vehicle_string_fields = ['vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate']
            for field in vehicle_string_fields:
                data[field] = ''
            
            # Set numeric vehicle fields to 0
            data['vehicle_year'] = 0
            data['max_passengers'] = 0
        # Log vehicle details specifically for drivers
        elif instance.user_type == 'DRIVER':
            logger.info(f"Driver vehicle details - Make: {instance.vehicle_make}, Model: {instance.vehicle_model}")
        
        return data

    def validate(self, data):
        # Only validate password if it's being set
        if 'password' in data:
            if 'password2' not in data:
                raise serializers.ValidationError({"password2": "Password confirmation is required when setting a new password."})
            if data['password'] != data['password2']:
                raise serializers.ValidationError({"password": "Passwords must match."})
        
        # Validate user type
        if 'user_type' not in data:
            raise serializers.ValidationError({"user_type": "User type is required."})
        if data['user_type'] not in ['DRIVER', 'RIDER']:
            raise serializers.ValidationError({"user_type": "Invalid user type. Must be either 'DRIVER' or 'RIDER'."})
        
        # Validate driver-specific fields if user is registering as a driver
        if data.get('user_type') == 'DRIVER':
            required_fields = ['vehicle_make', 'vehicle_model', 'vehicle_year', 
                             'vehicle_color', 'license_plate', 'max_passengers']
            missing_fields = [field for field in required_fields if not data.get(field)]
            if missing_fields:
                raise serializers.ValidationError({
                    "driver_fields": f"Missing required fields for driver registration: {', '.join(missing_fields)}"
                })
            
            # Validate max_passengers is between 1 and 8
            if not (1 <= data.get('max_passengers', 0) <= 8):
                raise serializers.ValidationError({
                    "max_passengers": "Maximum passengers must be between 1 and 8"
                })
            
            # Validate vehicle_year is reasonable
            vehicle_year = data.get('vehicle_year')
            if vehicle_year and (vehicle_year < 1900 or vehicle_year > 2025):
                raise serializers.ValidationError({
                    "vehicle_year": "Please enter a valid vehicle year"
                })
        
        return data

    def create(self, validated_data):
        try:
            print("Starting user creation with data:", validated_data)
            password2 = validated_data.pop('password2', None)  # Remove password2 before creating user
            
            # Extract driver-specific fields
            driver_fields = {
                'vehicle_make': validated_data.pop('vehicle_make', ''),
                'vehicle_model': validated_data.pop('vehicle_model', ''),
                'vehicle_year': validated_data.pop('vehicle_year', None),
                'vehicle_color': validated_data.pop('vehicle_color', ''),
                'license_plate': validated_data.pop('license_plate', ''),
                'max_passengers': validated_data.pop('max_passengers', None)
            }
            
            print("Creating user with:", validated_data)
            # Create the user with explicit user type
            user = User.objects.create_user(
                username=validated_data['username'],
                email=validated_data['email'],
                password=validated_data['password'],
                first_name=validated_data.get('first_name', ''),
                last_name=validated_data.get('last_name', ''),
                phone_number=validated_data.get('phone_number', ''),
                user_type=validated_data['user_type']  # Use the validated user type
            )
            
            print("User created successfully, updating driver fields:", driver_fields)
            # Update driver-specific fields if user is a driver
            if user.user_type == 'DRIVER':
                for field, value in driver_fields.items():
                    print(f"Setting {field} to {value}")
                    setattr(user, field, value)
                user.save()
            
            print("User creation completed successfully")
            return user
        except Exception as e:
            print(f"ERROR in user creation: {str(e)}")
            import traceback
            print(traceback.format_exc())
            raise

    def update(self, instance, validated_data):
        # Remove password2 if it exists
        validated_data.pop('password2', None)
        
        # Handle password update if provided
        if 'password' in validated_data:
            password = validated_data.pop('password')
            instance.set_password(password)
        
        # For riders, set vehicle fields to empty strings or zeros instead of removing them
        if instance.user_type == 'RIDER':
            vehicle_string_fields = ['vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate']
            for field in vehicle_string_fields:
                validated_data[field] = ''
            
            validated_data['vehicle_year'] = 0
            validated_data['max_passengers'] = 0
        
        # Update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    vehicle_make = serializers.CharField(required=False, allow_blank=True)
    vehicle_model = serializers.CharField(required=False, allow_blank=True)
    vehicle_year = serializers.CharField(required=False, allow_blank=True)
    vehicle_color = serializers.CharField(required=False, allow_blank=True)
    license_plate = serializers.CharField(required=False, allow_blank=True)
    max_passengers = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'password', 
            'first_name', 'last_name', 'phone_number',
            'user_type', 'vehicle_make', 'vehicle_model',
            'vehicle_color', 'vehicle_year', 'license_plate',
            'max_passengers'
        ]
    
    def validate(self, data):
        # Convert empty strings for numeric fields to None for validation purposes
        # but we'll convert back to empty strings before saving for RIDER accounts
        if 'vehicle_year' in data and data['vehicle_year'] == '':
            data['vehicle_year'] = None
        
        if 'max_passengers' in data and data['max_passengers'] == '':
            data['max_passengers'] = None
        
        # Only validate vehicle fields if user is a driver
        if data.get('user_type') == 'DRIVER':
            required_fields = ['vehicle_make', 'vehicle_model', 'vehicle_year', 
                             'vehicle_color', 'license_plate', 'max_passengers']
            missing_fields = [field for field in required_fields if not data.get(field)]
            if missing_fields:
                raise serializers.ValidationError({
                    "driver_fields": f"Missing required fields for driver registration: {', '.join(missing_fields)}"
                })
            
            # Convert and validate max_passengers as an integer
            try:
                if data.get('max_passengers'):
                    max_pass = int(data['max_passengers'])
                    if not (1 <= max_pass <= 8):
                        raise serializers.ValidationError({
                            "max_passengers": "Maximum passengers must be between 1 and 8"
                        })
                    data['max_passengers'] = max_pass  # Store as int
            except (ValueError, TypeError):
                raise serializers.ValidationError({
                    "max_passengers": "Please enter a valid number for maximum passengers"
                })
            
            # Convert and validate vehicle_year as an integer
            try:
                if data.get('vehicle_year'):
                    year = int(data['vehicle_year'])
                    if year < 1900 or year > 2025:
                        raise serializers.ValidationError({
                            "vehicle_year": "Please enter a valid vehicle year"
                        })
                    data['vehicle_year'] = year  # Store as int
            except (ValueError, TypeError):
                raise serializers.ValidationError({
                    "vehicle_year": "Please enter a valid year"
                })
        elif data.get('user_type') == 'RIDER':
            # For riders, set vehicle fields to empty strings instead of null
            # This works around database NOT NULL constraints
            vehicle_fields = ['vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate']
            for field in vehicle_fields:
                data[field] = ''
            
            # For numeric fields, use 0 instead of null
            data['vehicle_year'] = 0  # Use 0 as a placeholder
            data['max_passengers'] = 0  # Use 0 as a placeholder
        
        return data
    
    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        return user

class RatingSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()
    
    class Meta:
        model = Rating
        fields = ['id', 'reviewer', 'subject', 'reviewer_name', 'subject_name', 'rating', 'comment', 'created_at']
        read_only_fields = ['reviewer', 'created_at']
    
    def get_reviewer_name(self, obj):
        if obj.reviewer:
            return f"{obj.reviewer.first_name} {obj.reviewer.last_name}"
        return ""
    
    def get_subject_name(self, obj):
        if obj.subject:
            return f"{obj.subject.first_name} {obj.subject.last_name}"
        return ""

    def validate(self, data):
        if self.context['request'].user == data['to_user']:
            raise serializers.ValidationError("You cannot rate yourself.")
        return data 