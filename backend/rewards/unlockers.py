# rewards/unlockers.py
import logging
from django.db import transaction
from wallet.models import WalletTransaction
from rewards.models import Bonus
from rewards.services import BonusService

logger = logging.getLogger(__name__)


def try_unlock_welcome_bonus(user):
    """
    Unlock welcome bonus after:
    - at least one successful deposit
    - at least one successful non-deposit transaction

    When unlocked we also APPLY the bonus to the wallet by calling
    BonusService.apply_bonus_to_wallet(bonus). apply_bonus_to_wallet is idempotent.
    """
    try:
        bonus = Bonus.objects.select_related("bonus_type").filter(
            user=user,
            bonus_type__name="welcome",
            status="locked",
        ).first()

        if not bonus:
            return False

        rules = bonus.bonus_type.default_rules or {}

        if not rules.get("auto_unlock", False):
            return False

        if rules.get("unlock_condition") != "deposit_and_first_tx":
            return False

        # ✅ Canonical checks
        has_deposit = WalletTransaction.objects.filter(
            user=user,
            category="deposit",
            status="success",
        ).exists()

        if not has_deposit:
            return False

        has_usage_tx = WalletTransaction.objects.filter(
            user=user,
            status="success",
        ).exclude(category__in=["deposit", "bonus", "refund"]).exists()

        if not has_usage_tx:
            return False

        # ✅ SINGLE SOURCE OF TRUTH
        with transaction.atomic():
            unlocked = BonusService.unlock_bonus(bonus)
            # Ensure wallet is credited for unlocked bonus (apply is idempotent)
            if unlocked:
                BonusService.apply_bonus_to_wallet(bonus)

        if unlocked:
            logger.info("Welcome bonus unlocked and applied for user %s", user.id)

        return unlocked

    except Exception:
        logger.exception("Failed to unlock welcome bonus for user %s", getattr(user, "id", None))
        return False


def try_unlock_referral_bonus(user):
    """
    Unlock (and apply) referral bonuses for a given user (referrer or referee).

    Behaviour:
    - Looks for locked bonuses of type 'referral' belonging to `user`.
    - Only acts on bonuses whose BonusType.default_rules has unlock_condition == "manual_or_business_logic".
    - For each matching locked bonus, it will:
        - call BonusService.unlock_bonus(bonus)
        - call BonusService.apply_bonus_to_wallet(bonus)
      apply_bonus_to_wallet is idempotent, so repeated calls are safe.
    - Returns the number of bonuses unlocked (integer) or False on error.
    """
    try:
        qs = Bonus.objects.select_related("bonus_type").filter(
            user=user,
            bonus_type__name="referral",
            status="locked",
        )

        if not qs.exists():
            return 0

        unlocked_count = 0
        for bonus in qs:
            rules = bonus.bonus_type.default_rules or {}
            # We expect manual/business unlock condition
            if rules.get("unlock_condition") != "manual_or_business_logic":
                # skip bonuses that are configured differently
                continue

            with transaction.atomic():
                unlocked = BonusService.unlock_bonus(bonus)
                if unlocked:
                    # apply to wallet locked_balance (idempotent)
                    BonusService.apply_bonus_to_wallet(bonus)
                    unlocked_count += 1
                    logger.info("Referral bonus unlocked and applied for user %s bonus %s", user.id, bonus.id)

        return unlocked_count

    except Exception:
        logger.exception("Failed to unlock referral bonuses for user %s", getattr(user, "id", None))
        return False