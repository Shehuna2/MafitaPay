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
            context = {}

            # common context data
            if kwargs.get("amount") is not None:
                try:
                    context["amount"] = str(Decimal(str(kwargs.get("amount"))))
                except Exception:
                    context["amount"] = str(kwargs.get("amount"))

            if kwargs.get("category"):
                context["category"] = kwargs.get("category")

            if kwargs.get("deposit_id"):
                context["deposit_id"] = str(kwargs.get("deposit_id"))

            if kwargs.get("tx_id"):
                context["tx_id"] = str(kwargs.get("tx_id"))

            # For registration, include user id as context
            if event == "registration":
                context["user_id"] = str(getattr(user, "id", None))

            # For referee flows, include referee id if present
            referee = kwargs.get("referee")
            if referee:
                context["referee_id"] = str(getattr(referee, "id", referee))

            # Determine the amount to award:
            amount = kwargs.get("amount")
            if amount is None or float(amount) <= 0:
                # default to bonus_type.default_amount
                try:
                    amount = Decimal(str(bonus_type.default_amount or "0.00"))
                except Exception:
                    amount = Decimal("0.00")

            # If amount is zero, skip
            try:
                amount = Decimal(str(amount))
            except Exception:
                logger.warning("RewardTriggerEngine: invalid amount for bonus_type %s: %s", bonus_type.id, amount)
                return

            if amount <= 0:
                return

            # Delegate to RewardEngine — it will handle idempotency and referee/referrer logic using rules.
            try:
                with transaction.atomic():
                    RewardEngine.credit(
                        user=user,
                        bonus_type=bonus_type,
                        amount=amount,
                        metadata={"trigger_source": "RewardTriggerEngine", "event": event},
                        referee=referee,
                        rules=rules,
                        event=event,
                        context=context,
                    )
            except Exception:
                logger.exception("Failed to credit bonus_type=%s to user=%s", getattr(bonus_type, "id", None), getattr(user, "id", None))
        except Exception:
            logger.exception("Error evaluating bonus_type=%s for user=%s", getattr(bonus_type, "id", None), getattr(user, "id", None))
