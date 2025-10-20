# accounts/backends.py
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model

User = get_user_model()


class EmailBackend(ModelBackend):
    """Authenticate using email instead of username."""

    def authenticate(self, request, email=None, password=None, **kwargs):
        from django.conf import settings
        import logging
        logger = logging.getLogger(__name__)
        logger.debug(f"EmailBackend.authenticate() called with email={email}")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.debug(f"No user found with email={email}")
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            logger.debug(f"Auth success for {email}")
            return user

        logger.debug(f"Password check failed for {email}")
        return None

