# accounts/utils.py
import traceback
import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from p2p.models import Wallet

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Standardize error responses while logging unexpected exceptions.
    Always return {"errors": {field: [messages]}} or {"errors": {"general": ["message"]}}.
    """
    response = exception_handler(exc, context)

    if response is None:
        # 🔥 Log full traceback for debugging
        view = context.get("view", None)
        view_name = view.__class__.__name__ if view else "UnknownView"

        logger.error(f"Unhandled exception in {view_name}: {exc}", exc_info=True)

        error_data = {"errors": {"general": ["Something went wrong. Please try again."]}}

        # ✅ In DEBUG mode, include traceback for deep inspection
        if settings.DEBUG:
            error_data["traceback"] = traceback.format_exc()
            error_data["view"] = view_name
            error_data["exception"] = str(exc)

        return Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ✅ Normalize DRF-style field errors
    errors = {}
    if isinstance(response.data, dict):
        for field, value in response.data.items():
            if isinstance(value, (list, tuple)):
                errors[field] = [str(v) for v in value]
            else:
                errors[field] = [str(value)]

    return Response({"errors": errors}, status=response.status_code)


def get_user_wallet(user):
    """
    Returns the wallet for a given user, creating one if it doesn't exist.
    """
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet