# services/flutterwave_v3_card.py
from __future__ import annotations

import base64
import json
import logging
from decimal import Decimal
from typing import Dict, Any

import requests
from Crypto.Cipher import DES3
from Crypto.Util.Padding import pad
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FlutterwaveCardService:
    """
    Flutterwave CARD Payments – V3 ONLY

    - One-time card charge
    - 3DES encryption
    - 3DS redirect flow
    - No OAuth
    - Secret Key auth only
    """

    timeout = 60

    def __init__(self, use_live: bool = False):
        cfg = "LIVE" if use_live else "TEST"

        self.secret_key = getattr(settings, f"FLW_{cfg}_SECRET_KEY", None)
        self.encryption_key = getattr(settings, f"FLW_{cfg}_ENCRYPTION_KEY", None)
        self.base_url = getattr(
            settings,
            f"FLW_{cfg}_V3_BASE_URL",
            "https://api.flutterwave.com/v3",
        ).rstrip("/")

        if not all([self.secret_key, self.encryption_key]):
            raise ImproperlyConfigured("Flutterwave V3 credentials are incomplete")

        logger.info("Flutterwave V3 Card Service initialized (%s)", cfg)

    # ------------------------------------------------------------------
    # ENCRYPTION (V3 REQUIRED)
    # ------------------------------------------------------------------
    def _encrypt_card_payload(self, card_data: Dict[str, str]) -> str:
        key = self.encryption_key.encode()[:24]
        plaintext = json.dumps(card_data).encode()
        padded = pad(plaintext, DES3.block_size)

        cipher = DES3.new(key, DES3.MODE_ECB)
        encrypted = cipher.encrypt(padded)

        return base64.b64encode(encrypted).decode()

    # ------------------------------------------------------------------
    # CARD CHARGE (V3)
    # ------------------------------------------------------------------
    def charge_card(
        self,
        *,
        amount: Decimal,
        currency: str,
        email: str,
        fullname: str,
        tx_ref: str,
        card_number: str,
        cvv: str,
        expiry_month: str,
        expiry_year: str,
        redirect_url: str,
    ) -> Dict[str, Any]:

        try:
            encrypted_client = self._encrypt_card_payload(
                {
                    "cardno": card_number.replace(" ", ""),
                    "cvv": cvv,
                    "expirymonth": expiry_month,
                    "expiryyear": expiry_year,
                }
            )
        except Exception:
            logger.exception("Card encryption failed")
            return {"status": "error", "message": "Card encryption failed"}

        payload = {
            "tx_ref": tx_ref,
            "amount": str(amount),
            "currency": currency,
            "email": email,
            "fullname": fullname,
            "client": encrypted_client,
            "redirect_url": redirect_url,
            "country": "NG",
        }

        headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

        endpoint = f"{self.base_url}/charges?type=card"

        try:
            resp = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            data = resp.json()

            if resp.status_code not in (200, 201):
                logger.error("Flutterwave V3 card charge failed: %s", data)
                return {
                    "status": "error",
                    "message": data.get("message", "Charge failed"),
                    "data": data,
                }

            return {"status": "success", "data": data.get("data", data)}

        except requests.Timeout:
            return {"status": "error", "message": "Request timeout"}
        except Exception:
            logger.exception("Unexpected card charge error")
            return {"status": "error", "message": "Unexpected error"}

    # ------------------------------------------------------------------
    # VERIFY TRANSACTION (V3)
    # ------------------------------------------------------------------
    def verify_by_reference(self, tx_ref: str) -> Dict[str, Any]:
        endpoint = f"{self.base_url}/transactions/verify_by_reference?tx_ref={tx_ref}"

        headers = {
            "Authorization": f"Bearer {self.secret_key}",
        }

        try:
            resp = requests.get(endpoint, headers=headers, timeout=self.timeout)
            data = resp.json()

            if resp.status_code != 200:
                return {
                    "status": "error",
                    "message": data.get("message", "Verification failed"),
                    "data": data,
                }

            return {"status": "success", "data": data.get("data", data)}

        except Exception:
            logger.exception("Verification failed")
            return {"status": "error", "message": "Verification error"}
