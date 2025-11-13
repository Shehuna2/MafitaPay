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
import uuid


logger = logging.getLogger(__name__)

PROVIDER_CHOICES = [
    ("flutterwave", "Flutterwave"),
    ("paystack", "Paystack"),
    ("monnify", "Monnify"),
    ("palmpay", "PalmPay"),
    ("opay", "OPay"),
]

DEPOSIT_STATUS = [
    ("pending", "Pending"),
    ("credited", "Credited"),
    ("failed", "Failed"),
    ("cancelled", "Cancelled"),
]

class Wallet(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    locked_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    flutterwave_customer_id = models.CharField(max_length=50, null=True, blank=True)

    van_account_number = models.CharField(max_length=20, blank=True, null=True, unique=True)
    van_bank_name = models.CharField(max_length=50, blank=True, null=True)
    van_provider = models.CharField(max_length=30, blank=True, null=True)

    def lock_funds(self, amount):
        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                logger.error(f"Invalid amount for lock_funds: user {self.user.id}, amount={amount}")
                return False
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(id=self.id)
                if wallet.balance >= amount:
                    wallet.balance -= amount
                    wallet.locked_balance += amount
                    wallet.save(update_fields=["balance", "locked_balance"])
                    logger.debug(f"Locked ₦{amount} for user {self.user.id}: balance={wallet.balance}, locked_balance={wallet.locked_balance}")
                    return True
                logger.error(f"Insufficient balance for lock_funds: user {self.user.id}, required={amount}, available={wallet.balance}")
                return False
        except Exception as e:
            logger.error(f"Error in lock_funds for user {self.user.id}: {str(e)}", exc_info=True)
            return False

    def release_funds(self, amount):
        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                logger.error(f"Invalid amount for release_funds: user {self.user.id}, amount={amount}")
                return False
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(id=self.id)
                if wallet.locked_balance >= amount:
                    wallet.locked_balance -= amount
                    wallet.save(update_fields=["locked_balance"])
                    logger.debug(f"Released ₦{amount} for user {self.user.id}: locked_balance={wallet.locked_balance}")
                    return True
                logger.error(f"Insufficient locked_balance for release_funds: user {self.user.id}, required={amount}, available={wallet.locked_balance}")
                return False
        except Exception as e:
            logger.error(f"Error in release_funds for user {self.user.id}: {str(e)}", exc_info=True)
            return False

    def refund_funds(self, amount):
        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                logger.error(f"Invalid amount for refund_funds: user {self.user.id}, amount={amount}")
                return False
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(id=self.id)
                if wallet.locked_balance >= amount:
                    wallet.locked_balance -= amount
                    wallet.balance += amount
                    wallet.save(update_fields=["balance", "locked_balance"])
                    logger.debug(f"Refunded ₦{amount} for user {self.user.id}: balance={wallet.balance}, locked_balance={wallet.locked_balance}")
                    return True
                logger.error(f"Insufficient locked_balance for refund_funds: user {self.user.id}, required={amount}, available={wallet.locked_balance}")
                return False
        except Exception as e:
            logger.error(f"Error in refund_funds for user {self.user.id}: {str(e)}", exc_info=True)
            return False

    def deposit(self, amount, reference="", metadata=None):
        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                logger.error(f"Invalid amount for deposit: user {self.user.id}, amount={amount}")
                return False
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(id=self.id)
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
                logger.debug(f"Deposited ₦{amount} for user {self.user.id}: balance={wallet.balance}, reference={reference}")
                return True
        except Exception as e:
            logger.error(f"Error in deposit for user {self.user.id}: {str(e)}", exc_info=True)
            return False

    def withdraw(self, amount, reference="", metadata=None):
        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                logger.error(f"Invalid amount for withdraw: user {self.user.id}, amount={amount}")
                return False
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(id=self.id)
                if wallet.balance < amount:
                    logger.error(f"Insufficient balance for withdraw: user {self.user.id}, required={amount}, available={wallet.balance}")
                    return False
                before = wallet.balance
                wallet.balance -= amount
                wallet.save(update_fields=["balance"])
                wallet.refresh_from_db()
                from .models import WalletTransaction
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
                    metadata=metadata or {},
                )
                logger.debug(f"Withdrew ₦{amount} for user {self.user.id}: balance={wallet.balance}, reference={reference}")
                return True
        except Exception as e:
            logger.error(f"Error in withdraw for user {self.user.id}: {str(e)}", exc_info=True)
            return False

    def available_balance(self):
        return self.balance - self.locked_balance

    def __str__(self):
        return f"{self.user.email} - Balance: ₦{self.balance}, Locked: ₦{self.locked_balance}"

class VirtualAccount(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="virtual_accounts")
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    provider_account_id = models.CharField(max_length=255, blank=True, null=True)
    account_number = models.CharField(max_length=128, blank=True, null=True)
    bank_name = models.CharField(max_length=128, blank=True, null=True)
    account_name = models.CharField(max_length=128, blank=True, null=True)
    currency = models.CharField(max_length=8, default="NGN")
    metadata = models.JSONField(default=dict, blank=True)
    assigned = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["provider", "provider_account_id"]),
            models.Index(fields=["account_number"]),
        ]

    def __str__(self):
        return f"{self.user.email} | {self.provider} VA {self.account_number or self.provider_account_id}"

class Deposit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deposits")
    virtual_account = models.ForeignKey(VirtualAccount, on_delete=models.PROTECT, related_name="deposits")
    amount = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, default="NGN")
    provider_reference = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=32, choices=DEPOSIT_STATUS, default="pending")
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"Deposit {self.id} {self.user.email} {self.amount} {self.status}"

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



