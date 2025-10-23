from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from logging import getLogger
from .models import User, UserProfile


from wallet.models import WalletTransaction

logger = getLogger(__name__)


@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    # Ensure a profile always exists, create only if missing
    profile, created_profile = UserProfile.objects.get_or_create(user=instance)
    if created_profile:
        logger.info(f"UserProfile created for {instance.email}")


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def handle_referral_bonus(sender, instance, created, **kwargs):
    if created and instance.referred_by:
        referrer = instance.referred_by

        # Example bonuses
        referrer.wallet.deposit(200, reference="Referral Bonus")
        instance.wallet.deposit(100, reference="Signup Bonus")

        # Log transactions
        WalletTransaction.objects.create(
            user=referrer,
            wallet=referrer.wallet,
            tx_type="credit",
            category="referral",
            amount=200,
            balance_before=referrer.wallet.balance - 200,
            balance_after=referrer.wallet.balance,
            reference="Referral Bonus",
            status="success",
        )

        WalletTransaction.objects.create(
            user=instance,
            wallet=instance.wallet,
            tx_type="credit",
            category="referral",
            amount=100,
            balance_before=instance.wallet.balance - 100,
            balance_after=instance.wallet.balance,
            reference="Signup Bonus",
            status="success",
        )
        logger.info(f"Referral bonuses awarded: {referrer.email} and {instance.email}")