from django.db.models.signals import post_save
from django.dispatch import receiver
from logging import getLogger
from .models import User, UserProfile

logger = getLogger(__name__)


@receiver(post_save, sender=User)
def manage_user_profile(sender, instance, created, **kwargs):
    # Ensure a profile always exists, create only if missing
    profile, created_profile = UserProfile.objects.get_or_create(user=instance)
    if created_profile:
        logger.info(f"UserProfile created for {instance.email}")