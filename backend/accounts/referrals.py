# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from django.conf import settings
# from wallet.models import WalletTransaction
# from decimal import Decimal
# from .models import User

# @receiver(post_save, sender=User)
# def handle_referral_bonus(sender, instance, created, **kwargs):
#     """Award referral bonuses when a new user signs up with a referrer."""
#     if not created or not instance.referred_by:
#         return

#     referrer = instance.referred_by
#     try:
#         referrer_wallet = referrer.wallet
#         new_user_wallet = instance.wallet

#         referrer_bonus = Decimal("200.00")
#         new_user_bonus = Decimal("100.00")

#         # Referrer bonus
#         referrer_wallet.balance += referrer_bonus
#         referrer_wallet.save()
#         WalletTransaction.objects.create(
#             user=referrer,
#             wallet=referrer_wallet,
#             tx_type="credit",
#             category="referral",
#             amount=referrer_bonus,
#             reference=f"Referral bonus for inviting {instance.email}",
#             status="success",
#         )

#         # New user bonus
#         new_user_wallet.balance += new_user_bonus
#         new_user_wallet.save()
#         WalletTransaction.objects.create(
#             user=instance,
#             wallet=new_user_wallet,
#             tx_type="credit",
#             category="referral",
#             amount=new_user_bonus,
#             reference="Signup bonus via referral",
#             status="success",
#         )
#     except Exception as e:
#         print(f"[Referral Bonus Error] {e}")
