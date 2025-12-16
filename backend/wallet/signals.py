from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import WalletTransaction, Notification

@receiver(post_save, sender=WalletTransaction)
def create_transaction_notification(sender, instance, created, **kwargs):
    """Create notification for any wallet transaction"""
    if created:
        msg_map = {
            "deposit": f"Deposit of ₦{instance.amount} was successful",
            "withdrawal": f"Withdrawal of ₦{instance.amount} completed",
            "airtime": f"Airtime purchase of ₦{instance.amount} processed",
            "data": f"Data purchase of ₦{instance.amount} successful",
            "crypto": f"Crypto transaction of ₦{instance.amount} done",
            "reward": f"Reward of ₦{instance.amount} granted",
            "bonus": f"Bonus of ₦{instance.amount} credited",
            
        }
        message = msg_map.get(instance.category, f"{instance.category.title()} transaction recorded")
        Notification.objects.create(user=instance.user, message=message, transaction=instance)
