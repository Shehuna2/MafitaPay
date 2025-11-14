# wallet/services/flutterwave_service.py
import os
import re 
import requests
import logging
import uuid
from django.conf import settings
from decimal import Decimal

logger = logging.getLogger(__name__)

 # Add at top if not already
ref_hex = uuid.uuid4().hex[:10]
reference = re.sub(r'[^a-zA-Z0-9]', '', f"va{ref_hex}")



class FlutterwaveService:
    def __init__(self, use_live=False):
        if use_live:
            # LIVE MODE
            self.client_id = getattr(settings, "FLW_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_CLIENT_SECRET", None)
            self.hash_secret = getattr(settings, "FLW_HASH_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_ENCRYPTION_KEY", None)
            base = getattr(settings, "FLW_BASE_URL", "https://api.flutterwave.com")
        else:
            # SANDBOX MODE
            self.client_id = getattr(settings, "FLW_TEST_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_TEST_CLIENT_SECRET", None)
            self.hash_secret = getattr(settings, "FLW_TEST_HASH_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_TEST_ENCRYPTION_KEY", None)
            base = getattr(settings, "FLW_TEST_BASE_URL", "https://api.flutterwave.com")

        # Safe handling — never crash
        if not self.client_id or not self.client_secret:
            raise ValueError("Flutterwave credentials missing in environment")

        self.base_url = str(base or "https://api.flutterwave.com").strip().rstrip("/")
        logger.info(f"FlutterwaveService initialized: {'LIVE' if use_live else 'SANDBOX'} mode → {self.base_url}")

        self.access_token = None
        self.token_expiry = None

        logger.info(
            f"FlutterwaveService initialized for {self.api_version} "
            f"(base_url={self.base_url})"
        )

    # --------------------------------------------------------------------------
    # TOKEN MANAGEMENT
    # --------------------------------------------------------------------------
    def get_access_token(self):
        """Obtain OAuth2 token for v4 authentication"""
        try:
            url = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token"
            headers = {"Content-Type": "application/x-www-form-urlencoded"}
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "client_credentials",
            }

            resp = requests.post(url, headers=headers, data=data, timeout=30)
            resp.raise_for_status()
            token_data = resp.json()
            self.access_token = token_data["access_token"]
            logger.info("✅ Obtained new Flutterwave access token (expires in 600s)")
            return self.access_token
        except Exception as e:
            logger.error(f"❌ Failed to get Flutterwave access token: {e}", exc_info=True)
            return None

    def create_or_get_customer(self, user):
        try:
            url = f"{self.base_url}/customers"
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }

            payload = {
                "email": user.email,
                "firstname": user.first_name or "User",
                "lastname": user.last_name or "Account",
                "phonenumber": getattr(getattr(user, "profile", None), "phone_number", "+2340000000000"),
            }

            logger.info(f"Ensuring customer for {user.email}")
            resp = requests.post(url, json=payload, headers=headers, timeout=40)

            if resp.status_code not in (200, 201, 409):
                logger.error(f"Customer error {resp.status_code}: {resp.text}")
                return None

            data = resp.json()

            # On 409, try to fetch customer by email via search
            if resp.status_code == 409:
                logger.info("Customer exists (409), searching by email...")
                search_url = f"{self.base_url}/customers"
                search_resp = requests.get(search_url, params={"email": user.email}, headers=headers, timeout=30)
                if search_resp.status_code == 200:
                    customers = search_resp.json().get("data", [])
                    if customers:
                        customer_id = customers[0]["id"]
                        logger.info(f"Found existing customer {customer_id} via search")
                        return customer_id
                logger.error("Failed to find customer after 409")
                return None

            # On 200/201, extract ID
            customer_id = data.get("data", {}).get("id")
            if not customer_id:
                logger.error(f"Customer ID missing: {data}")
                return None

            logger.info(f"Customer {customer_id} for {user.email} ({'created' if resp.status_code == 201 else 'found'})")
            return customer_id

        except Exception as e:
            logger.error(f"Customer error: {e}", exc_info=True)
            return None


    def create_virtual_account(self, user, bank="WEMA_BANK", bvn_or_nin=None):
        """Create VA: static if BVN/NIN provided, else dynamic."""
        try:
            if not self.access_token:
                self.get_access_token()
            if not self.access_token:
                return None

            customer_id = self.create_or_get_customer(user)
            if not customer_id:
                return None

            url = f"{self.base_url}/virtual-accounts"
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }

            ref_hex = uuid.uuid4().hex[:10]
            reference = re.sub(r'[^a-zA-Z0-9]', '', f"va{ref_hex}")
            clean_bank = bank.upper().replace("-", "_")

            # Determine type and amount
            is_static = bool(bvn_or_nin)
            account_type = "static" if is_static else "dynamic"
            amount = 1 if not is_static else 0  # Dynamic needs min 1; static can be 0/unlimited

            payload = {
                "customer_id": customer_id,
                "email": user.email,
                "reference": reference,
                "currency": "NGN",
                "amount": amount,
                "account_type": account_type,
                "firstname": user.first_name or "User",
                "lastname": user.last_name or "Account",
                "phonenumber": getattr(getattr(user, "profile", None), "phone_number", "+2340000000000"),
                "narration": f"{user.id}-wallet-funding",
                "preferred_bank": clean_bank,
            }

            if is_static:
                # Add BVN or NIN
                if bvn_or_nin and len(bvn_or_nin) >= 11:  # Basic format check
                    payload["bvn"] = bvn_or_nin if bvn_or_nin.isdigit() and len(bvn_or_nin) == 11 else None
                    payload["nin"] = bvn_or_nin if "NIN" in bvn_or_nin.upper() else None
                else:
                    logger.error("Invalid BVN/NIN format for static VA")
                    return None

            logger.info(f"Creating {'static' if is_static else 'dynamic'} VA for {user.email} ({clean_bank}) with customer {customer_id}")
            resp = requests.post(url, json=payload, headers=headers, timeout=40)

            if resp.status_code not in (200, 201):  # ← ACCEPT 201 FOR CREATED
                logger.debug(f"Flutterwave VA response {resp.status_code}: {resp.text}")
                return None

            data = resp.json()
            if data.get("status") != "success":
                logger.error(f"❌ Flutterwave VA creation failed: {data}")
                return None

            va_data = data["data"]
            logger.info(f"✅ {'Static' if is_static else 'Dynamic'} VA created for {user.email}: {va_data}")

            return {
                "provider": "flutterwave",
                "account_number": va_data.get("account_number"),
                "bank_name": va_data.get("bank_name"),
                "account_name": va_data.get("account_name"),
                "reference": va_data.get("reference"),
                "type": account_type,  # For frontend/logging
                "raw_response": data,
                "customer_id": customer_id,
            }

        except Exception as e:
            logger.error(f"❌ Error creating Flutterwave VA: {e}", exc_info=True)
            return None

# Example usage:
# flutterwave_service = FlutterwaveService()
# va_info = flutterwave_service.create_virtual_account(user_instance, bank="wema-bank") 