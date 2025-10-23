from django.db import models
from django.conf import settings
from django.db import transaction
from decimal import Decimal
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
import logging


logger = logging.getLogger(__name__)


class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    locked_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    # ✅ PalmPay Virtual Account
    van_account_number = models.CharField(max_length=20, blank=True, null=True, unique=True)
    van_bank_name = models.CharField(max_length=50, blank=True, null=True)
    van_provider = models.CharField(max_length=30, blank=True, null=True)  # e.g. "palmpay"

    def lock_funds(self, amount: Decimal):
        if self.balance >= amount:
            self.balance -= amount
            self.locked_balance += amount
            self.save(update_fields=["balance", "locked_balance"])
            return True
        return False

    def release_funds(self, amount: Decimal):
        if self.locked_balance >= amount:
            self.locked_balance -= amount
            self.save(update_fields=["locked_balance"])
            return True
        return False

    def refund_funds(self, amount: Decimal):
        if self.locked_balance >= amount:
            self.locked_balance -= amount
            self.balance += amount
            self.save(update_fields=["balance", "locked_balance"])
            return True
        return False

    def deposit(self, amount: Decimal, reference="", metadata=None):
        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(id=self.id)
            if amount > 0:
                before = wallet.balance
                wallet.balance += amount
                wallet.save(update_fields=["balance"])
                wallet.refresh_from_db()

                from .models import WalletTransaction
                WalletTransaction.objects.create(
                    user=wallet.user,
                    wallet=wallet,
                    tx_type="credit",
                    category="deposit",
                    amount=amount,
                    balance_before=before,
                    balance_after=wallet.balance,
                    reference=reference,
                    status="success",
                    metadata=metadata or {},
                )
                return True
        return False



    def withdraw(self, amount: Decimal, reference="", metadata=None):
        """Secure wallet withdrawal with DB locking"""
        from .models import WalletTransaction  # Avoid circular import

        if amount <= 0:
            return False

        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(id=self.id)

            if wallet.balance < amount:
                return False  # Insufficient funds

            before = wallet.balance
            wallet.balance -= amount
            wallet.save(update_fields=["balance"])
            wallet.refresh_from_db()

            WalletTransaction.objects.create(
                user=wallet.user,
                wallet=wallet,
                tx_type="debit",
                category="withdrawal",
                amount=amount,
                balance_before=before,
                balance_after=wallet.balance,
                reference=reference,
                status="success",
                metadata=metadata or {}
            )

        return True


    def available_balance(self):
        return self.balance - self.locked_balance

    def __str__(self):
        return f"{self.user.email} - Balance: ₦{self.balance}, Locked: ₦{self.locked_balance}"


    @receiver(post_save, sender=settings.AUTH_USER_MODEL)
    def create_wallet(sender, instance, created, **kwargs):
        """Automatically create a wallet and assign a PalmPay VAN on signup"""
        if created:
            wallet = Wallet.objects.create(user=instance, balance=200.00)
            logger.info(f"Wallet created with ₦200 bonus for {instance.email}")


class WalletTransaction(models.Model):
    TX_TYPE_CHOICES = [("debit", "Debit"), ("credit", "Credit")]
    STATUS_CHOICES = [("pending", "Pending"), ("success", "Success"), ("failed", "Failed")]
    CATEGORY_CHOICES = [
        ("deposit", "Deposit"),
        ("withdrawal", "Withdrawal"),
        ("airtime", "Airtime"),
        ("data", "Data"),
        ("gasfee", "Gas Fee"),
        ("crypto", "Crypto"),
        ("other", "Other"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    wallet = models.ForeignKey("Wallet", on_delete=models.CASCADE)
    tx_type = models.CharField(max_length=10, choices=TX_TYPE_CHOICES)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    balance_before = models.DecimalField(max_digits=12, decimal_places=2)
    balance_after = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    request_id = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    metadata = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email} - {self.category} - {self.amount} ({self.status})"


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    message = models.CharField(max_length=255)
    transaction = models.ForeignKey(
        "wallet.WalletTransaction", on_delete=models.SET_NULL, null=True, blank=True
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.email}: {self.message[:50]}"



