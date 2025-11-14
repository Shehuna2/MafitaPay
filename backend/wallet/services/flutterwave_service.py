# File: wallet/services/flutterwave_service.py
import logging
import uuid
import re
import time
import base64
import requests
import hmac
import hashlib
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FlutterwaveService:
    """
    Flutterwave v4 helper:
      - OAuth token caching
      - create_or_get_customer(user, bvn_or_nin)
      - create_virtual_account(user, bank, bvn_or_nin)
      - verify_webhook_signature(raw_body, signature)
    """

    def __init__(self, use_live=False):
        if use_live:
            self.client_id = getattr(settings, "FLW_LIVE_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_LIVE_CLIENT_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_LIVE_ENCRYPTION_KEY", None)
            self.hash_secret = getattr(settings, "FLW_LIVE_HASH_SECRET", None)
            base_url = getattr(settings, "FLW_LIVE_BASE_URL", "https://f4bexperience.flutterwave.com")
        else:
            self.client_id = getattr(settings, "FLW_TEST_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_TEST_CLIENT_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_TEST_ENCRYPTION_KEY", None)
            self.hash_secret = getattr(settings, "FLW_TEST_HASH_SECRET", None)
            base_url = getattr(settings, "FLW_TEST_BASE_URL", "https://developersandbox-api.flutterwave.com")

        if not self.client_id or not self.client_secret:
            raise ImproperlyConfigured("Flutterwave credentials missing. Check FLW_* env vars.")

        self.base_url = str(base_url).strip().rstrip("/")
        logger.info("FlutterwaveService initialized → %s → %s", "LIVE" if use_live else "SANDBOX", self.base_url)

        self.access_token = None
        self.token_expiry_ts = 0

    def _token_expired(self):
        return not self.access_token or time.time() > (self.token_expiry_ts - 10)

    def get_access_token(self):
        """Fetch OAuth2 token and cache until expiry."""
        if not self._token_expired():
            return self.access_token

        url = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }

        try:
            resp = requests.post(url, headers=headers, data=data, timeout=30)
            resp.raise_for_status()
            token_data = resp.json()
            token = token_data.get("access_token")
            expires_in = int(token_data.get("expires_in", 3600))
            if not token:
                logger.error("No access_token in token response")
                return None
            self.access_token = token
            self.token_expiry_ts = time.time() + expires_in
            logger.info("Obtained new Flutterwave v4 access token (cached)")
            return self.access_token
        except Exception as e:
            logger.error("Failed to fetch Flutterwave access token: %s", e, exc_info=True)
            self.access_token = None
            self.token_expiry_ts = 0
            return None

    # ---------------------------
    # Customer helpers
    # ---------------------------
    def _get_profile(self, user):
        return getattr(user, "profile", None)

    def create_or_get_customer(self, user, bvn_or_nin=None):
        """
        Ensure a Flutterwave v4 customer exists for this user.
        If a customer_id is stored on user.profile.flutterwave_customer_id, return it.
        Otherwise, create via POST /v4/customers and persist id back to profile when possible.
        Returns customer_id or None.
        """
        profile = self._get_profile(user)
        existing = None
        if profile:
            existing = getattr(profile, "flutterwave_customer_id", None)
            if existing:
                return existing

        token = self.get_access_token()
        if not token:
            logger.error("Cannot create/get customer: missing access token")
            return None

        endpoint = f"{self.base_url}/customers"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        first_name = (profile.first_name.strip() if profile and getattr(profile, "first_name", None) else user.email.split("@")[0])[:50]
        last_name = (profile.last_name.strip() if profile and getattr(profile, "last_name", None) else "User")[:50]
        phone = getattr(profile, "phone_number", None) or "+2340000000000"

        payload = {
            "first_name": first_name,
            "last_name": last_name,
            "email": user.email,
            "phone_number": phone,
        }

        if bvn_or_nin:
            clean_id = re.sub(r"\D", "", str(bvn_or_nin))
            payload["bvn"] = clean_id

        try:
            logger.debug("Creating customer payload: %s", payload)
            resp = requests.post(endpoint, json=payload, headers=headers, timeout=30)
            # Accept 200 or 201
            if resp.status_code not in (200, 201):
                logger.error("Customer creation HTTP %s: %s", resp.status_code, resp.text)
                # If customer exists or returned 409/400 with useful info, try to parse id, but bail for now.
                return None

            data = resp.json()
            # v4 typically returns data.id
            cust = data.get("data") or data
            customer_id = cust.get("id") or cust.get("customer_id") or cust.get("customer", {}).get("id")
            if not customer_id:
                logger.error("Customer creation returned no id: %s", data)
                return None

            # persist to profile if possible
            try:
                if profile:
                    setattr(profile, "flutterwave_customer_id", customer_id)
                    profile.save(update_fields=["flutterwave_customer_id"])
            except Exception:
                # non-fatal if profile can't be saved
                logger.exception("Failed to persist flutterwave_customer_id to profile")

            logger.info("Created Flutterwave customer %s for %s", customer_id, user.email)
            return customer_id
        except Exception as e:
            logger.error("Error creating Flutterwave customer: %s", e, exc_info=True)
            return None

    # ---------------------------
    # Virtual account (v4)
    # ---------------------------
    def create_virtual_account(self, user, bank="WEMA_BANK", bvn_or_nin=None):
        """
        v4 flow:
          1) ensure customer exists -> customer_id
          2) POST /v4/virtual-accounts with customer_id, account_type, reference
        Returns dict with keys:
          provider, account_number, bank_name, account_name, reference, type, raw_response, customer_id
        Or None on failure.
        """
        token = self.get_access_token()
        if not token:
            logger.error("Cannot create VA: missing access token")
            return None

        # ensure customer exists (prefer persisted id)
        customer_id = None
        try:
            customer_id = self.create_or_get_customer(user, bvn_or_nin=bvn_or_nin)
        except Exception:
            # already logged inside create_or_get_customer
            customer_id = None

        if not customer_id:
            logger.error("No Flutterwave customer_id available; aborting VA creation")
            return None

        # v4 virtual accounts endpoint
        endpoint = f"{self.base_url}/virtual-accounts"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # choose account_type: static if bvn_or_nin provided, else dynamic
        account_type = "static" if (bvn_or_nin and str(bvn_or_nin).strip()) else "dynamic"
        reference = f"va{uuid.uuid4().hex[:12]}"
        clean_bank = str(bank or "").upper().replace("-", "_")

        payload = {
            "customer_id": customer_id,
            "account_type": account_type,
            "reference": reference,
            # metadata for your internal use (safe to include)
            "metadata": {
                "preferred_bank": clean_bank or None,
                "narration": f"{user.id}-wallet-funding",
            },
        }

        # v4 sometimes supports is_permanent or other flags; include only metadata for safety
        if account_type == "static":
            clean_id = re.sub(r"\D", "", str(bvn_or_nin or ""))
            payload["metadata"]["id_provided"] = clean_id

        try:
            logger.debug("Creating v4 VA payload: %s", payload)
            resp = requests.post(endpoint, json=payload, headers=headers, timeout=60)
            if resp.status_code not in (200, 201):
                logger.error("VA creation HTTP %s: %s", resp.status_code, resp.text)
                return None

            data = resp.json()
            va_data = data.get("data") or data

            # normalize common fields (be defensive)
            account_number = va_data.get("account_number") or va_data.get("acct_number") or va_data.get("account_no") or va_data.get("account")
            bank_name = va_data.get("bank_name") or va_data.get("bank") or va_data.get("bank_name")
            account_name = va_data.get("account_name") or va_data.get("recipient_name") or va_data.get("account_name")
            provider_ref = va_data.get("reference") or va_data.get("tx_ref") or va_data.get("order_ref") or reference
            returned_customer_id = va_data.get("customer_id") or va_data.get("customer", {}).get("id") or customer_id

            if not account_number:
                logger.error("VA created but missing account_number: %s", data)
                return None

            logger.info("%s VA created: %s (customer=%s)", account_type.capitalize(), account_number, returned_customer_id)

            return {
                "provider": "flutterwave",
                "account_number": account_number,
                "bank_name": bank_name,
                "account_name": account_name,
                "reference": provider_ref,
                "type": account_type,
                "raw_response": data,
                "customer_id": returned_customer_id,
            }
        except Exception as e:
            logger.error("Error creating virtual account: %s", e, exc_info=True)
            return None

    # ---------------------------
    # Webhook verification
    # ---------------------------
    def verify_webhook_signature(self, raw_body: bytes, incoming_signature: str) -> bool:
        """
        Compute HMAC-SHA256 and compare base64 digest per Flutterwave docs.
        """
        if not self.hash_secret:
            logger.warning("No Flutterwave hash secret configured; refusing to verify webhook.")
            return False
        try:
            dig = hmac.new(self.hash_secret.encode(), raw_body, hashlib.sha256).digest()
            expected_b64 = base64.b64encode(dig).decode()
            return hmac.compare_digest(expected_b64, incoming_signature)
        except Exception:
            logger.exception("Failed while verifying Flutterwave webhook signature")
            return False
