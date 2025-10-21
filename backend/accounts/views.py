import re
import logging

from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.http import HttpResponseRedirect
from django.utils.crypto import get_random_string

from rest_framework import serializers
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .serializers import (
    RegisterSerializer, LoginSerializer, UserProfileSerializer
)

from .models import User, UserProfile
from .tasks import send_verification_email, send_reset_email

logger = logging.getLogger(__name__)

class RegisterView(generics.GenericAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {"message": "Registration successful. Please verify your email."},
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {"errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
            return Response(serializer.validated_data, status=status.HTTP_200_OK)
        except serializers.ValidationError as e:
            logger.error(f"Login validation error: {e.detail}")
            return Response({"errors": e.detail}, status=status.HTTP_400_BAD_REQUEST)

class ProfileAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    def patch(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        try:
            user = User.objects.get(verification_token=token)
            user.is_email_verified = True
            user.verification_token = None
            user.save()
            logger.info(f"Email verified for {user.email}")
            # Redirect to frontend verification page with query params
            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/verify-email?token={token}&verified=true")
        except User.DoesNotExist:
            logger.error(f"Invalid verification token: {token}")
            return HttpResponseRedirect(f"{settings.FRONTEND_URL}/verify-email?verified=false")


class ResendVerificationEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        try:
            user = User.objects.get(email=email)
            if user.is_email_verified:
                return Response({"message": "Email is already verified."}, status=status.HTTP_400_BAD_REQUEST)
            verification_token = get_random_string(32)
            user.verification_token = verification_token
            user.save()
            verification_url = f"{settings.BASE_URL}/api/verify-email/{verification_token}/"
            profile = user.profile  # Assuming related_name="profile"
            full_name = profile.full_name if profile else None
            send_verification_email.delay(user.email, verification_url, full_name=full_name)
            return Response({"message": "Verification email resent successfully."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "No account found with this email."}, status=status.HTTP_404_NOT_FOUND)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        try:
            user = User.objects.get(email=email)
            if not user.is_email_verified:
                return Response({"error": "Email not verified."}, status=status.HTTP_400_BAD_REQUEST)
            reset_token = get_random_string(32)
            expiry = timezone.now() + timedelta(hours=24)
            user.reset_token = reset_token
            user.reset_token_expiry = expiry
            user.save()
            reset_url = f"{settings.FRONTEND_URL}/reset-password/{reset_token}/"  # Use FRONTEND_URL
            send_reset_email.delay(user.email, reset_url, user.profile.full_name if user.profile else None)
            return Response({"message": "Password reset email sent."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "No account found with this email."}, status=status.HTTP_404_NOT_FOUND)


class PasswordResetValidateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        logger.debug(f"Validating reset token: {token}")
        try:
            user = User.objects.get(reset_token=token)
            if not user.reset_token_expiry or user.reset_token_expiry < timezone.now():
                logger.error(f"Reset token expired for token: {token}")
                return Response({"error": "Reset token has expired."}, status=status.HTTP_400_BAD_REQUEST)
            logger.info(f"Reset token valid for user: {user.email}")
            return Response({"message": "Token is valid."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            logger.error(f"Invalid reset token: {token}")
            return Response({"error": "Invalid reset token."}, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        try:
            user = User.objects.get(reset_token=token)
            if not user.reset_token_expiry or user.reset_token_expiry < timezone.now():
                logger.error(f"Reset token expired for token: {token}")
                return Response({"error": "Reset token has expired."}, status=status.HTTP_400_BAD_REQUEST)
            new_password = request.data.get("new_password")
            if not new_password:
                return Response({"error": "New password is required."}, status=status.HTTP_400_BAD_REQUEST)
            # Add password validation
            if len(new_password) < 8:
                return Response({"error": "Password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)
            if not re.search(r'[A-Z]', new_password):
                return Response({"error": "Password must contain at least one uppercase letter."}, status=status.HTTP_400_BAD_REQUEST)
            if not re.search(r'[0-9]', new_password):
                return Response({"error": "Password must contain at least one number."}, status=status.HTTP_400_BAD_REQUEST)
            if not re.search(r'[!@#$%^&*(),.?":{}|<>]', new_password):
                return Response({"error": "Password must contain at least one special character."}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(new_password)
            user.reset_token = None
            user.reset_token_expiry = None
            user.save()
            return Response({"message": "Password reset successfully."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "Invalid reset token."}, status=status.HTTP_400_BAD_REQUEST)