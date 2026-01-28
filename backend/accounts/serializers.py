# backend/accounts/serializers.py
import re
import time
import logging
from django.conf import settings
from django.core.mail import send_mail
from django.utils.crypto import get_random_string
from django.contrib.auth import get_user_model, authenticate
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from .models import UserProfile
from .tasks import send_verification_email_sync, send_reset_email_sync

User = get_user_model()
logger = logging.getLogger(__name__)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "is_merchant", "is_email_verified"]

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=50, required=False)
    last_name = serializers.CharField(max_length=50, required=False)
    phone_number = serializers.CharField(max_length=15, required=False)
    referral_code = serializers.CharField(max_length=10, required=False)

    class Meta:
        model = User
        fields = ["email", "password", "password2", "first_name", "last_name", "phone_number", "referral_code"]

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("This email is already registered.")
        return value

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError("Password must contain at least one uppercase letter.")
        if not re.search(r'[0-9]', value):
            raise serializers.ValidationError("Password must contain at least one number.")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', value):
            raise serializers.ValidationError("Password must contain at least one special character.")
        return value

    def validate_phone_number(self, value):
        if value and not re.match(r'^\+?\d{10,15}$', value):
            raise serializers.ValidationError("Phone number must be 10-15 digits, optionally starting with '+'.")
        return value

    def validate_referral_code(self, value):
        if not value:
            return value
        try:
            referrer = User.objects.get(referral_code=value)
            if referrer.email == self.initial_data.get("email", "").lower().strip():
                raise serializers.ValidationError("You cannot use your own referral code.")
            return value
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid referral code.")

    def validate(self, data):
        if data["password"] != data["password2"]:
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        return data

    def create(self, validated_data):
        logger.debug(f"Starting registration for email: {validated_data['email']}")
        start_time = time.time()
        password2 = validated_data.pop("password2")
        first_name = validated_data.pop("first_name", None)
        last_name = validated_data.pop("last_name", None)
        phone_number = validated_data.pop("phone_number", None)
        referral_code = validated_data.pop("referral_code", None)

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
        )

        if referral_code:
            try:
                referrer = User.objects.get(referral_code=referral_code)
                user.referred_by = referrer
                user.save(update_fields=["referred_by", "referral_code"])
                logger.info(f"{user.email} registered via referral from {referrer.email}")
            except User.DoesNotExist:
                logger.warning(f"Invalid referral code used: {referral_code}")
                user.save(update_fields=["referral_code"])
        else:
            user.save(update_fields=["referral_code"])

        verification_token = get_random_string(32)
        user.verification_token = verification_token
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        if first_name:
            profile.first_name = first_name
        if last_name:
            profile.last_name = last_name
        if phone_number:
            profile.phone_number = phone_number
        profile.save()

        verification_url = f"{settings.BASE_URL}/api/verify-email/{verification_token}/"
        try:
            result = send_verification_email_sync(user.email, verification_url, first_name=first_name, last_name=last_name)
            if not result:
                logger.warning(f"Email sending failed for {user.email}, user can resend verification later")
        except Exception as e:
            logger.error(f"Email sending failed for {user.email}, user can resend verification later: {e}")
            # Registration still succeeds - user can use "Resend Verification" button

        logger.debug(f"Registration completed for {user.email} in {time.time() - start_time:.2f} seconds")
        return user

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    two_factor_code = serializers.CharField(required=False, write_only=True)
    remember_me = serializers.BooleanField(default=False, required=False)

    def validate(self, data):
        email = data["email"].lower().strip()
        password = data["password"]
        two_factor_code = data.get("two_factor_code")
        request = self.context.get("request")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({"detail": "No account found with this email."})

        user = authenticate(request=request, email=email, password=password)
        if not user:
            raise serializers.ValidationError({"detail": "Invalid email or password."})

        if not user.is_email_verified:
            raise serializers.ValidationError({
                "detail": "Your email address has not been verified yet. Please check your inbox for the verification link or request a new one.",
                "action": "resend_verification",
                "email": user.email
            })

        if not user.is_active:
            raise serializers.ValidationError({
                "detail": "Your account is deactivated. Please contact support if you need help reactivating it."
            })

        # ---- 2FA Handling ----
        if user.two_factor_enabled:
            if not two_factor_code:
                code = get_random_string(6, allowed_chars="0123456789")
                user.two_factor_code = code
                user.save()
                send_mail(
                    subject="MafitaPay 2FA Code",
                    message=f"Your 2FA code is: {code}",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                )
                raise serializers.ValidationError({"two_factor_code": "2FA code required."})

            if two_factor_code != user.two_factor_code:
                raise serializers.ValidationError({"two_factor_code": "Invalid 2FA code."})

            # Clear used code
            user.two_factor_code = None
            user.save()

        # ---- TOKEN GENERATION ----
        refresh = RefreshToken.for_user(user)

        if data.get("remember_me"):
            refresh.set_exp(
                lifetime=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] * 2
            )

        refresh_token = str(refresh)
        access_token = str(refresh.access_token)

        return {
            "user": {
                "id": user.id,
                "email": user.email,
                "is_merchant": user.is_merchant,
                "two_factor_enabled": user.two_factor_enabled,
            },
            "refresh": refresh_token,
            "access": access_token,
        }


class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    is_merchant = serializers.BooleanField(source="user.is_merchant", read_only=True)
    is_staff = serializers.BooleanField(source="user.is_staff", read_only=True)
    id = serializers.IntegerField(source="user.id", read_only=True)

    # ✅ Make sure URLs are absolute (Cloudinary or otherwise)
    profile_image = serializers.SerializerMethodField()
    id_document = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "email", "is_merchant", "first_name", "last_name", "phone_number", "date_of_birth",
            "account_no", "bank_name", "total_trades", "successful_trades", "success_rate",
            "profile_image", "id_document", "is_staff", "id",
        ]
        read_only_fields = ["total_trades", "successful_trades", "success_rate"]

    # ✅ Auto-return full URL (Cloudinary already provides a full one)
    def get_profile_image(self, obj):
        if obj.profile_image:
            try:
                return obj.profile_image.url  # Cloudinary gives absolute URL
            except Exception:
                request = self.context.get("request")
                if request:
                    return request.build_absolute_uri(obj.profile_image.url)
        return None

    def get_id_document(self, obj):
        if obj.id_document:
            try:
                return obj.id_document.url
            except Exception:
                request = self.context.get("request")
                if request:
                    return request.build_absolute_uri(obj.id_document.url)
        return None

    def validate_profile_image(self, value):
        if value and value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Profile image must be less than 2MB.")
        return value

    def validate_id_document(self, value):
        if value and value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("ID document must be less than 5MB.")
        return value


class ReferralSerializer(serializers.ModelSerializer):
    total_referrals = serializers.SerializerMethodField()
    total_bonus = serializers.SerializerMethodField()
    referred_users = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "email",
            "referral_code",
            "total_referrals",
            "total_bonus",
            "referred_users",
        ]

    def get_total_referrals(self, obj):
        return obj.referrals.count()

    def get_total_bonus(self, obj):
        wallet = getattr(obj, "wallet", None)
        if not wallet:
            return 0
        return wallet.transactions.filter(category="referral", tx_type="credit").aggregate(
            total=models.Sum("amount")
        )["total"] or 0

    def get_referred_users(self, obj):
        return [
            {
                "email": u.email,
                "date_joined": u.date_joined,
            }
            for u in obj.referrals.all()
        ]


# ========================================
# PIN Management Serializers
# ========================================

class PINSetupSerializer(serializers.Serializer):
    """Serializer for setting up a new transaction PIN"""
    pin = serializers.CharField(min_length=4, max_length=4, write_only=True)
    pin_confirmation = serializers.CharField(min_length=4, max_length=4, write_only=True)

    def validate_pin(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        if len(value) != 4:
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        # Check for weak PINs
        if value in ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']:
            raise serializers.ValidationError("PIN is too weak. Please choose a different PIN.")
        if value in ['1234', '4321', '0123', '3210']:
            raise serializers.ValidationError("PIN is too common. Please choose a different PIN.")
        return value

    def validate(self, data):
        if data['pin'] != data['pin_confirmation']:
            raise serializers.ValidationError({"pin_confirmation": "PINs do not match."})
        return data


class PINVerificationSerializer(serializers.Serializer):
    """Serializer for verifying transaction PIN"""
    pin = serializers.CharField(min_length=4, max_length=4, write_only=True)

    def validate_pin(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        if len(value) != 4:
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        return value


class PINChangeSerializer(serializers.Serializer):
    """Serializer for changing existing transaction PIN"""
    old_pin = serializers.CharField(min_length=4, max_length=4, write_only=True)
    new_pin = serializers.CharField(min_length=4, max_length=4, write_only=True)
    new_pin_confirmation = serializers.CharField(min_length=4, max_length=4, write_only=True)

    def validate_new_pin(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        if len(value) != 4:
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        # Check for weak PINs
        if value in ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']:
            raise serializers.ValidationError("PIN is too weak. Please choose a different PIN.")
        if value in ['1234', '4321', '0123', '3210']:
            raise serializers.ValidationError("PIN is too common. Please choose a different PIN.")
        return value

    def validate(self, data):
        if data['new_pin'] != data['new_pin_confirmation']:
            raise serializers.ValidationError({"new_pin_confirmation": "PINs do not match."})
        if data['old_pin'] == data['new_pin']:
            raise serializers.ValidationError({"new_pin": "New PIN must be different from old PIN."})
        return data


class PINResetRequestSerializer(serializers.Serializer):
    """Serializer for requesting PIN reset"""
    email = serializers.EmailField()

    def validate_email(self, value):
        """
        Validate email format only. 
        Don't reveal whether email exists to prevent user enumeration.
        Actual validation happens in the view.
        """
        value = value.lower().strip()
        return value


class PINResetConfirmSerializer(serializers.Serializer):
    """Serializer for confirming PIN reset with token"""
    token = serializers.CharField(max_length=32)
    new_pin = serializers.CharField(min_length=4, max_length=4, write_only=True)
    new_pin_confirmation = serializers.CharField(min_length=4, max_length=4, write_only=True)

    def validate_new_pin(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("PIN must contain only digits.")
        if len(value) != 4:
            raise serializers.ValidationError("PIN must be exactly 4 digits.")
        # Check for weak PINs
        if value in ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999']:
            raise serializers.ValidationError("PIN is too weak. Please choose a different PIN.")
        if value in ['1234', '4321', '0123', '3210']:
            raise serializers.ValidationError("PIN is too common. Please choose a different PIN.")
        return value

    def validate(self, data):
        if data['new_pin'] != data['new_pin_confirmation']:
            raise serializers.ValidationError({"new_pin_confirmation": "PINs do not match."})
        return data


class BiometricEnrollmentSerializer(serializers.Serializer):
    """
    Enroll biometric for NATIVE devices (Capacitor).
    We do NOT accept/pass WebAuthn credential/public_key here.
    """
    device_id = serializers.CharField(max_length=128)
    platform = serializers.CharField(max_length=20, required=False, default="android")

    def validate_device_id(self, value):
        value = (value or "").strip()
        if len(value) < 12:
            raise serializers.ValidationError("device_id looks invalid.")
        return value

    def validate_platform(self, value):
        value = (value or "").lower().strip()
        allowed = {"android", "ios", "web"}
        if value not in allowed:
            # don’t hard fail if you want, but better to be strict
            raise serializers.ValidationError("platform must be android, ios, or web.")
        return value


class BiometricLoginSerializer(serializers.Serializer):
    """
    Login with biometric for NATIVE devices (Capacitor).
    """
    email = serializers.EmailField()
    device_id = serializers.CharField(max_length=128)
    platform = serializers.CharField(max_length=20, required=False, default="android")

    def validate_email(self, value):
        return (value or "").lower().strip()

    def validate_device_id(self, value):
        value = (value or "").strip()
        if len(value) < 12:
            raise serializers.ValidationError("device_id looks invalid.")
        return value

    def validate_platform(self, value):
        value = (value or "").lower().strip()
        allowed = {"android", "ios", "web"}
        if value not in allowed:
            raise serializers.ValidationError("platform must be android, ios, or web.")
        return value


class BiometricStatusSerializer(serializers.Serializer):
    """
    Optional: only if you want a clean response format from status endpoint.
    """
    enabled = serializers.BooleanField()
    registered_at = serializers.DateTimeField(allow_null=True)
    has_credential = serializers.BooleanField()
    platform = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    device_id = serializers.CharField(allow_blank=True, allow_null=True, required=False)
