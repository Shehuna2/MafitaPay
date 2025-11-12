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

    def create_virtual_account(self, user, bank: str = "wema-bank"):
        """
        Create a static Flutterwave virtual account (DVA) for the user.

        Args:
            user: Django user instance.
            bank (str): 'wema-bank' or 'sterling-bank'. Defaults to 'wema-bank'.

        Returns:
            dict: Standardized virtual account data if successful, None otherwise.
        """
        try:
            profile = getattr(user, "profile", None)

            # Validate bank choice
            valid_banks = ["wema-bank", "sterling-bank"]
            if bank not in valid_banks:
                logger.warning(f"Invalid Flutterwave bank '{bank}', defaulting to 'wema-bank'")
                bank = "wema-bank"

            payload = {
                "email": user.email,
                "bvn": getattr(profile, "bvn", "12345678901"),
                "phonenumber": getattr(profile, "phone_number", "+2340000000000"),
                "firstname": user.first_name or "User",
                "lastname": user.last_name or "Account",
                "is_permanent": True,
                "narration": f"{user.id}-wallet-funding",
                "bank": bank,
            }

            logger.info(f"Creating Flutterwave VA for {user.email} via {bank}")
            resp = requests.post(
                f"{self.BASE_URL}/virtual-account-numbers",
                json=payload,
                headers=self.headers,
                timeout=30,
            )

            result = resp.json()
            if result.get("status") != "success":
                logger.error(f"Flutterwave VA creation failed: {result}")
                return None

            data = result.get("data", {})

            # --- ✅ Normalize field names ---
            return {
                "provider": "flutterwave",
                "account_number": data.get("account_number"),
                "bank_name": data.get("bank_name"),
                "account_name": (
                    data.get("account_name")
                    or f"{user.first_name or ''} {user.last_name or ''}".strip()
                    or user.email
                ),
                "order_ref": data.get("order_ref"),
                "raw_response": data,
            }

        except Exception as e:
            logger.error(f"❌ Flutterwave VA creation error for {user.email}: {e}", exc_info=True)
            return None
    