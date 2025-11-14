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
    Minimal, robust v4 helper.
    Caches OAuth token until expiry.
    """

    def __init__(self, use_live=False):
        # load credentials based on environment selection
        if use_live:
            self.client_id = getattr(settings, "FLW_LIVE_CLIENT_ID", None)
            self.client_secret = getattr(settings, "FLW_LIVE_CLIENT_SECRET", None)
            self.encryption_key = getattr(settings, "FLW_LIVE_ENCRYPTION_KEY", None)
            # LIVE hash secret env name chosen for clarity
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
        logger.info(f"FlutterwaveService initialized → {'LIVE' if use_live else 'SANDBOX'} → {self.base_url}")

        # token cache
        self.access_token = None
        self.token_expiry_ts = 0  # epoch seconds

    def _token_expired(self):
        # small safety margin (10s)
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

    def create_virtual_account(self, user, bank="WEMA_BANK", bvn_or_nin=None):
        """
        Create dynamic or static (reusable) VA.
        Returns dict on success, None on failure.
        """
        token = self.get_access_token()
        if not token:
            logger.error("Cannot create VA: missing access token")
            return None

        url = f"{self.base_url}/virtual-accounts"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        reference = f"va{uuid.uuid4().hex[:12]}"
        clean_bank = str(bank or "WEMA_BANK").upper().replace("-", "_")

        # decide static vs dynamic using explicit bvn_or_nin presence
        is_static = bool(bvn_or_nin and str(bvn_or_nin).strip())

        # Build customer block for v4: keep it minimal and safe
        profile = getattr(user, "profile", None)
        first_name = (profile.first_name.strip() if profile and getattr(profile, "first_name", None) else user.email.split("@")[0])[:50]
        last_name = (profile.last_name.strip() if profile and getattr(profile, "last_name", None) else "User")[:50]
        phone = getattr(profile, "phone_number", "+2340000000000") or "+2340000000000"

        payload = {
            "customer": {
                "email": user.email,
                "firstname": first_name,
                "lastname": last_name,
                "phonenumber": phone,
            },
            "tx_ref": reference,
            "currency": "NGN",
            # amount > 0 for dynamic VA per docs; use 1 for dynamic placeholder
            "amount": 0 if is_static else 1,
            "narration": f"{user.id}-wallet-funding",
            "preferred_bank": clean_bank,
        }

        if is_static:
            clean_id = re.sub(r"\D", "", str(bvn_or_nin or ""))
            if len(clean_id) == 11:
                payload["bvn"] = clean_id
            else:
                # assume NIN if not BVN length
                payload["nin"] = clean_id
            payload["is_permanent"] = True

        try:
            logger.debug("Creating VA payload: %s", payload)
            resp = requests.post(url, json=payload, headers=headers, timeout=60)
            # Accept 200 or 201 depending on API
            if resp.status_code not in (200, 201):
                logger.error("VA creation HTTP %s: %s", resp.status_code, resp.text)
                return None

            data = resp.json()
            # typical v4 success pattern: 'status' or http codes; guard robustly
            if data.get("status") not in (None, "success", "created"):
                # some v4 endpoints may omit status; inspect 'data'
                logger.error("VA creation returned failure payload: %s", data)
                return None

            va_data = data.get("data") or data
            # normalize fields
            account_number = va_data.get("account_number") or va_data.get("acct_number") or va_data.get("account_no")
            bank_name = va_data.get("bank_name") or va_data.get("bank") or va_data.get("bank_name")
            account_name = va_data.get("account_name") or va_data.get("recipient_name") or va_data.get("account_name")
            provider_ref = va_data.get("tx_ref") or va_data.get("order_ref") or va_data.get("reference") or reference

            logger.info("%s VA created: %s", "Static" if is_static else "Dynamic", account_number)

            return {
                "provider": "flutterwave",
                "account_number": account_number,
                "bank_name": bank_name,
                "account_name": account_name,
                "reference": provider_ref,
                "type": "static" if is_static else "dynamic",
                "raw_response": data,
                "customer_id": va_data.get("customer_id") or va_data.get("customer", {}).get("id"),
            }
        except Exception as e:
            logger.error("Error creating VA: %s", e, exc_info=True)
            return None

    def verify_webhook_signature(self, raw_body: bytes, incoming_signature: str) -> bool:
        """
        Compute HMAC-SHA256 and compare base64 digest per Flutterwave docs.
        Returns True if signatures match.
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
