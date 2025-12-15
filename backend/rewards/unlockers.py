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

        if unlocked:
            logger.info("Welcome bonus unlocked for user %s", user.id)

        return unlocked

    except Exception:
        logger.exception("Failed to unlock welcome bonus for user %s", getattr(user, "id", None))
        return False
