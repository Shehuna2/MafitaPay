# rewards/referral.py
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
    - create Bonus objects (not direct wallet writes)
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
        We'll consider any Bonus with metadata.referral_for == referee.id as evidence.
        """
        return Bonus.objects.filter(metadata__referral_for_id=str(referee_user.id)).exists()

    @staticmethod
    def award_if_eligible(referee_user):
        """
        Evaluate the referee_user and award referral bonuses if all conditions satisfied:
        - referee_user.referred_by exists (a reference to a User or referrer identifier)
        - referee_user has at least one successful deposit and at least one successful non-deposit transaction
        - referral BonusType is active
        - referral hasn't been awarded already
        """
        try:
            if not getattr(referee_user, "referred_by", None):
                return False

            referrer = referee_user.referred_by  # expected to be a FK to User or user id lookup
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

            # Determine amounts:
            # Admin controls default_amount on BonusType. If admin set metadata overrides, they can be placed in bonus_type.default_rules or
            # in BonusType.default_amount. We'll use default_amount for simplicity; admin can create manual bonus instances too.
            amount = Decimal(bonus_type.default_amount or "0.00")

            # Create referee bonus (if desired). Admin can control via default_rules: {"give_referee": True}
            give_referee = bonus_type.default_rules.get("give_referee", True) if isinstance(bonus_type.default_rules, dict) else True
            give_referrer = bonus_type.default_rules.get("give_referrer", True) if isinstance(bonus_type.default_rules, dict) else True

            metadata = {
                "referral_for_id": str(referee_user.id),
                "awarded_by_system": True,
                "awarded_reason": "referral_after_deposit_and_tx",
                "awarded_at": timezone.now().isoformat(),
            }

            awarded = []

            # award to referrer
            if give_referrer and hasattr(referrer, "id"):
                # allow admin override amount for referrer via default_rules e.g. {"referrer_amount": 300}
                referrer_amount = bonus_type.default_rules.get("referrer_amount") if isinstance(bonus_type.default_rules, dict) else None
                ref_amount = Decimal(referrer_amount) if referrer_amount is not None else amount
                b1 = BonusService.create_bonus(
                    user=referrer,
                    bonus_type=bonus_type,
                    amount=ref_amount,
                    description=f"Referral bonus for referring user {referee_user.id}",
                    locked=bonus_type.default_rules.get("locked", True) if isinstance(bonus_type.default_rules, dict) else True,
                    metadata={**metadata, "role": "referrer"}
                )
                awarded.append(("referrer", referrer.id, b1.id))

            # award to referee
            if give_referee:
                referee_amount = bonus_type.default_rules.get("referee_amount") if isinstance(bonus_type.default_rules, dict) else None
                r_amount = Decimal(referee_amount) if referee_amount is not None else amount
                b2 = BonusService.create_bonus(
                    user=referee_user,
                    bonus_type=bonus_type,
                    amount=r_amount,
                    description=f"Referral bonus for signing up with referral {getattr(referee_user, 'referred_by', None)}",
                    locked=bonus_type.default_rules.get("locked", True) if isinstance(bonus_type.default_rules, dict) else True,
                    metadata={**metadata, "role": "referee"}
                )
                awarded.append(("referee", referee_user.id, b2.id))

            logger.info("Referral awarded: %s", awarded)
            return True

        except Exception as exc:
            logger.exception("Error awarding referral for user %s: %s", getattr(referee_user, "id", "unknown"), exc)
            return False
