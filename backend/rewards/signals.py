# rewards/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from django.utils import timezone
from .referral import ReferralService
from .models import Bonus, BonusType
from .services import BonusService
from wallet.models import WalletTransaction
from django.contrib.auth import get_user_model

User = get_user_model()

# 1) Create a locked welcome bonus when user is created (only if a welcome BonusType exists & active)
@receiver(post_save, sender=User)
def create_welcome_bonus_on_signup(sender, instance, created, **kwargs):
    if not created:
        return
    try:
        bt = BonusType.objects.filter(name="welcome", is_active=True).first()
        if not bt:
            return
        # Create locked bonus using admin-defined default_amount; admin can override later
        BonusService.create_bonus(user=instance, bonus_type=bt, amount=bt.default_amount, description="Welcome bonus (locked)", locked=True)
    except Exception as e:
        # avoid breaking user creation flow
        import logging
        logging.getLogger(__name__).exception("Failed to create welcome bonus: %s", e)


# 2) Unlock welcome bonus when user has at least one successful deposit and at least one successful non-deposit transaction
@receiver(post_save, sender=WalletTransaction)
def unlock_bonus_on_deposit_and_tx(sender, instance, created, **kwargs):
    try:
        if not created:
            return
        if instance.status != "success":
            return

        user = instance.user

        # check conditions: at least one successful deposit transaction and at least one successful non-deposit transaction
        has_deposit = WalletTransaction.objects.filter(user=user, category="deposit", status="success").exists()
        has_tx = WalletTransaction.objects.filter(user=user).exclude(category="deposit").filter(status="success").exists()

        if has_deposit and has_tx:

            # safety: prevent repeated evaluation
            instance.metadata = {**(instance.metadata or {}), "triggered_reward_check": True}
            instance.save(update_fields=["metadata"])

            # unlock locked welcome bonuses (as before)
            locked_welcome = Bonus.objects.filter(user=user, bonus_type__name="welcome", status="locked")
            for b in locked_welcome:
                BonusService.unlock_bonus(b)

            # ----- NEW: evaluate referral awarding for this user (Option B) -----
            # This will create Bonus objects (locked/unlocked according to BonusType default rules)
            ReferralService.award_if_eligible(user)

    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Error in bonus unlock signal: %s", e)
