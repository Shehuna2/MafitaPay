from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import DepositOrder, WithdrawOrder
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

@receiver(post_save, sender=DepositOrder)
@receiver(post_save, sender=WithdrawOrder)
def notify_order_update(sender, instance, **kwargs):
    channel_layer = get_channel_layer()
    order_type = "withdraw-order" if sender == WithdrawOrder else "deposit-order"
    async_to_sync(channel_layer.group_send)(
        f"order_{order_type}_{instance.id}",
        {
            "type": "send_order_update",
            "order_id": instance.id,
            "order_type": order_type,
        }
    )
