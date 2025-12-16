# rewards/triggers.py
import logging
from decimal import Decimal

from django.db import transaction

from .models import BonusType
from .engine import RewardEngine

logger = logging.getLogger(__name__)


class RewardTriggerEngine:
    """
    Central trigger dispatcher. Called by signals when important events happen.
    - event: string name of the event (e.g. "registration", "deposit_made", "transaction_category_match", "referee_deposit_and_tx")
    - user: the primary user object (for referral events this may be the referrer)
    - kwargs: extra context (amount, category, referee, deposit_id, tx_id)
    """

    @staticmethod
    def fire(event: str, user, **kwargs):
        """
        Find matching BonusTypes and evaluate awarding rules.
        This function is intentionally permissive in matching to support admin-entered JSON rules
        or legacy fields.
        """
        try:
            # SPECIAL CASE: referral awarding delegates to ReferralService
            # check_referral_completion in signals fires RewardTriggerEngine.fire("referee_deposit_and_tx", referrer, referee=user)
            if event == "referee_deposit_and_tx":
                try:
                    # local import to avoid cycles
                    from .referral import ReferralService
                    # Prefer explicit referee kwarg if provided
                    referee = kwargs.get("referee")
                    if referee:
                        ReferralService.award_if_eligible(referee)
                    else:
                        # fallback: if caller passed the referee as `user`
                        ReferralService.award_if_eligible(user)
                except Exception:
                    logger.exception("Error running ReferralService for event referee_deposit_and_tx user=%s", getattr(user, "id", None))
                # Short-circuit the generic bonus-type loop for this event
                return

            # Load all active bonus types (small set; admin controls them)
            bts = BonusType.objects.filter(is_active=True)

            for bt in bts:
                rules = bt.default_rules or {}

                # 1) Direct 'award_trigger' in default_rules (explicit trigger)
                award_trigger = rules.get("award_trigger")
                if award_trigger:
                    # allow string or list
                    if isinstance(award_trigger, list):
                        if event not in award_trigger:
                            continue
                    else:
                        if award_trigger != event:
                            continue
                else:
                    # 2) Event-specific convenience keys (backwards compatibility)
                    if event == "registration":
                        # admin may use give_on_registration for welcome bonuses
                        if not rules.get("give_on_registration", False) and bt.name != "welcome":
                            # skip unless explicitly marked or it's the named 'welcome' type
                            continue
                    elif event == "deposit_made":
                        # check if this bonus is deposit-based or explicitly configured
                        if not rules.get("award_trigger") and bt.name not in ("deposit",):
                            # if admin didn't indicate deposit trigger and it's not deposit-type, skip
                            # allow rules that include "auto_award_on_deposit": true
                            if not rules.get("auto_award_on_deposit", False):
                                continue
                    elif event == "transaction_category_match":
                        if not rules.get("award_trigger") and bt.name not in ("cashback", "promo"):
                            # allow cashback/promo by default for tx events if admin didn't set explicit trigger
                            # otherwise skip
                            continue
                    # other events will fall through and may match by name rule below

                # 3) Fallback: if the bonus is the canonical welcome and event is registration, allow it
                if event == "registration" and bt.name == "welcome":
                    pass  # already allowed above; kept as explicit fallback

                # At this point we think bt matches event — perform simple evaluation:
                RewardTriggerEngine._evaluate_and_award(bt, user, event, rules, **kwargs)

        except Exception as exc:
            logger.exception("RewardTriggerEngine.fire error event=%s user=%s error=%s", event, getattr(user, "id", None), exc)

    @staticmethod
    def _evaluate_and_award(bonus_type, user, event, rules, **kwargs):
        """
        Minimal evaluation before calling RewardEngine.credit.
        Keep heavy logic in RewardEngine.credit (idempotency & actual creation).
        """
        try:
            # Quick guard: do not award welcome twice (or any bonus twice) if identical signature exists.
            # Build a context for signature (used by RewardEngine)
            # (existing implementation continues here — keep as before)
            context = kwargs.copy() if kwargs else {}
            # Include event in context so signature differs across events
            context["event"] = event

            # Determine amount to credit. Admin may set override in rules (e.g. "amount")
            amount = rules.get("amount") if isinstance(rules, dict) else None
            if amount is None:
                amount = getattr(bonus_type, "default_amount", None)

            # Call RewardEngine.credit which handles idempotency and creation
            RewardEngine.credit(
                user,
                bonus_type=bonus_type,
                amount=amount,
                metadata=rules.get("metadata") if isinstance(rules, dict) else {},
                referee=kwargs.get("referee"),
                rules=rules,
                event=event,
                context=context,
            )
        except Exception:
            logger.exception("Error in _evaluate_and_award for bonus_type=%s user=%s", getattr(bonus_type, "id", None), getattr(user, "id", None))