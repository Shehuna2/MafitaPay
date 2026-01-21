from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views_webauthn import WebAuthnChallengeView, WebAuthnVerifyView
from .views_pin import (
    PINSetupView, PINVerifyView, PINChangeView, 
    PINResetRequestView, PINResetConfirmView, PINStatusView,
    BiometricEnrollView, BiometricDisableView, BiometricStatusView, BiometricLoginView
)


urlpatterns = [
    path('profile-api/', views.ProfileAPIView.as_view(), name='profile_api'),
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("referrals/", views.ReferralListView.as_view(), name="referral-list"),
    path("verify-email/<str:token>/", views.VerifyEmailView.as_view(), name="verify_email"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password_reset_request"),  
    path("password-reset/<str:token>/", views.PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    path("password-reset/validate/<str:token>/", views.PasswordResetValidateView.as_view(), name="password_reset_validate"),
    path("resend-verification/", views.ResendVerificationEmailView.as_view(), name="resend_verification"),
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),  
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),  
    path("account/deactivate/", views.AccountDeactivateView.as_view(), name="account_deactivate"),
    path("account/delete/", views.AccountDeleteView.as_view(), name="account_delete"),

    # WebAuthn endpoints
    path("webauthn/challenge/", WebAuthnChallengeView.as_view(), name="webauthn_challenge"),
    path("webauthn/verify/", WebAuthnVerifyView.as_view(), name="webauthn_verify"),

    # Transaction PIN endpoints
    path("pin/setup/", PINSetupView.as_view(), name="pin_setup"),
    path("pin/verify/", PINVerifyView.as_view(), name="pin_verify"),
    path("pin/change/", PINChangeView.as_view(), name="pin_change"),
    path("pin/reset/request/", PINResetRequestView.as_view(), name="pin_reset_request"),
    path("pin/reset/confirm/", PINResetConfirmView.as_view(), name="pin_reset_confirm"),
    path("pin/status/", PINStatusView.as_view(), name="pin_status"),

    # Biometric endpoints
    path("biometric/enroll/", BiometricEnrollView.as_view(), name="biometric_enroll"),
    path("biometric/disable/", BiometricDisableView.as_view(), name="biometric_disable"),
    path("biometric/status/", BiometricStatusView.as_view(), name="biometric_status"),
    path("biometric/login/", BiometricLoginView.as_view(), name="biometric_login"),
]
