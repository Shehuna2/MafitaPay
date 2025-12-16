from django.dispatch import receiver
from django.db.models.signals import post_save
from django.conf import settings
import logging
from accounts.models import User
from wallet.models import Deposit, WalletTransaction
from rewards.triggers import RewardTriggerEngine
from rewards.unlockers import try_unlock_welcome_bonus


logger = logging.getLogger(__name__)


logger.warning("🔥 rewards.signals LOADED 🔥")

@receiver(post_save, sender=User)
def reward_on_registration(sender, instance, created, **kwargs):
    """
    Create any bonuses that should be created at registration (e.g. welcome locked bonus template).
    NOTE: actual unlocking/credit happens via deposit/transaction triggers.
    """
    if created:
        try:
            RewardTriggerEngine.fire("registration", instance)
        except Exception:
            logger.exception("Error firing registration reward trigger for user %s", instance.id)


@receiver(post_save, sender=Deposit)
def reward_on_deposit(sender, instance, created, **kwargs):
    """
    Fire deposit-related reward triggers.
    We check for Deposit.status == "credited".
    """
    try:
        # Only act on successful credit events
        if instance.status == "credited":
            RewardTriggerEngine.fire("deposit_made", instance.user, amount=instance.amount)

            # Welcome bonus unlock check
            try_unlock_welcome_bonus(instance.user)
            
            # Also check referral completion (deposit could complete referral condition)
            try:
                from rewards.signals import check_referral_completion  # local import to avoid cycles
            except Exception:
                # fallback if same module
                check_referral_completion = globals().get("check_referral_completion")
            if callable(check_referral_completion):
                check_referral_completion(instance.user)
            

    except Exception:
        logger.exception("Error handling deposit reward signal for deposit %s", getattr(instance, "id", None))


@receiver(post_save, sender=WalletTransaction)
def reward_on_wallet_transaction(sender, instance, created, **kwargs):
    """
    Fire transaction-based reward triggers.

    NOTE: we trigger on transactions that are in status == 'success' (whether newly created or updated).
    Previously the handler returned early when not created which missed pending->success transitions.
    """
    try:
        # Only proceed when the transaction is successful.
        if instance.status != "success":
            return

        # Fire generic transaction category triggers (cashback, promo, etc.)
        RewardTriggerEngine.fire(
            "transaction_category_match",
            instance.user,
            category=instance.category,
            amount=instance.amount,
            tx=instance
        )

        # After any wallet transaction, the referee may have satisfied their referral condition.
        try:
            check_referral_completion = globals().get("check_referral_completion")
            if callable(check_referral_completion):
                check_referral_completion(instance.user)
        except Exception:
            logger.exception("Error checking referral completion for user %s", instance.user_id)

        # Welcome bonus unlock check
        try_unlock_welcome_bonus(instance.user)

    except Exception:
        logger.exception("Error handling wallet transaction reward signal for tx %s", getattr(instance, "id", None))


def check_referral_completion(user):
    """
    Check if a referred user has now met the deposit + transaction criteria.
    If yes, fire the referral award for their referrer.
    """
    try:
        if not getattr(user, "referred_by", None):
            return

        # Check for at least one successful deposit
        has_deposit = WalletTransaction.objects.filter(
            user=user, status="success", category="deposit"
        ).exists()
        if not has_deposit:
            return

        # Check for at least one successful non-deposit wallet transaction
        has_tx = WalletTransaction.objects.filter(user=user)\
            .exclude(category="deposit")\
            .filter(status="success")\
            .exists()
        if not has_tx:
            return

        # ✅ All conditions met → fire referral reward
        RewardTriggerEngine.fire(
            "referral_completed",
            user.referred_by,
            referee=user,
        )

    except Exception:
        logger.exception(
            "Error checking referral completion for user %s",
            getattr(user, "id", None)
        )

