import re
import sys
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
from django.core.mail import send_mail
from decimal import Decimal
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from .serializers import (
    RegisterSerializer, LoginSerializer, UserProfileSerializer
)

from .models import User, UserProfile
from wallet.models import WalletTransaction, Wallet
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
            if not user.is_email_verified:
                user.is_email_verified = True
                user.verification_token = None
                user.save()

                # Award referral bonuses if user was referred
                if user.referred_by:
                    referrer = user.referred_by
                    REFERRER_BONUS = Decimal(getattr(settings, "REFERRER_BONUS", "200.00"))
                    NEW_USER_BONUS = Decimal(getattr(settings, "NEW_USER_BONUS", "100.00"))

                    try:
                        referrer_wallet = referrer.wallet
                        new_user_wallet = user.wallet

                        # Referrer bonus
                        referrer_wallet.balance += REFERRER_BONUS
                        referrer_wallet.save()
                        WalletTransaction.objects.create(
                            user=referrer,
                            wallet=referrer_wallet,
                            tx_type="credit",
                            category="referral",
                            amount=REFERRER_BONUS,
                            balance_before=referrer_wallet.balance - REFERRER_BONUS,
                            balance_after=referrer_wallet.balance,
                            reference=f"Referral bonus for inviting {user.email}",
                            status="success",
                        )

                        # New user bonus
                        new_user_wallet.balance += NEW_USER_BONUS
                        new_user_wallet.save()
                        WalletTransaction.objects.create(
                            user=user,
                            wallet=new_user_wallet,
                            tx_type="credit",
                            category="referral",
                            amount=NEW_USER_BONUS,
                            balance_before=new_user_wallet.balance - NEW_USER_BONUS,
                            balance_after=new_user_wallet.balance,
                            reference="Signup bonus via referral",
                            status="success",
                        )

                        # Notify users via email
                        send_mail(
                            subject="Referral Bonus Awarded",
                            message=f"Congratulations! You've earned a ₦{REFERRER_BONUS} bonus for referring {user.email}.",
                            from_email=settings.DEFAULT_FROM_EMAIL,
                            recipient_list=[referrer.email],
                        )
                        send_mail(
                            subject="Welcome to MafitaPay!",
                            message=f"Welcome! You've received a ₦{NEW_USER_BONUS} signup bonus for joining via a referral.",
                            from_email=settings.DEFAULT_FROM_EMAIL,
                            recipient_list=[user.email],
                        )

                        logger.info(f"Referral bonuses awarded: ₦{REFERRER_BONUS} to {referrer.email}, ₦{NEW_USER_BONUS} to {user.email}")
                    except Exception as e:
                        logger.error(f"[Referral Bonus Error] Failed for {user.email}: {str(e)}")

                # Optional: Bonus for non-referred users
                else:
                    NON_REFERRED_BONUS = Decimal(getattr(settings, "NON_REFERRED_BONUS", "0.00"))
                    if NON_REFERRED_BONUS > 0:
                        new_user_wallet = user.wallet
                        new_user_wallet.balance += NON_REFERRED_BONUS
                        new_user_wallet.save()
                        WalletTransaction.objects.create(
                            user=user,
                            wallet=new_user_wallet,
                            tx_type="credit",
                            category="signup",
                            amount=NON_REFERRED_BONUS,
                            balance_before=new_user_wallet.balance - NON_REFERRED_BONUS,
                            balance_after=new_user_wallet.balance,
                            reference="Signup bonus for non-referred user",
                            status="success",
                        )
                        send_mail(
                            subject="Welcome to MafitaPay!",
                            message=f"Welcome! You've received a ₦{NON_REFERRED_BONUS} signup bonus.",
                            from_email=settings.DEFAULT_FROM_EMAIL,
                            recipient_list=[user.email],
                        )
                        logger.info(f"Non-referred signup bonus awarded: ₦{NON_REFERRED_BONUS} to {user.email}")

                logger.info(f"Email verified for {user.email}")
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
            first_name = profile.first_name if profile else ""
            last_name = profile.last_name if profile else ""
            send_verification_email.delay(user.email, verification_url, first_name, last_name)
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
            

class ReferralListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        referrals = request.user.referrals.all().values("email", "date_joined")
        referral_code = request.user.referral_code
        total_referrals = referrals.count()
        total_bonus = total_referrals * 200  # adjust if you want dynamic bonuses

        return Response({
            "referral_code": referral_code,
            "total_referrals": total_referrals,
            "total_bonus": total_bonus,
            "referred_users": list(referrals),
        })
