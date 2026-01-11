from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Optional, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


logger = logging.getLogger(__name__)

DEFAULT_PHONE_NUMBER = "+2340000000000"


class PalmpayService:
    timeout = 60

    def __init__(self, use_live: bool = False):
        prefix = "" if use_live else "TEST_"

        self.merchant_id = getattr(settings, f"PALMPAY_{prefix}MERCHANT_ID", None)
        self.app_id = getattr(settings, f"PALMPAY_{prefix}APP_ID", None)
        self.public_key = getattr(settings, f"PALMPAY_{prefix}PUBLIC_KEY", None)
        self.private_key = getattr(settings, f"PALMPAY_{prefix}PRIVATE_KEY", None)
        self.base_url = getattr(
            settings,
            f"PALMPAY_{prefix}BASE_URL",
            "https://open-gw-prod.palmpay-inc.com/api" if use_live else
            "https://open-gw-daily.palmpay-inc.com/api",
        )

        missing = [
            k for k, v in {
                "MERCHANT_ID": self.merchant_id,
                "APP_ID": self.app_id,
                "PUBLIC_KEY": self.public_key,
                "PRIVATE_KEY": self.private_key,
            }.items() if not v
        ]

        if missing:
            raise ImproperlyConfigured(f"Missing PalmPay config: {', '.join(missing)}")

        self.base_url = self.base_url.rstrip("/")

        logger.info(
            "PalmPay initialized (%s) appId=%s merchantId=%s",
            "LIVE" if use_live else "SANDBOX",
            self.app_id,
            self.merchant_id,
        )

    # ---------------------------------------------------------
    # CRYPTO
    # ---------------------------------------------------------
    def _sign(self, payload: str, timestamp: str) -> str:
        message = f"{timestamp}{payload}".encode("utf-8")

        private_key = serialization.load_pem_private_key(
            self.private_key.encode(),
            password=None,
        )

        signature = private_key.sign(
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )

        return signature.encode("base64") if False else __import__("base64").b64encode(signature).decode()

    def _headers(self, payload: str) -> Dict[str, str]:
        timestamp = str(int(time.time() * 1000))
        signature = self._sign(payload, timestamp)

        return {
            "Content-Type": "application/json;charset=UTF-8",
            "CountryCode": "NG",
            "Request-Time": timestamp,
            "Signature": signature,
            "Public-Key": self.public_key,   # FULL PEM
            "App-Id": self.app_id,
            "Merchant-Id": self.merchant_id,
        }

    # ---------------------------------------------------------
    # VIRTUAL ACCOUNT
    # ---------------------------------------------------------
    def create_virtual_account(
        self,
        user,
        bvn: Optional[str] = None,
    ) -> Dict[str, Any]:

        reference = f"palmpay_va_{uuid.uuid4().hex[:12]}"
        name = user.email.split("@")[0][:50]

        payload_dict = {
            "requestTime": int(time.time() * 1000),
            "identityType": "personal",
            "virtualAccountName": name,
            "customerName": name,
            "email": user.email,
            "nonceStr": str(uuid.uuid4()),
            "version": "V2.0",
            "appId": self.app_id,
            "merchantId": self.merchant_id,
        }

        if bvn:
            payload_dict["bvn"] = bvn

        payload = json.dumps(payload_dict, separators=(",", ":"))
        headers = self._headers(payload)

        endpoint = f"{self.base_url}/v2/virtual/account/label/create"

        logger.debug("PalmPay request %s %s", endpoint, payload)

        resp = requests.post(
            endpoint,
            data=payload.encode(),
            headers=headers,
            timeout=self.timeout,
        )

        logger.debug("PalmPay response %s %s", resp.status_code, resp.text)

        data = resp.json()

        if data.get("respCode") not in ("000000", "0000", "0"):
            return {
                "error": f"{data.get('respCode')} {data.get('respMsg')}",
                "raw": data,
            }

        va = data.get("data") or {}

        return {
            "provider": "palmpay",
            "account_number": va.get("accountNumber"),
            "bank_name": va.get("bankName", "PalmPay"),
            "account_name": va.get("accountName", name),
            "reference": reference,
            "raw_response": data,
        }

    # ---------------------------------------------------------
    # WEBHOOK VERIFICATION
    # ---------------------------------------------------------
    def verify_webhook_signature(self, raw_body: bytes, signature: str, timestamp: str) -> bool:
        """
        Verify PalmPay webhook signature.

        Args:
            raw_body:  Raw request body bytes
            signature: Signature from webhook header
            timestamp:  Timestamp from webhook header

        Returns:
            True if signature is valid, False otherwise
        """
        if not self.private_key:
            logger.error("CRITICAL: PalmPay private key not configured.")
            return False

        if not signature:
            logger.warning("PalmPay webhook signature missing.")
            return False

        try: 
            # Compute expected signature
            message = f"{timestamp}{raw_body. decode('utf-8')}"
            computed_signature = base64.b64encode(
                hmac.new(
                    self.private_key.encode("utf-8"),
                    message.encode("utf-8"),
                    hashlib.sha256
                ).digest()
            ).decode("utf-8")

            # Compare signatures
            if hmac.compare_digest(signature. strip(), computed_signature):
                logger.debug("PalmPay webhook signature verified successfully.")
                return True

            logger.warning(
                "PalmPay webhook signature verification failed.  "
                "Computed signature does not match received signature."
            )
            return False

        except (UnicodeDecodeError, TypeError, ValueError) as e:
            logger.warning("PalmPay signature verification failed with error: %s", str(e))
            return False
