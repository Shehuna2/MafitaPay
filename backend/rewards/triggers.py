from rewards.models import BonusType, Reward, RewardHistory
from rewards.engine import RewardEngine
from django.db import transaction

class RewardTriggerEngine:

    @staticmethod
    def fire(event: str, user, **kwargs):
        """
        Unified entrypoint for reward events.
        event = registration | deposit | transaction | referral_complete
        """

        bonus_types = BonusType.objects.filter(is_active=True)

        for bonus in bonus_types:
            rules = bonus.default_rules or {}

            # Skip bonus that doesn't match this event
            if rules.get("award_trigger") not in [event, "manual_or_campaign"]:
                continue

            RewardTriggerEngine.evaluate_and_award(bonus, user, rules, **kwargs)

    @staticmethod
    def evaluate_and_award(bonus, user, rules, **kwargs):
        """
        Applies rules to determine if a bonus should be credited.
        """

        # 1. Prevent duplicates
        if Reward.objects.filter(user=user, bonus_type=bonus).exists():
            return

        # 2. Special cases based on event
        event = rules.get("award_trigger")

        if event == "referee_deposit_and_tx":
            if not kwargs.get("referral_completed", False):
                return

        if event == "deposit_made":
            amount = kwargs.get("amount")
            if not amount or amount < rules.get("min_deposit", 0):
                return

        if event == "transaction_category_match":
            category = kwargs.get("category")
            if category not in rules.get("apply_to_categories", []):
                return

        # 3. Compute final award amount
        amount = bonus.default_amount

        # Percentage-type bonuses
        if "percentage" in rules:
            base_amount = kwargs.get("amount", 0)
            amount = (base_amount * rules["percentage"]) / 100

            # Apply max cap
            max_bonus = rules.get("max_bonus")
            if max_bonus:
                amount = min(amount, max_bonus)

        if not amount or amount <= 0:
            return

        # 4. Award safely
        with transaction.atomic():
            RewardEngine.credit(
                user=user,
                bonus_type=bonus,
                amount=amount,
                rules=rules
            )
