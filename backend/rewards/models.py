# rewards/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator
from decimal import Decimal

class BonusType(models.Model):
    """
    Template controlled by admin. Admin sets default_amount and whether this type is active.
    """
    TYPE_CHOICES = [
        ("welcome", "Welcome"),
        ("referral", "Referral"),
        ("promo", "Promo"),
        ("loyalty", "Loyalty"),
        ("seasonal", "Seasonal"),
        ("manual", "Manual"),
        ("cashback", "Cashback"),
        ("deposit", "Deposit Bonus"),
        ("airtime_data", "Airtime/Data Only"),
    ]

    name = models.CharField(max_length=50, choices=TYPE_CHOICES, unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    default_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(Decimal("0.00"))])
    default_expiry_days = models.IntegerField(null=True, blank=True)  # optional default expiry
    default_rules = models.JSONField(default=dict, blank=True)  # e.g. {"withdrawal_restricted": True, "usage":"bills_only"}

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.display_name or self.get_name_display()


class Bonus(models.Model):
    STATUS_CHOICES = [
        ("locked", "Locked"),
        ("unlocked", "Unlocked"),
        ("used", "Used"),
        ("expired", "Expired"),
        ("reversed", "Reversed"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bonuses")
    bonus_type = models.ForeignKey(BonusType, on_delete=models.PROTECT, related_name="bonuses")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="locked")
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def unlock(self):
        from .services import BonusService
        BonusService.unlock_bonus(self)

    def expire(self):
        if self.status not in ("used", "expired", "reversed"):
            self.status = "expired"
            self.save(update_fields=["status", "updated_at"])

    def __str__(self):
        return f"{self.user.email} - {self.bonus_type} - ₦{self.amount} ({self.status})"
