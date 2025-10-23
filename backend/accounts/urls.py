from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

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
]