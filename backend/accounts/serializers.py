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
from .models import UserProfile
from .tasks import send_verification_email

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
        send_verification_email.delay(user.email, verification_url, first_name=first_name, last_name=last_name)

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
        logger.debug(f"Attempting login with email: {email}")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.error(f"User with email {email} does not exist")
            raise serializers.ValidationError({"detail": "No account found with this email."})

        user = authenticate(request=request, email=email, password=password)
        if not user:
            logger.error(f"Authentication failed for email: {email}")
            raise serializers.ValidationError({"detail": "Invalid email or password."})

        if not user.is_email_verified:
            logger.warning(f"Unverified email attempted login: {email}")
            raise serializers.ValidationError({
                "detail": "Please verify your email before logging in.",
                "action": "resend_verification"
            })

        if user.two_factor_enabled and not two_factor_code:
            two_factor_code = get_random_string(6, allowed_chars="0123456789")
            user.two_factor_code = two_factor_code
            user.save()
            send_mail(
                subject="MafitaPay 2FA Code",
                message=f"Your 2FA code is: {two_factor_code}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
            )
            raise serializers.ValidationError({"two_factor_code": "2FA code required."})

        if user.two_factor_enabled and two_factor_code != user.two_factor_code:
            raise serializers.ValidationError({"two_factor_code": "Invalid 2FA code."})

        refresh = RefreshToken.for_user(user)
        refresh_token = str(refresh)
        access_token = str(refresh.access_token)
        if data.get("remember_me"):
            refresh.set_exp(lifetime=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] * 2)
            access_token = str(refresh.access_token)

        logger.debug(f"Login successful for {email}")
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