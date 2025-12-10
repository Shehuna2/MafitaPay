# rewards/services.py
from decimal import Decimal
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from wallet.models import WalletTransaction, Wallet
from .models import Bonus, BonusType

class BonusService:
    @staticmethod
    def create_bonus(user, bonus_type: BonusType, amount: Decimal = None, description: str = "", locked: bool = True, metadata: dict = None, expiry_days: int = None):
        amount = Decimal(amount) if amount is not None else Decimal(bonus_type.default_amount)
        metadata = metadata or {}
        now = timezone.now()
        expires_at = None
        if expiry_days is None and bonus_type.default_expiry_days:
            expiry_days = bonus_type.default_expiry_days
        if expiry_days:
            expires_at = now + timezone.timedelta(days=expiry_days)

        bonus = Bonus.objects.create(
            user=user,
            bonus_type=bonus_type,
            amount=amount,
            status="locked" if locked else "unlocked",
            description=description,
            metadata=metadata,
            expires_at=expires_at,
        )

        if not locked:
            # credit immediately
            BonusService._apply_bonus_to_wallet(bonus)

        return bonus

    @staticmethod
    def unlock_bonus(bonus: Bonus):
        if bonus.status != "locked":
            return False
        bonus.status = "unlocked"
        bonus.activated_at = timezone.now()
        bonus.save(update_fields=["status", "activated_at", "updated_at"])
        BonusService._apply_bonus_to_wallet(bonus)
        return True

    @staticmethod
    def _apply_bonus_to_wallet(bonus: Bonus):
        """
        Apply the bonus to the user's wallet. Currently credits to wallet.locked_balance
        to prevent withdrawal by default. Create a WalletTransaction with category 'bonus'.
        """
        wallet: Wallet = bonus.user.wallet
        amount = Decimal(bonus.amount)
        with transaction.atomic():
            # update locked_balance
            wallet = Wallet.objects.select_for_update().get(id=wallet.id)
            before_locked = wallet.locked_balance
            wallet.locked_balance = (wallet.locked_balance or Decimal("0.00")) + amount
            wallet.save(update_fields=["locked_balance"])

            WalletTransaction.objects.create(
                user=bonus.user,
                wallet=wallet,
                tx_type="credit",
                category="bonus",
                amount=amount,
                balance_before=getattr(wallet, "balance", 0),  # store main balance before (not changed)
                balance_after=getattr(wallet, "balance", 0),
                reference=f"Bonus credit: {bonus.bonus_type.name}",
                status="success",
                metadata={
                    "bonus_id": bonus.id,
                    **(bonus.metadata or {}),
                    "withdrawal_restricted": bonus.metadata.get("withdrawal_restricted", True),
                    
                },
            )
        return True

    @staticmethod
    def manual_credit(user, amount, bonus_type_name="manual", description="", unlocked=True, metadata=None):
        try:
            bonus_type = BonusType.objects.get(name=bonus_type_name)
        except BonusType.DoesNotExist:
            bonus_type = BonusType.objects.create(name=bonus_type_name, display_name=bonus_type_name, default_amount=amount)
        return BonusService.create_bonus(user, bonus_type, amount=amount, description=description, locked=not unlocked, metadata=metadata)
