# wallet/services/flutterwave_service.py

import logging
import uuid
import re
import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FlutterwaveService:
    def __init__(self, use_live=False):
        """
        Initialize Flutterwave v4 service.
        use_live=True  → LIVE mode (uses FLW_LIVE_* keys)
        use_live=False → SANDBOX mode (default)
        """
        if use_live:
            # LIVE MODE
            self.client_id = getattr(settings, "FLW_LIVE_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_LIVE_CLIENT_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_LIVE_ENCRYPTION_KEY", None)
            self.hash_secret = getattr(settings, "FLW_HASH_SECRET", None)  # Webhook secret
            base_url = getattr(settings, "FLW_LIVE_BASE_URL", "https://api.flutterwave.com")
        else:
            # SANDBOX MODE
            self.client_id = getattr(settings, "FLW_TEST_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_TEST_CLIENT_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_TEST_ENCRYPTION_KEY", None)
            self.hash_secret = getattr(settings, "FLW_TEST_HASH_SECRET", None)
            base_url = getattr(settings, "FLW_TEST_BASE_URL", "https://api.flutterwave.com")

        # Critical validation
        if not self.client_id or not self.client_secret:
            raise ImproperlyConfigured(
                "Flutterwave credentials missing. Check FLW_* environment variables."
            )

        # Safe base URL
        self.base_url = str(base_url).strip().rstrip("/")
        logger.info(
            f"FlutterwaveService initialized → {'LIVE' if use_live else 'SANDBOX'} mode → {self.base_url}"
        )

        self.access_token = None
        self.token_expiry = None

    # --------------------------------------------------------------------------
    # TOKEN MANAGEMENT
    # --------------------------------------------------------------------------
    def get_access_token(self):
        """Fetch OAuth2 token (cached until expiry)"""
        if self.access_token:
            return self.access_token

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
            logger.info("Obtained new Flutterwave v4 access token")
            return self.access_token

        except Exception as e:
            logger.error(f"Failed to get Flutterwave access token: {e}", exc_info=True)
            return None

    # --------------------------------------------------------------------------
    # CUSTOMER MANAGEMENT
    # --------------------------------------------------------------------------
    def create_or_get_customer(self, user):
        try:
            token = self.get_access_token()
            if not token:
                return None

            # ← FIXED: Always use /v4/customers (works in both sandbox & live)
            url = f"{self.base_url}/v4/customers"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }

            profile = getattr(user, "profile", None)
            first_name = (profile.first_name.strip() if profile and profile.first_name else user.email.split("@")[0])[:50]
            last_name = (profile.last_name.strip() if profile and profile.last_name else "User")[:50]
            phone = getattr(profile, "phone_number", "+2340000000000") or "+2340000000000"

            payload = {
                "email": user.email,
                "firstname": first_name,
                "lastname": last_name,
                "phonenumber": phone,
            }

            resp = requests.post(url, json=payload, headers=headers, timeout=40)

            if resp.status_code == 409:
                logger.info("Customer exists, searching...")
                search_resp = requests.get(url, params={"email": user.email}, headers=headers, timeout=30)
                if search_resp.ok and search_resp.json().get("data"):
                    cid = search_resp.json()["data"][0]["id"]
                    logger.info(f"Found existing customer: {cid}")
                    return cid

            if resp.status_code not in (200, 201):
                logger.error(f"Customer creation failed: {resp.status_code} {resp.text}")
                return None

            customer_id = resp.json().get("data", {}).get("id")
            if not customer_id:
                logger.error(f"Customer ID missing: {resp.json()}")
                return None

            logger.info(f"Customer created/found: {customer_id}")
            return customer_id

        except Exception as e:
            logger.error(f"Customer error: {e}", exc_info=True)
            return None

    # --------------------------------------------------------------------------
    # VIRTUAL ACCOUNT CREATION
    # --------------------------------------------------------------------------
    def create_virtual_account(self, user, bank="WEMA_BANK", bvn_or_nin=None):
        try:
            token = self.get_access_token()
            if not token:
                return None

            customer_id = self.create_or_get_customer(user)
            if not customer_id:
                return None

            # ← FIXED: Always use /v4/virtual-accounts
            url = f"{self.base_url}/v4/virtual-accounts"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            }

            reference = f"va{uuid.uuid4().hex[:12]}"
            clean_bank = bank.upper().replace("-", "_")

            is_static = bool(bvn_or_nin and len(str(bvn_or_nin).strip()) >= 11)
            account_type = "static" if is_static else "dynamic"
            amount = 0 if is_static else 1

            payload = {
                "customer_id": customer_id,
                "email": user.email,
                "reference": reference,
                "currency": "NGN",
                "amount": amount,
                "account_type": account_type,
                "narration": f"{user.id}-wallet-funding",
                "preferred_bank": clean_bank,
            }

            if is_static:
                clean_id = re.sub(r"\D", "", str(bvn_or_nin))
                if len(clean_id) == 11:
                    payload["bvn"] = clean_id
                else:
                    payload["nin"] = clean_id

            logger.info(f"Creating {account_type.upper()} VA → {clean_bank}")
            resp = requests.post(url, json=payload, headers=headers, timeout=60)

            if resp.status_code not in (200, 201):
                logger.error(f"VA failed {resp.status_code}: {resp.text}")
                return None

            data = resp.json()
            if data.get("status") != "success":
                logger.error(f"VA failed: {data}")
                return None

            va_data = data["data"]
            logger.info(f"VA created: {va_data.get('account_number')}")

            return {
                "provider": "flutterwave",
                "account_number": va_data.get("account_number"),
                "bank_name": va_data.get("bank_name"),
                "account_name": va_data.get("account_name"),
                "reference": va_data.get("reference"),
                "type": account_type,
                "raw_response": data,
                "customer_id": customer_id,
            }

        except Exception as e:
            logger.error(f"Error creating VA: {e}", exc_info=True)
            return None