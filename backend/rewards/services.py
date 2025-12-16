# rewards/services.py
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from wallet.models import WalletTransaction, Wallet
from .models import Bonus, BonusType
import logging

logger = logging.getLogger(__name__)


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

    @staticmethod
    def claim_bonus(bonus: Bonus):
        """
        Move bonus amount from wallet.locked_balance into wallet.balance and
        mark bonus.status = 'used'. Idempotent & transactional.

        Returns:
          True if successfully claimed (or already claimed),
          False if claim cannot be performed (e.g. status not unlocked)
        """
        try:
            # Only unlocked bonuses can be claimed
            if bonus.status != "unlocked":
                logger.debug("claim_bonus: bonus not unlocked (id=%s status=%s)", bonus.id, bonus.status)
                return False

            amount = Decimal(bonus.amount)

            with transaction.atomic():
                # Idempotency: if a claim tx already exists, treat as already claimed
                existing_claim = WalletTransaction.objects.filter(
                    metadata__claimed_bonus_id=str(bonus.id),
                    category="bonus",
                    status="success",
                ).exists()
                if existing_claim:
                    # Ensure bonus is marked used
                    if bonus.status != "used":
                        bonus.status = "used"
                        bonus.save(update_fields=["status", "updated_at"])
                    logger.info("claim_bonus: bonus already claimed (id=%s)", bonus.id)
                    return True

                wallet = Wallet.objects.select_for_update().get(user=bonus.user)

                # Ensure there are sufficient locked funds (should normally be true)
                if (wallet.locked_balance or Decimal("0.00")) < amount:
                    logger.error(
                        "claim_bonus: insufficient locked_balance for user %s bonus %s: have=%s need=%s",
                        bonus.user_id, bonus.id, wallet.locked_balance, amount
                    )
                    return False

                # Move locked_balance -> balance
                before_balance = wallet.balance
                before_locked = wallet.locked_balance

                wallet.locked_balance = (wallet.locked_balance or Decimal("0.00")) - amount
                wallet.balance = (wallet.balance or Decimal("0.00")) + amount
                wallet.save(update_fields=["balance", "locked_balance"])

                # Create transaction representing the claim
                WalletTransaction.objects.create(
                    user=bonus.user,
                    wallet=wallet,
                    tx_type="credit",
                    category="bonus",
                    amount=amount,
                    balance_before=before_balance,
                    balance_after=wallet.balance,
                    reference=f"claim-bonus-{bonus.id}",
                    status="success",
                    metadata={
                        "bonus_id": str(bonus.id),
                        "claimed_bonus_id": str(bonus.id),
                        "bonus_type": bonus.bonus_type.name,
                        **(bonus.metadata or {}),
                    },
                )

                # Mark bonus used
                bonus.status = "used"
                bonus.save(update_fields=["status", "updated_at"])

            logger.info("claim_bonus: claimed bonus %s for user %s", bonus.id, bonus.user_id)
            return True

        except Exception as exc:
            logger.exception("claim_bonus failed for bonus %s: %s", getattr(bonus, "id", None), exc)
            return False