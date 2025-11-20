# File: accounts/models.py
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from wallet.models import Wallet
import logging
import uuid

logger = logging.getLogger(__name__)

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    is_merchant = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    two_factor_enabled = models.BooleanField(default=False)
    verification_token = models.CharField(max_length=32, blank=True, null=True)
    reset_token = models.CharField(max_length=32, blank=True, null=True)
    reset_token_expiry = models.DateTimeField(null=True, blank=True)  
    two_factor_code = models.CharField(max_length=6, blank=True, null=True)

    # 🔹 New fields
    referral_code = models.CharField(max_length=10, unique=True, blank=True, null=True)
    referred_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="referrals"
    )

    webauthn_credential_id = models.CharField(max_length=255, blank=True, null=True)
    webauthn_public_key = models.TextField(blank=True, null=True)
    webauthn_sign_count = models.PositiveIntegerField(default=0)  # optional: track replay attacks

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    def save(self, *args, **kwargs):
        # Generate referral code if missing
        if not self.referral_code:
            base_code = "MAF"  # Since username is always None
            max_attempts = 10  # Prevent infinite loops
            for _ in range(max_attempts):
                unique_part = uuid.uuid4().hex[:5].upper()
                referral_code = f"{base_code}{unique_part}"
                if not User.objects.filter(referral_code=referral_code).exists():
                    self.referral_code = referral_code
                    break
            else:
                raise ValueError("Unable to generate a unique referral code after multiple attempts")
        super().save(*args, **kwargs)

    def __str__(self):
        role = "Merchant" if self.is_merchant else "Regular User"
        return f"{self.email} - {role}"
        

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    first_name = models.CharField(max_length=50, blank=True, null=True)
    last_name = models.CharField(max_length=50, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    account_no = models.CharField(max_length=20, blank=True, null=True)
    flutterwave_customer_id = models.CharField(max_length=50, null=True, blank=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    total_trades = models.PositiveIntegerField(default=0)
    successful_trades = models.PositiveIntegerField(default=0)
    profile_image = models.ImageField(upload_to="profile_images/", default="profile_images/avt13.jpg", blank=True, null=True)
    id_document = models.FileField(upload_to="documents/", blank=True, null=True)

    @property
    def success_rate(self):
        return (self.successful_trades / self.total_trades * 100) if self.total_trades > 0 else 0

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"

    def __str__(self):
        return f"Profile of {self.user.email}"

@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    UserProfile.objects.get_or_create(user=instance)

@receiver(post_save, sender=User)
def create_wallet_for_new_user(sender, instance, created, **kwargs):
    if created:
        wallet, created_wallet = Wallet.objects.get_or_create(user=instance, defaults={'balance': 0})
        if created_wallet:
            wallet.save()
            logger.info(f"Wallet created for {instance.email}")