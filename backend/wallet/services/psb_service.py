import os
import requests
import logging
from django.conf import settings


logger = logging.getLogger(__name__)

class NinePSBService:
    """
    Handles creation of Dedicated Virtual Accounts with 9 Payment Service Bank (9PSB)
    """

    BASE_URL = os.getenv("NINE_PSB_API_BASE_URL", "https://api.9psb.com/v1")  # 🔹 check your developer docs for correct base URL

    def __init__(self):
        self.api_key = settings.NINE_PSB_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def create_virtual_account(self, user):
        try:
            profile = getattr(user, "profile", None)
            first_name = getattr(profile, "first_name", None) or user.first_name or "User"
            last_name = getattr(profile, "last_name", None) or user.last_name or "Account"
            phone_number = getattr(profile, "phone_number", None) or "08000000000"

            payload = {
                "accountName": f"{first_name} {last_name}",
                "bvn": getattr(profile, "bvn", "22222222222"),  # optional
                "email": user.email,
                "phoneNumber": phone_number,
            }

            logger.info(f"📨 Sending DVA request to 9PSB for {user.email}")
            response = requests.post(f"{self.BASE_URL}/virtual-accounts", json=payload, headers=self.headers)
            response.raise_for_status()

            data = response.json()
            logger.debug(f"📦 9PSB DVA Response: {data}")

            # Adjust based on actual API response shape
            if data.get("status") in [True, "success"]:
                dva_data = data.get("data", data)
                return {
                    "account_number": dva_data.get("accountNumber"),
                    "account_name": dva_data.get("accountName"),
                    "bank_name": dva_data.get("bankName", "9 Payment Service Bank"),
                    "provider_id": dva_data.get("id"),
                }
            else:
                logger.error(f"❌ 9PSB DVA creation failed: {data}")
                return None

        except Exception as e:
            logger.error(f"❌ 9PSB DVA error for {user.email}: {str(e)}", exc_info=True)
            return None
