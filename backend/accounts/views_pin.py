# backend/accounts/views_pin.py
"""
Views for transaction PIN and biometric authentication management
"""
import logging
from django.conf import settings
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import timedelta

from .serializers import (
    PINSetupSerializer,
    PINVerificationSerializer,
    PINChangeSerializer,
    PINResetRequestSerializer,
    PINResetConfirmSerializer,
    BiometricEnrollmentSerializer,
    BiometricLoginSerializer,
)
from wallet.models import TransactionSecurityLog

User = get_user_model()
logger = logging.getLogger(__name__)


def get_client_ip(request):
    """Get client IP address from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def log_security_event(user, action, request, **kwargs):
    """Helper function to log security events"""
    try:
        TransactionSecurityLog.objects.create(
            user=user,
            action=action,
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            metadata=kwargs
        )
    except Exception as e:
        logger.error(f"Failed to log security event: {e}")


class PINSetupView(APIView):
    """
    POST /api/pin/setup/
    Set up a new transaction PIN for the user
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # Check if PIN already exists
        if user.has_transaction_pin():
            return Response(
                {"error": "Transaction PIN already exists. Use change PIN endpoint to update."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PINSetupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            user.set_transaction_pin(serializer.validated_data['pin'])
            log_security_event(user, 'pin_setup', request)
            
            return Response({
                "success": True,
                "message": "Transaction PIN set up successfully."
            }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            logger.error(f"Error setting up PIN for user {user.email}: {e}")
            return Response(
                {"error": "Failed to set up transaction PIN."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PINVerifyView(APIView):
    """
    POST /api/pin/verify/
    Verify transaction PIN (used before sensitive operations)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # Check if PIN is set
        if not user.has_transaction_pin():
            return Response(
                {"error": "Transaction PIN not set. Please set up your PIN first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if PIN is locked
        if user.is_pin_locked():
            remaining = (user.pin_locked_until - timezone.now()).seconds // 60
            log_security_event(user, 'pin_verify_failed', request, reason='locked')
            return Response(
                {"error": f"PIN is locked. Try again in {remaining} minutes."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = PINVerificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            is_valid = user.check_transaction_pin(serializer.validated_data['pin'])
            
            if is_valid:
                log_security_event(user, 'pin_verify_success', request)
                return Response({
                    "success": True,
                    "message": "PIN verified successfully."
                }, status=status.HTTP_200_OK)
            else:
                attempts_left = max(0, 5 - user.pin_attempts)
                log_security_event(
                    user, 'pin_verify_failed', request,
                    attempts=user.pin_attempts,
                    attempts_left=attempts_left
                )
                
                if user.is_pin_locked():
                    return Response(
                        {"error": "Too many failed attempts. PIN is now locked for 30 minutes."},
                        status=status.HTTP_403_FORBIDDEN
                    )
                
                return Response({
                    "error": "Invalid PIN.",
                    "attempts_left": attempts_left
                }, status=status.HTTP_401_UNAUTHORIZED)
        
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error verifying PIN for user {user.email}: {e}")
            return Response(
                {"error": "Failed to verify PIN."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PINChangeView(APIView):
    """
    POST /api/pin/change/
    Change existing transaction PIN
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # Check if PIN is set
        if not user.has_transaction_pin():
            return Response(
                {"error": "Transaction PIN not set. Please set up your PIN first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if PIN is locked
        if user.is_pin_locked():
            remaining = (user.pin_locked_until - timezone.now()).seconds // 60
            return Response(
                {"error": f"PIN is locked. Try again in {remaining} minutes."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = PINChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Verify old PIN
            is_valid = user.check_transaction_pin(serializer.validated_data['old_pin'])
            
            if not is_valid:
                attempts_left = max(0, 5 - user.pin_attempts)
                log_security_event(
                    user, 'pin_verify_failed', request,
                    action='change_pin',
                    attempts=user.pin_attempts
                )
                
                if user.is_pin_locked():
                    return Response(
                        {"error": "Too many failed attempts. PIN is now locked for 30 minutes."},
                        status=status.HTTP_403_FORBIDDEN
                    )
                
                return Response({
                    "error": "Invalid current PIN.",
                    "attempts_left": attempts_left
                }, status=status.HTTP_401_UNAUTHORIZED)
            
            # Set new PIN
            user.set_transaction_pin(serializer.validated_data['new_pin'])
            log_security_event(user, 'pin_change', request)
            
            return Response({
                "success": True,
                "message": "Transaction PIN changed successfully."
            }, status=status.HTTP_200_OK)
        
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error changing PIN for user {user.email}: {e}")
            return Response(
                {"error": "Failed to change PIN."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PINResetRequestView(APIView):
    """
    POST /api/pin/reset/request/
    Request a PIN reset (sends email with reset token)
    """
    permission_classes = []  # Public endpoint

    def post(self, request):
        serializer = PINResetRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            email = serializer.validated_data['email']
            user = User.objects.get(email=email)

            # Generate reset token
            reset_token = get_random_string(32)
            user.pin_reset_token = reset_token
            user.pin_reset_token_expiry = timezone.now() + timedelta(hours=1)
            user.save(update_fields=['pin_reset_token', 'pin_reset_token_expiry'])

            # Send reset email
            reset_url = f"{settings.BASE_URL}/reset-pin/{reset_token}/"
            
            # Import send_mail here to avoid circular import
            from django.core.mail import send_mail
            
            send_mail(
                subject="MafitaPay - Transaction PIN Reset",
                message=f"Click the link below to reset your transaction PIN:\n\n{reset_url}\n\nThis link expires in 1 hour.",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

            log_security_event(user, 'pin_reset_request', request)

            return Response({
                "success": True,
                "message": "PIN reset email sent. Please check your inbox."
            }, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            # Return success even if user doesn't exist (security best practice)
            return Response({
                "success": True,
                "message": "If an account exists with this email, a reset link will be sent."
            }, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error sending PIN reset email: {e}")
            return Response(
                {"error": "Failed to send reset email. Please try again later."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PINResetConfirmView(APIView):
    """
    POST /api/pin/reset/confirm/
    Confirm PIN reset with token and set new PIN
    """
    permission_classes = []  # Public endpoint

    def post(self, request):
        serializer = PINResetConfirmSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = serializer.validated_data['token']
            user = User.objects.get(pin_reset_token=token)

            # Check if token is expired
            if not user.pin_reset_token_expiry or timezone.now() > user.pin_reset_token_expiry:
                return Response(
                    {"error": "Reset token has expired. Please request a new one."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Set new PIN
            user.set_transaction_pin(serializer.validated_data['new_pin'])
            
            # Clear reset token
            user.pin_reset_token = None
            user.pin_reset_token_expiry = None
            user.save(update_fields=['pin_reset_token', 'pin_reset_token_expiry'])

            log_security_event(user, 'pin_reset_complete', request)

            return Response({
                "success": True,
                "message": "Transaction PIN reset successfully."
            }, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            return Response(
                {"error": "Invalid or expired reset token."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Error resetting PIN: {e}")
            return Response(
                {"error": "Failed to reset PIN."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PINStatusView(APIView):
    """
    GET /api/pin/status/
    Check if user has PIN set up
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            "has_pin": user.has_transaction_pin(),
            "is_locked": user.is_pin_locked(),
            "last_changed": user.last_pin_change,
        }, status=status.HTTP_200_OK)


class BiometricEnrollView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        device_id = request.data.get("device_id")
        platform = request.data.get("platform")

        if not device_id or not platform:
            return Response({"error": "Device ID and platform required"}, status=400)

        user.biometric_device_id = device_id
        user.biometric_platform = platform
        user.enable_biometric()

        return Response({"success": True}, status=201)


class BiometricDisableView(APIView):
    """
    POST /api/biometric/disable/
    Disable biometric authentication
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        try:
            user.disable_biometric()
            log_security_event(user, 'biometric_disabled', request)

            return Response({
                "success": True,
                "message": "Biometric authentication disabled successfully."
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error disabling biometric for user {user.email}: {e}")
            return Response(
                {"error": "Failed to disable biometric authentication."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BiometricStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        has_credential = bool(user.biometric_device_id)


        return Response({
            "enabled": user.biometric_enabled,
            "registered_at": user.biometric_registered_at,
            "has_credential": has_credential,
            "is_enrolled": user.biometric_enabled and has_credential,
            "platform": getattr(user, "biometric_platform", None),
            "device_id": getattr(user, "biometric_device_id", None),
        }, status=200)



class BiometricLoginView(APIView):
    permission_classes = []

    def post(self, request):
        email = (request.data.get("email") or "").lower().strip()
        device_id = (request.data.get("device_id") or "").strip()
        platform = (request.data.get("platform") or "web").lower().strip()

        if not email or not device_id:
            return Response({"error": "email and device_id required"}, status=400)

        user = User.objects.filter(email=email).first()
        if not user or not user.biometric_enabled:
            return Response({"error": "Biometric login not available"}, status=400)

        if getattr(user, "biometric_device_id", None) != device_id:
            return Response({"error": "Unrecognized device"}, status=401)

        refresh = RefreshToken.for_user(user)
        return Response({
            "success": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "is_merchant": user.is_merchant,
                "is_staff": user.is_staff,
            },
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }, status=200)
