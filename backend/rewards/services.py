# rewards/services.py
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from wallet.models import WalletTransaction, Wallet
from .models import Bonus, BonusType


class BonusService:

    @staticmethod
    def create_bonus(
        user,
        bonus_type: BonusType,
        amount: Decimal = None,
        description: str = "",
        locked: bool = True,
        metadata: dict = None,
        expiry_days: int = None,
    ):
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

        # ❗ DO NOT credit wallet here unless explicitly unlocked
        if not locked:
            BonusService.apply_bonus_to_wallet(bonus)

        return bonus

    @staticmethod
    def unlock_bonus(bonus: Bonus):
        """
        Unlocks bonus ONLY. Wallet crediting is explicit and guarded.
        """
        if bonus.status != "locked":
            return False

        bonus.status = "unlocked"
        bonus.activated_at = timezone.now()
        bonus.save(update_fields=["status", "activated_at", "updated_at"])
        return True

    @staticmethod
    def apply_bonus_to_wallet(bonus: Bonus):
        """
        Credit bonus to wallet.locked_balance exactly once.
        """
        amount = Decimal(bonus.amount)

        with transaction.atomic():
            # 🔒 Idempotency guard
            already_applied = WalletTransaction.objects.filter(
                metadata__bonus_id=str(bonus.id),
                category="bonus",
                status="success",
            ).exists()

            if already_applied:
                return False

            wallet = Wallet.objects.select_for_update().get(user=bonus.user)

            wallet.locked_balance = (wallet.locked_balance or Decimal("0.00")) + amount
            wallet.save(update_fields=["locked_balance"])

            WalletTransaction.objects.create(
                user=bonus.user,
                wallet=wallet,
                tx_type="credit",
                category="bonus",
                amount=amount,
                balance_before=wallet.balance,
                balance_after=wallet.balance,
                reference=f"bonus-{bonus.bonus_type.name}-{bonus.id}",
                status="success",
                metadata={
                    "bonus_id": str(bonus.id),
                    "bonus_type": bonus.bonus_type.name,
                    **(bonus.metadata or {}),
                },
            )

        return True

    @staticmethod
    def manual_credit(
        user,
        amount,
        bonus_type_name="manual",
        description="",
        unlocked=True,
        metadata=None,
    ):
        bonus_type, _ = BonusType.objects.get_or_create(
            name=bonus_type_name,
            defaults={
                "display_name": bonus_type_name,
                "default_amount": amount,
            },
        )

        bonus = BonusService.create_bonus(
            user=user,
            bonus_type=bonus_type,
            amount=amount,
            description=description,
            locked=not unlocked,
            metadata=metadata,
        )

        if unlocked:
            BonusService.apply_bonus_to_wallet(bonus)

        return bonus
