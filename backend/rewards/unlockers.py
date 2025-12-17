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
    # Check if user was referred
    if not getattr(user, "referred_by", None):
        return

    # Check requirements
    from wallet.models import WalletTransaction
    has_deposit = WalletTransaction.objects.filter(user=user, category="deposit", status="success").exists()
    has_tx = WalletTransaction.objects.filter(user=user).exclude(category="deposit").filter(status="success").exists()
    if not (has_deposit and has_tx):
        return

    # Unlock the bonus for the referrer
    referral_bonus_type = BonusType.objects.filter(name="referral", is_active=True).first()
    if not referral_bonus_type:
        return

    referrer = user.referred_by
    bonus = Bonus.objects.filter(
        user=referrer,
        bonus_type=referral_bonus_type,
        metadata__referral_for_id=user.id,
        status="locked"
    ).first()
    if bonus:
        bonus.status = "unlocked"
        bonus.activated_at = timezone.now()
        bonus.save(update_fields=["status", "activated_at", "updated_at"])