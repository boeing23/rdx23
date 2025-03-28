from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Rating

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    password2 = serializers.CharField(write_only=True, required=False)
    
    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'password', 'password2', 'first_name', 'last_name',
            'user_type', 'phone_number', 'rating', 'total_rides',
            'is_verified', 'emergency_contact', 'emergency_phone',
            'vehicle_make', 'vehicle_model', 'vehicle_year',
            'vehicle_color', 'license_plate', 'max_passengers',
            'preferred_pickup_locations'
        )
        read_only_fields = ('rating', 'total_rides', 'is_verified')
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'id': {'read_only': True},
            'user_type': {'required': True}
        }

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
        
        # Update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        instance.save()
        return instance

class RatingSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)

    class Meta:
        model = Rating
        fields = ('id', 'from_user', 'to_user', 'rating', 'comment', 'created_at')
        read_only_fields = ('created_at',)

    def validate(self, data):
        if self.context['request'].user == data['to_user']:
            raise serializers.ValidationError("You cannot rate yourself.")
        return data 