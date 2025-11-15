import logging
import uuid
import re
import time
import base64
import requests
import hmac
import hashlib
from django.conf import settings

logger = logging.getLogger(__name__)


class FlutterwaveService:
    """
    LIVE-ONLY Flutterwave v4 integration
    - OAuth2 token
    - create customer
    - create virtual account (static/dynamic)
    - transfer
    - webhook verification
    """

    def __init__(self):
        self.client_id = settings.FLW_LIVE_CLIENT_ID
        self.client_secret = settings.FLW_LIVE_CLIENT_SECRET
        self.encryption_key = settings.FLW_LIVE_ENCRYPTION_KEY
        self.hash_secret = settings.FLW_LIVE_HASH_SECRET
        self.base_url = settings.FLW_LIVE_BASE_URL.rstrip("/")

        if not self.client_id or not self.client_secret:
            raise Exception("Missing Flutterwave LIVE credentials")

        self.access_token = None
        self.token_expiry_ts = 0

        logger.info("FlutterwaveService initialized in LIVE MODE → %s", self.base_url)

    # ---------------------------------------------------
    #   OAuth v4 Token
    # ---------------------------------------------------

    def _token_expired(self):
        return (not self.access_token) or time.time() >= self.token_expiry_ts - 10

    def get_access_token(self):
        if not self._token_expired():
            return self.access_token

        url = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token"
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }

        resp = requests.post(url, headers=headers, data=data, timeout=30)
        resp.raise_for_status()

        data = resp.json()
        self.access_token = data["access_token"]
        self.token_expiry_ts = time.time() + int(data.get("expires_in", 3600))

        return self.access_token

    # ---------------------------------------------------
    #   CUSTOMER
    # ---------------------------------------------------

    def create_or_get_customer(self, user, bvn_or_nin=None):
        profile = getattr(user, "profile", None)
        if profile and profile.flutterwave_customer_id:
            return profile.flutterwave_customer_id

        token = self.get_access_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        url = f"{self.base_url}/customers"

        payload = {
            "first_name": getattr(profile, "first_name", user.email.split("@")[0]),
            "last_name": getattr(profile, "last_name", "User"),
            "email": user.email,
            "phone_number": getattr(profile, "phone_number", "+2340000000000"),
        }

        if bvn_or_nin:
            clean = re.sub(r"\D", "", str(bvn_or_nin))
            payload["bvn"] = clean

        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()

        cust = resp.json().get("data", {})
        customer_id = cust.get("id")

        if profile:
            profile.flutterwave_customer_id = customer_id
            profile.save(update_fields=["flutterwave_customer_id"])

        return customer_id

    # ---------------------------------------------------
    #   VIRTUAL ACCOUNT (v4)
    # ---------------------------------------------------

    def create_virtual_account(self, user, bank="WEMA_BANK", bvn_or_nin=None):
        customer_id = self.create_or_get_customer(user, bvn_or_nin=bvn_or_nin)
        token = self.get_access_token()

        url = f"{self.base_url}/virtual-accounts"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        is_static = bool(bvn_or_nin)
        reference = f"va{uuid.uuid4().hex[:12]}"

        payload = {
            "customer_id": customer_id,
            "currency": "NGN",
            "reference": reference,
            "account_type": "static" if is_static else "dynamic",
            "amount": 0 if is_static else 1,
            "is_permanent": is_static,
            "metadata": {
                "preferred_bank": bank,
                "narration": f"{user.id}-wallet-funding",
            }
        }

        if is_static:
            clean = re.sub(r"\D", "", str(bvn_or_nin))
            payload["bvn" if len(clean) == 11 else "nin"] = clean

        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()

        data = resp.json().get("data", {})

        return {
            "provider": "flutterwave",
            "account_number": data.get("account_number"),
            "bank_name": data.get("bank_name"),
            "account_name": data.get("account_name"),
            "reference": reference,
            "customer_id": customer_id,
            "raw": data,
        }

    # ---------------------------------------------------
    #   WEBHOOK SIGNATURE CHECK
    # ---------------------------------------------------

    def verify_webhook(self, raw, signature):
        if not self.hash_secret:
            return False
        digest = hmac.new(self.hash_secret.encode(), raw, hashlib.sha256).digest()
        expected = base64.b64encode(digest).decode()
        return hmac.compare_digest(expected, signature)
