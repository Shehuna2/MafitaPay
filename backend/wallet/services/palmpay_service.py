from __future__ import annotations

import logging
import time
import uuid
from typing import Optional, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from cryptography.hazmat.primitives import serialization

from .palmpay_signature import palmpay_sign

logger = logging.getLogger(__name__)


class PalmpayService:
    timeout = 60

    def __init__(self, use_live: bool = False):
        prefix = "" if use_live else "TEST_"

        self.merchant_id = getattr(settings, f"PALMPAY_{prefix}MERCHANT_ID", None)
        self.app_id = getattr(settings, f"PALMPAY_{prefix}APP_ID", None)
        self.private_key_raw = getattr(settings, f"PALMPAY_{prefix}PRIVATE_KEY", None)

        self.base_url = (
            getattr(settings, f"PALMPAY_{prefix}BASE_URL", None)
            or (
                "https://open-gw-prod.palmpay-inc.com/api"
                if use_live
                else "https://open-gw-daily.palmpay-inc.com/api"
            )
        )

        missing = [
            k for k, v in {
                "MERCHANT_ID": self.merchant_id,
                "APP_ID": self.app_id,
                "PRIVATE_KEY": self.private_key_raw,
            }.items()
            if not v
        ]

        if missing:
            raise ImproperlyConfigured(f"Missing PalmPay config: {', '.join(missing)}")

        self.base_url = self.base_url.rstrip("/")
        self.private_key = self._load_private_key(self.private_key_raw)

        logger.info(
            "PalmPay initialized (%s) appId=%s merchantId=%s",
            "LIVE" if use_live else "SANDBOX",
            self.app_id,
            self.merchant_id,
        )

    # ---------------------------------------------------------
    # PRIVATE KEY LOADING
    # ---------------------------------------------------------
    def _wrap_pkcs8_key(self, raw: str) -> bytes:
        raw = raw.strip().replace("\\n", "").replace("\n", "")
        body = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
        return (
            "-----BEGIN PRIVATE KEY-----\n"
            f"{body}\n"
            "-----END PRIVATE KEY-----\n"
        ).encode()

    def _wrap_pkcs1_key(self, raw: str) -> bytes:
        raw = raw.strip().replace("\\n", "").replace("\n", "")
        body = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
        return (
            "-----BEGIN RSA PRIVATE KEY-----\n"
            f"{body}\n"
            "-----END RSA PRIVATE KEY-----\n"
        ).encode()

    def _load_private_key(self, raw_key: str):
        candidates = []

        if "BEGIN" in raw_key:
            candidates.append(raw_key.replace("\\n", "\n").encode())
        else:
            candidates.append(self._wrap_pkcs8_key(raw_key))
            candidates.append(self._wrap_pkcs1_key(raw_key))

        last_exc = None

        for pem in candidates:
            try:
                return serialization.load_pem_private_key(pem, password=None)
            except Exception as exc:
                last_exc = exc

        logger.critical("PalmPay private key invalid: %s", last_exc)
        raise ImproperlyConfigured("Invalid PalmPay PRIVATE_KEY format") from last_exc

    # ---------------------------------------------------------
    # VIRTUAL ACCOUNT
    # ---------------------------------------------------------
    def create_virtual_account(
        self,
        user,
        bvn: Optional[str] = None,
        phone_number: Optional[str] = "08112345678",
    ) -> Dict[str, Any]:

        name = user.email.split("@")[0][:50]
        phone = phone_number or getattr(user, "phone_number", None)

        if not phone:
            phone = str(getattr(user, "phone_number", "2348162345678"))

        if not bvn:
            bvn = str(getattr(user, "bvn", "")).strip()

        payload = {
            "requestTime": int(time.time() * 1000),
            "version": "V1.0",
            "nonceStr": str(uuid.uuid4()),
            "identityType": "personal",
            "licenseNumber": bvn,
            "virtualAccountName": name,
            "customerName": name,
            "email": user.email,
            "phoneNumber": phone,
        }

        signature = palmpay_sign(payload, self.private_key)

        headers = {
            "Content-Type": "application/json;charset=UTF-8",
            "CountryCode": "NG",
            "Signature": signature,
            "Authorization": f"Bearer {self.app_id}",
        }

        endpoint = f"{self.base_url}/v2/virtual/account/label/create"

        resp = requests.post(endpoint, json=payload, headers=headers, timeout=self.timeout)
        data = resp.json()

        logger.info("PalmPay raw response: %s", data)

        if data.get("respCode") not in ("000000", "0000", "0"):
            return {"error": data.get("respMsg"), "raw": data}

        va = data.get("data") or {}

        return {
            "provider": "palmpay",
            "account_number": va.get("virtualAccountNo"),
            "bank_name": va.get("bankName", "PalmPay"),
            "account_name": va.get("virtualAccountName"),
            "status": va.get("status"),
            "raw_response": data,
        }


    # ---------------------------------------------------------
    # WEBHOOK VERIFICATION
    # ---------------------------------------------------------
    import base64
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.exceptions import InvalidSignature


    def verify_webhook_signature(
        self,
        raw_body: bytes,
        signature: str,
        timestamp: str,
    ) -> bool:
        if not signature or not timestamp:
            logger.warning("PalmPay webhook missing signature or timestamp.")
            return False

        try:
            message = f"{timestamp}{raw_body.decode('utf-8')}".encode("utf-8")

            public_key_pem = self._wrap_public_key(self.public_key)
            public_key = serialization.load_pem_public_key(public_key_pem)

            decoded_signature = base64.b64decode(signature)

            public_key.verify(
                decoded_signature,
                message,
                padding.PKCS1v15(),
                hashes.SHA256(),
            )

            logger.info("PalmPay webhook signature verified successfully.")
            return True

        except InvalidSignature:
            logger.warning("PalmPay webhook signature mismatch.")
            return False

        except Exception as exc:
            logger.error("PalmPay webhook verification failed: %s", exc, exc_info=True)
            return False
