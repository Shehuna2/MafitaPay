from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.conf import settings
from .models import Bonus, BonusType
from .services import BonusService
from django.contrib.auth import get_user_model
import logging

User = get_user_model()
logger = logging.getLogger(__name__)


class ReferralService:
    """
    Centralized referral awarding logic.

    Only award referral bonuses after the referee (new user)
    has BOTH: at least one successful deposit AND at least one successful transaction.

    Responsibilities:
    - ensure admin-controlled amounts (via BonusType 'referral')
    - award to referrer and optionally to referee (depending on BonusType or metadata)
    - prevent duplicate awarding
    - create Bonus objects (and unlock+apply immediately since this function is called
      when referee has completed deposit + tx)
    """

    @staticmethod
    def _get_referral_bonus_type():
        try:
            return BonusType.objects.get(name="referral", is_active=True)
        except BonusType.DoesNotExist:
            return None

    @staticmethod
    def _already_awarded_for_referral(referee_user):
        """
        Check if referral bonuses already exist for this referee.
        We'll consider any Bonus with metadata.referral_for_id == referee.id as evidence.
        """
        return Bonus.objects.filter(metadata__referral_for_id=str(referee_user.id)).exists()

    @staticmethod
    def award_if_eligible(referee_user):
        """
        Evaluate the referee_user and award referral bonuses if all conditions satisfied:
        - referee_user.referred_by exists (a reference to a User)
        - referee_user has at least one successful deposit and at least one successful non-deposit transaction
        - referral BonusType is active
        - referral hasn't been awarded already

        When conditions are met, create Bonus objects and then unlock+apply them to the
        user's wallet.locked_balance (this business logic matches the 'manual_or_business_logic'
        unlock_condition but is executed automatically here because this function is called
        when the referee satisfied the deposit+tx criteria).
        """
        try:
            if not getattr(referee_user, "referred_by", None):
                return False

            referrer = referee_user.referred_by
            if referrer is None:
                return False

            # do not award if already awarded
            if ReferralService._already_awarded_for_referral(referee_user):
                logger.info("Referral already awarded for referee %s", referee_user.id)
                return False

            # get the referral bonus type
            bonus_type = ReferralService._get_referral_bonus_type()
            if not bonus_type:
                logger.info("Referral BonusType not configured/active.")
                return False

            # Evaluate deposit + transaction condition
            from wallet.models import WalletTransaction
            has_deposit = WalletTransaction.objects.filter(user=referee_user, category="deposit", status="success").exists()
            has_tx = WalletTransaction.objects.filter(user=referee_user).exclude(category="deposit").filter(status="success").exists()
            if not (has_deposit and has_tx):
                # Not eligible yet
                return False

            # Determine base amount:
            amount = Decimal(bonus_type.default_amount or "0.00")

            # Admin overrides
            rules = bonus_type.default_rules or {}
            give_referee = rules.get("give_referee", True) if isinstance(rules, dict) else True
            give_referrer = rules.get("give_referrer", True) if isinstance(rules, dict) else True

            metadata_common = {
                "referral_for_id": str(referee_user.id),
                "awarded_by_system": True,
                "awarded_reason": "referral_after_deposit_and_tx",
                "awarded_at": timezone.now().isoformat(),
            }

            awarded = []

            # award to referrer
            if give_referrer and hasattr(referrer, "id"):
                referrer_amount = rules.get("referrer_amount") if isinstance(rules, dict) else None
                ref_amount = Decimal(referrer_amount) if (referrer_amount is not None) else amount

                b1 = BonusService.create_bonus(
                    user=referrer,
                    bonus_type=bonus_type,
                    amount=ref_amount,
                    description=f"Referral bonus for referring user {referee_user.id}",
                    locked=rules.get("locked", True) if isinstance(rules, dict) else True,
                    metadata={**metadata_common, "role": "referrer"}
                )
                awarded.append(("referrer", referrer.id, b1.id))

                # Unlock & apply immediately since the referee met deposit+tx criteria.
                # This implements the "manual_or_business_logic" unlock condition via business logic here.
                try:
                    unlocked = BonusService.unlock_bonus(b1)
                    if unlocked:
                        # apply to wallet locked_balance (idempotent)
                        BonusService.apply_bonus_to_wallet(b1)
                except Exception:
                    logger.exception("Failed to unlock/apply referrer bonus %s", getattr(b1, "id", None))

            # award to referee
            if give_referee:
                referee_amount = rules.get("referee_amount") if isinstance(rules, dict) else None
                r_amount = Decimal(referee_amount) if (referee_amount is not None) else amount

                b2 = BonusService.create_bonus(
                    user=referee_user,
                    bonus_type=bonus_type,
                    amount=r_amount,
                    description=f"Referral bonus for signing up with referral {getattr(referee_user, 'referred_by', None)}",
                    locked=rules.get("locked", True) if isinstance(rules, dict) else True,
                    metadata={**metadata_common, "role": "referee"}
                )
                awarded.append(("referee", referee_user.id, b2.id))

                try:
                    unlocked = BonusService.unlock_bonus(b2)
                    if unlocked:
                        BonusService.apply_bonus_to_wallet(b2)
                except Exception:
                    logger.exception("Failed to unlock/apply referee bonus %s", getattr(b2, "id", None))

            logger.info("Referral awarded and processed: %s", awarded)
            return True

        except Exception as exc:
            logger.exception("Error awarding referral for user %s: %s", getattr(referee_user, "id", "unknown"), exc)
            return False