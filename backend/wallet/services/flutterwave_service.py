# wallet/services/flutterwave_service.py

import base64
import hashlib
import hmac
import logging
import re
import time
import uuid
from typing import Optional, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FlutterwaveService:
    """Flutterwave v4 client with static VA + bank fallback logic."""

    timeout = 60  # Crucial: avoid hanging requests

    def __init__(self, use_live: bool = False):
        if use_live:
            self.client_id = getattr(settings, "FLW_LIVE_CLIENT_ID")
            self.client_secret = getattr(settings, "FLW_LIVE_CLIENT_SECRET")
            self.encryption_key = getattr(settings, "FLW_LIVE_ENCRYPTION_KEY")
            self.hash_secret = getattr(settings, "FLW_LIVE_HASH_SECRET")
            self.base_url = getattr(
                settings,
                "FLW_LIVE_BASE_URL",
                "https://f4bexperience.flutterwave.com",
            )
        else:
            self.client_id = getattr(settings, "FLW_TEST_CLIENT_ID")
            self.client_secret = getattr(settings, "FLW_TEST_CLIENT_SECRET")
            self.encryption_key = getattr(settings, "FLW_TEST_ENCRYPTION_KEY")
            self.hash_secret = getattr(settings, "FLW_TEST_HASH_SECRET")
            self.base_url = getattr(
                settings,
                "FLW_TEST_BASE_URL",
                "https://developersandbox-api.flutterwave.com",
            )

        if not self.client_id or not self.client_secret:
            raise ImproperlyConfigured("Missing Flutterwave credentials.")

        self.base_url = str(self.base_url).rstrip("/")

        self.access_token: Optional[str] = None
        self.token_expiry_ts: float = 0

        logger.info(
            "FlutterwaveService initialized (%s) → %s",
            "LIVE" if use_live else "SANDBOX",
            self.base_url,
        )

    # ---------------------------------------------------------
    # TOKEN HANDLING
    # ---------------------------------------------------------
    def _token_expired(self) -> bool:
        return not self.access_token or time.time() > (self.token_expiry_ts - 10)

    def get_access_token(self) -> Optional[str]:
        if not self._token_expired():
            return self.access_token

        url = (
            "https://idp.flutterwave.com/realms/flutterwave/"
            "protocol/openid-connect/token"
        )
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "grant_type": "client_credentials",
        }

        try:
            resp = requests.post(
                url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30,
            )
            resp.raise_for_status()
            tok = resp.json()
            token = tok.get("access_token")
            if not token:
                return None

            self.access_token = token
            self.token_expiry_ts = time.time() + int(tok.get("expires_in", 3600))
            return token
        except Exception:
            self.access_token = None
            self.token_expiry_ts = 0
            logger.exception("Failed to request OAuth token.")
            return None

    # ---------------------------------------------------------
    # CUSTOMER
    # ---------------------------------------------------------
    def _get_profile(self, user):
        return getattr(user, "profile", None)

    def create_or_get_customer(self, user, bvn_or_nin: Optional[str] = None) -> Optional[str]:
        profile = self._get_profile(user)
        if profile and getattr(profile, "flutterwave_customer_id", None):
            return profile.flutterwave_customer_id

        token = self.get_access_token()
        if not token:
            return None

        endpoint = f"{self.base_url}/customers"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        first_name = (
            profile.first_name.strip()
            if profile and getattr(profile, "first_name", None)
            else user.email.split("@")[0]
        )[:50]
        last_name = (
            profile.last_name.strip()
            if profile and getattr(profile, "last_name", None)
            else "User"
        )[:50]

        payload = {
            "first_name": first_name,
            "last_name": last_name,
            "email": user.email,
            "phone_number": getattr(profile, "phone_number", "+2340000000000"),
        }

        if bvn_or_nin:
            payload["bvn"] = re.sub(r"\D", "", str(bvn_or_nin))

        try:
            r = requests.post(endpoint, json=payload, headers=headers, timeout=30)
            if r.status_code not in (200, 201):
                return None

            data = r.json()
            d = data.get("data") or data
            customer_id = (
                d.get("id")
                or d.get("customer_id")
                or d.get("customer", {}).get("id")
            )
            if not customer_id:
                return None

            if profile:
                try:
                    profile.flutterwave_customer_id = customer_id
                    profile.save(update_fields=["flutterwave_customer_id"])
                except Exception:
                    logger.exception("Profile save error (non-fatal).")

            return customer_id

        except Exception:
            logger.exception("Customer creation failed.")
            return None

    # ---------------------------------------------------------
    # STATIC VA WITH WEMA ↔ STERLING FALLBACK
    # ---------------------------------------------------------
    def create_static_virtual_account(
        self,
        user,
        bvn_or_nin: str,
        preferred_bank: str = "WEMA_BANK",
    ) -> Optional[Dict[str, Any]]:

        token = self.get_access_token()
        if not token:
            return None

        customer_id = self.create_or_get_customer(user, bvn_or_nin=bvn_or_nin)
        if not customer_id:
            return None

        clean_id = re.sub(r"\D", "", str(bvn_or_nin))
        is_bvn = len(clean_id) == 11

        reference = f"va{uuid.uuid4().hex[:12]}"

        payload = {
            "customer_id": customer_id,
            "account_type": "static",
            "reference": reference,
            "currency": "NGN",
            "amount": 0,
            "is_permanent": True,
            "metadata": {
                "preferred_bank": preferred_bank,
                "narration": f"{user.id}-wallet-funding",
            },
        }

        # BVN at root level
        if is_bvn:
            payload["bvn"] = clean_id
        else:
            payload["nin"] = clean_id

        # Compute bank fallback order
        pb = preferred_bank.upper()
        if pb in ("WEMA_BANK", "WEMA"):
            bank_order = ["WEMA_BANK", "STERLING_BANK"]
        elif pb in ("STERLING_BANK", "STERLING"):
            bank_order = ["STERLING_BANK", "WEMA_BANK"]
        else:
            bank_order = [pb, "WEMA_BANK", "STERLING_BANK"]

        endpoint = f"{self.base_url}/virtual-accounts"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        last_error = None

        for bank in bank_order:
            payload["metadata"]["preferred_bank"] = bank

            try:
                resp = requests.post(endpoint, json=payload, headers=headers, timeout=self.timeout)

                if resp.status_code in (200, 201):
                    data = resp.json()
                    va = data.get("data") or data
                    account_number = va.get("account_number")

                    if account_number:
                        return {
                            "provider": "flutterwave",
                            "account_number": account_number,
                            "bank_name": va.get("bank_name") or va.get("bank", {}).get("name"),
                            "account_name": va.get("account_name"),
                            "reference": va.get("reference") or reference,
                            "type": "static",
                            "raw_response": data,
                            "customer_id": customer_id,
                        }

                last_error = f"{resp.status_code}: {resp.text}"

            except Exception as exc:
                last_error = str(exc)
                continue

        logger.error("All bank attempts failed. Last error: %s", last_error)
        return None

    # ---------------------------------------------------------
    # WEBHOOK VERIFICATION
    # ---------------------------------------------------------
    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        """
        Verify Flutterwave webhook signature.
        
        Flutterwave sends webhooks with a 'verif-hash' header containing
        a base64-encoded HMAC-SHA256 signature of the request body.
        
        Args:
            raw_body: The raw request body as bytes
            signature: The signature from the verif-hash header
            
        Returns:
            True if signature is valid, False otherwise
        """
        if not self.hash_secret:
            logger.error("Hash secret is not configured for webhook verification")
            return False

        if not signature:
            logger.error("No signature provided for verification")
            return False

        try:
            # Compute HMAC-SHA256 signature
            dig = hmac.new(
                self.hash_secret.encode(),
                raw_body,
                hashlib.sha256,
            ).digest()
            expected = base64.b64encode(dig).decode()
            
            # Verify signature
            is_valid = hmac.compare_digest(expected, signature)
            
            # Only log verification result, not the actual signatures (security)
            logger.debug(
                "Signature verification result: %s (payload length: %d bytes)",
                "valid" if is_valid else "invalid",
                len(raw_body)
            )
            
            return is_valid
        except Exception as e:
            logger.exception(
                "Webhook signature verification failed with exception: %s", 
                str(e)
            )
            return False
