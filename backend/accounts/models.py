# File: accounts/models.py
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from wallet.models import Wallet
import logging
import uuid
from datetime import timedelta

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

    # Transaction PIN fields
    transaction_pin = models.CharField(max_length=128, blank=True, null=True)
    pin_attempts = models.PositiveIntegerField(default=0)
    pin_locked_until = models.DateTimeField(null=True, blank=True)
    last_pin_change = models.DateTimeField(null=True, blank=True)
    pin_reset_token = models.CharField(max_length=32, blank=True, null=True)
    pin_reset_token_expiry = models.DateTimeField(null=True, blank=True)

    # Biometric authentication fields
    biometric_enabled = models.BooleanField(default=False)
    biometric_registered_at = models.DateTimeField(null=True, blank=True)

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

    def set_transaction_pin(self, pin):
        """Set the transaction PIN (hashed)"""
        if not pin or len(str(pin)) != 4 or not str(pin).isdigit():
            raise ValueError("PIN must be exactly 4 digits")
        self.transaction_pin = make_password(str(pin))
        self.last_pin_change = timezone.now()
        self.pin_attempts = 0
        self.pin_locked_until = None
        self.save(update_fields=['transaction_pin', 'last_pin_change', 'pin_attempts', 'pin_locked_until'])
        logger.info(f"Transaction PIN set for user {self.email}")

    def check_transaction_pin(self, pin):
        """Verify the transaction PIN"""
        # Check if PIN is locked
        if self.pin_locked_until and timezone.now() < self.pin_locked_until:
            remaining = (self.pin_locked_until - timezone.now()).seconds // 60
            raise ValueError(f"PIN is locked. Try again in {remaining} minutes")

        # Check if PIN is set
        if not self.transaction_pin:
            raise ValueError("Transaction PIN not set")

        # Verify PIN
        is_valid = check_password(str(pin), self.transaction_pin)
        
        if is_valid:
            # Reset attempts on successful verification
            self.pin_attempts = 0
            self.save(update_fields=['pin_attempts'])
            logger.info(f"Transaction PIN verified for user {self.email}")
            return True
        else:
            # Increment failed attempts
            self.pin_attempts += 1
            
            # Lock PIN after 5 failed attempts
            if self.pin_attempts >= 5:
                self.pin_locked_until = timezone.now() + timedelta(minutes=30)
                logger.warning(f"Transaction PIN locked for user {self.email} due to too many failed attempts")
            
            self.save(update_fields=['pin_attempts', 'pin_locked_until'])
            logger.warning(f"Failed PIN attempt for user {self.email}. Attempts: {self.pin_attempts}")
            return False

    def has_transaction_pin(self):
        """Check if user has set a transaction PIN"""
        return bool(self.transaction_pin)

    def is_pin_locked(self):
        """Check if PIN is currently locked"""
        if self.pin_locked_until and timezone.now() < self.pin_locked_until:
            return True
        return False

    def unlock_pin(self):
        """Unlock the PIN (admin or after timeout)"""
        self.pin_attempts = 0
        self.pin_locked_until = None
        self.save(update_fields=['pin_attempts', 'pin_locked_until'])
        logger.info(f"Transaction PIN unlocked for user {self.email}")

    def enable_biometric(self):
        """Enable biometric authentication"""
        self.biometric_enabled = True
        self.biometric_registered_at = timezone.now()
        self.save(update_fields=['biometric_enabled', 'biometric_registered_at'])
        logger.info(f"Biometric authentication enabled for user {self.email}")

    def disable_biometric(self):
        """Disable biometric authentication"""
        self.biometric_enabled = False
        self.save(update_fields=['biometric_enabled'])
        logger.info(f"Biometric authentication disabled for user {self.email}")
        

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