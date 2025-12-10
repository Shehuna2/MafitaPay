from django.db import models
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from wallet.models import Wallet

# Create your models here.
class Deposit_P2P_Offer(models.Model):
    merchant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    amount_available = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # Merchant balance
    min_amount = models.DecimalField(max_digits=10, decimal_places=2)
    max_amount = models.DecimalField(max_digits=10, decimal_places=2)
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def cancel_offer(self):
        """Cancel the offer and refund locked funds to the merchant wallet."""
        from p2p.models import Wallet  # avoid circular import
        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(user=self.merchant)
            refunded = wallet.refund_funds(self.amount_available)
            if refunded:
                self.is_available = False
                self.amount_available = 0
                self.save(update_fields=["is_available", "amount_available"])
            return refunded

    def save(self, *args, **kwargs):
        wallet = Wallet.objects.get(user=self.merchant)
        max_allowed = wallet.balance - wallet.locked_balance # Ensure no over-allocation
        if self.max_amount > max_allowed:
            self.max_amount = max_allowed  
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.merchant.email} - ₦{self.price_per_unit} per unit (Min: ₦{self.min_amount}, Max: ₦{self.max_amount})"

class DepositOrder(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Awaiting Payment'),
        ('paid', 'Paid - Releasing'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="buyer_order")
    sell_offer = models.ForeignKey(Deposit_P2P_Offer, on_delete=models.CASCADE, related_name="orders")
    amount_requested = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.total_price = self.amount_requested * self.sell_offer.price_per_unit
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order {self.id} - {self.buyer.email} from {self.sell_offer.merchant.email}"

class Withdraw_P2P_Offer(models.Model):
    merchant          = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    amount_available  = models.DecimalField(max_digits=10, decimal_places=2)
    min_amount        = models.DecimalField(max_digits=10, decimal_places=2)
    max_amount        = models.DecimalField(max_digits=10, decimal_places=2)
    price_per_unit    = models.DecimalField(max_digits=10, decimal_places=2)
    is_active         = models.BooleanField(default=True)
    created_at        = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # cap max_amount to available user funds
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.merchant.email} buys up to {self.max_amount} @ ₦{self.price_per_unit}"

class WithdrawOrder(models.Model):
    STATUS_CHOICES = DepositOrder.STATUS_CHOICES  # reuse your existing statuses

    buyer_offer       = models.ForeignKey(Withdraw_P2P_Offer, on_delete=models.CASCADE)
    seller            = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    amount_requested  = models.DecimalField(max_digits=10, decimal_places=2)
    total_price       = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    status            = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    created_at        = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        self.total_price = self.amount_requested * self.buyer_offer.price_per_unit
        if not self.pk:  # Only on creation
            seller_wallet = Wallet.objects.select_for_update().get(user=self.seller)
            if seller_wallet.balance < self.amount_requested:
                raise ValueError("Insufficient balance to lock for this order.")
            if not seller_wallet.lock_funds(self.amount_requested):  # Lock user's funds as escrow
                raise ValueError("Failed to lock funds for this order.")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"WithdrawOrder #{self.id}: {self.seller.email} → {self.buyer_offer.merchant.email}"


class Dispute(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("resolved_buyer", "Resolved in Buyer's Favor"),
        ("resolved_merchant", "Resolved in Merchant's Favor"),
        ("rejected", "Rejected"),
    ]

    order = models.OneToOneField(DepositOrder, on_delete=models.CASCADE, related_name="dispute")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="disputes_raised")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    reason = models.TextField(blank=True, null=True)
    proof = models.FileField(upload_to="disputes/", blank=True, null=True)
    admin_comment = models.TextField(blank=True, null=True)  # Admin’s decision notes
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def resolve_dispute(self, decision, admin_comment=""):
        self.status = decision
        self.admin_comment = admin_comment
        self.resolved_at = timezone.now()
        self.save()

        if decision == "resolved_buyer":
            self.order.buyer.wallet.balance += self.order.amount_requested
            decision_text = "in Buyer's favor"
        elif decision == "resolved_merchant":
            self.order.merchant.wallet.balance += self.order.amount_requested
            decision_text = "in Merchant's favor"
        else:
            decision_text = "Rejected"

        self.order.status = "completed" if decision != "rejected" else "disputed"
        self.order.save()

        # send_mail(
        #     "Dispute Resolution",
        #     f"Your dispute for Order #{self.order.id} has been resolved {decision_text}.\nAdmin Comment: {self.admin_comment}",
        #     "noreply@mafitapay.com",
        #     [self.order.buyer.email, self.order.merchant.email],
        #     fail_silently=True,
        # )