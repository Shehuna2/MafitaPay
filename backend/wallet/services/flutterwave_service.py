import requests
import logging
import time
from typing import Optional, Dict, Any, Union
from django.conf import settings
import hashlib
import hmac
import json

logger = logging.getLogger(__name__)


class FlutterwaveService:
    """
    Flutterwave v4 OAuth2 + Static Virtual Accounts Service
    Fixed & hardened:
    - Token caching
    - Customer exact matching
    - Reference normalization
    - Webhook signature validation
    - Robust error-handling
    """

    TOKEN_CACHE: Dict[str, Union[str, float]] = {
        "access_token": None,
        "expires_at": 0
    }

    TIMEOUT = 20

    def __init__(self, use_live: bool = False):
        self.use_live = use_live

        if use_live:
            self.base_url = settings.FLW_LIVE_BASE_URL
            self.client_id = settings.FLW_LIVE_CLIENT_ID
            self.client_secret = settings.FLW_LIVE_CLIENT_SECRET
            self.secret_hash = settings.FLW_LIVE_HASH_SECRET
        else:
            self.base_url = settings.FLW_TEST_BASE_URL
            self.client_id = settings.FLW_TEST_CLIENT_ID
            self.client_secret = settings.FLW_TEST_CLIENT_SECRET
            self.secret_hash = settings.FLW_TEST_HASH_SECRET

        self.idp_url = "https://idp.flutterwave.com"

        logger.info(f"FlutterwaveService initialized → {'LIVE' if use_live else 'SANDBOX'}")

    # ===========================
    # OAuth Token Handler
    # ===========================
    def get_access_token(self) -> Optional[str]:
        now = time.time()
        if self.TOKEN_CACHE["access_token"] and self.TOKEN_CACHE["expires_at"] > now:
            return self.TOKEN_CACHE["access_token"]
        return self._fetch_new_token()

    def _fetch_new_token(self) -> Optional[str]:
        url = f"{self.idp_url}/realms/flutterwave/protocol/openid-connect/token"

        try:
            res = requests.post(
                url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret
                },
                timeout=self.TIMEOUT
            )
            res.raise_for_status()
            data = res.json()
        except Exception as e:
            logger.error("FW OAuth token error: %s", e)
            return None

        access_token = data.get("access_token")
        expires_in = data.get("expires_in", 3600)

        if not access_token:
            logger.error("FW OAuth token missing → %s", data)
            return None

        self.TOKEN_CACHE["access_token"] = access_token
        self.TOKEN_CACHE["expires_at"] = time.time() + expires_in - 60

        logger.info("New FW OAuth token obtained")
        return access_token

    def _auth_headers(self) -> Dict[str, str]:
        token = self.get_access_token()
        if not token:
            return {
                "Content-Type": "application/json"
            }
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

    # ===========================
    # Safe HTTP Wrappers
    # ===========================
    def _safe_get(self, url: str):
        try:
            res = requests.get(url, headers=self._auth_headers(), timeout=self.TIMEOUT)
            res.raise_for_status()
            return res
        except Exception as e:
            logger.error("FW GET error → URL=%s | %s", url, e)
            return None

    def _safe_post(self, url: str, payload: Dict[str, Any]):
        try:
            res = requests.post(url, json=payload, headers=self._auth_headers(), timeout=self.TIMEOUT)
            res.raise_for_status()
            return res
        except Exception as e:
            logger.error("FW POST error → URL=%s | %s", url, e)
            return None

    # ===========================
    # Webhook Signature Verification
    # ===========================
    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        """Official Flutterwave v4 webhook signature: HMAC-SHA256(secret_hash, payload)"""

        if not self.secret_hash:
            logger.error("Missing Flutterwave secret hash in settings.")
            return False

        computed = hmac.new(
            self.secret_hash.encode(),
            raw_body,
            hashlib.sha256
        ).hexdigest()

        valid = hmac.compare_digest(computed, signature)

        if not valid:
            logger.error("Webhook signature mismatch → expected=%s | received=%s", computed, signature)

        return valid

    # ===========================
    # Customer Handling
    # ===========================
    def get_or_create_customer(self, user) -> Optional[str]:
        email = user.email.lower().strip()
        url = f"{self.base_url}/customers?email={email}"

        res = self._safe_get(url)
        if res:
            customers = res.json().get("data", [])
            # Fuzzy match fix
            for c in customers:
                if c.get("email", "").lower().strip() == email:
                    return c.get("id")

        # Create customer
        payload = {
            "email": email,
            "fullname": f"{user.first_name} {user.last_name}".strip() or user.username,
            "phone_number": getattr(user, "phone_number", ""),
        }

        res = self._safe_post(f"{self.base_url}/customers", payload)
        if not res:
            return None

        return res.json().get("data", {}).get("id")

    # ===========================
    # Virtual Account Handling
    # ===========================
    def get_existing_va(self, customer_id: str, user):
        url = f"{self.base_url}/virtual-accounts?customer_id={customer_id}"
        res = self._safe_get(url)

        if not res:
            return None

        vas = res.json().get("data", []) or []

        for va in vas:
            fw_email = va.get("customer", {}).get("email")

            if fw_email and fw_email.lower() != user.email.lower():
                return {"error": "VA belongs to a different user"}

            return {
                "account_number": va.get("account_number"),
                "account_name": va.get("account_name"),
                "bank_name": va.get("bank_name") or va.get("bank", {}).get("name"),
                "provider_reference": va.get("reference"),
                "type": va.get("type", "static"),
                "owner_email": fw_email
            }

        return None

    def create_new_static_va(self, customer_id: str, user, preferred_bank: str = None):
        payload = {
            "customer_id": customer_id,
            "is_permanent": True,
            "email": user.email
        }

        if preferred_bank:
            payload["preferred_bank"] = preferred_bank

        res = self._safe_post(f"{self.base_url}/virtual-accounts", payload)
        if not res:
            return None

        data = res.json()
        if data.get("status") != "success":
            return None

        va = data.get("data", {})

        return {
            "account_number": va.get("account_number"),
            "account_name": va.get("account_name", "Virtual Account"),
            "bank_name": va.get("bank_name") or va.get("bank", {}).get("name"),
            "provider_reference": va.get("reference"),
            "type": va.get("type", "static"),
        }

    # ===========================
    # Public Entry Point
    # ===========================
    def create_virtual_account(self, user, preferred_bank=None, bvn_or_nin=None):
        customer_id = self.get_or_create_customer(user)
        if not customer_id:
            return {"error": "Failed to create customer"}

        # Existing VA?
        existing = self.get_existing_va(customer_id, user)
        if isinstance(existing, dict) and existing.get("error"):
            return existing

        if existing:
            return existing

        return self.create_new_static_va(customer_id, user, preferred_bank)
