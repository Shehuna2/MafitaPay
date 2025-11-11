# wallet/services/flutterwave_service.py
import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

class FlutterwaveService:
    BASE_URL = "https://api.flutterwave.com/v3"

    def __init__(self):
        self.headers = {
            "Authorization": f"Bearer {settings.FLW_SECRET_KEY}",
            "Content-Type": "application/json",
        }

    def create_virtual_account(self, user):
        """Create static virtual account for user."""
        try:
            profile = getattr(user, "profile", None)
            data = {
                "email": user.email,
                "bvn": getattr(profile, "bvn", "12345678901"),
                "phonenumber": getattr(profile, "phone_number", "+2340000000000"),
                "firstname": user.first_name or "User",
                "lastname": user.last_name or "Account",
                "is_permanent": True,
                "narration": f"{user.id}-wallet-funding",
            }

            resp = requests.post(
                f"{self.BASE_URL}/virtual-account-numbers", 
                json=data, headers=self.headers, timeout=30
            )
            r = resp.json()
            if not r.get("status") == "success":
                logger.error(f"Flutterwave VA error: {r}")
                return None
            return r["data"]

        except Exception as e:
            logger.error(f"Flutterwave create_virtual_account error: {str(e)}", exc_info=True)
            return None
