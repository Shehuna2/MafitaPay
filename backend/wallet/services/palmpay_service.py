from __future__ import annotations

import base64
import json
import logging
import time
import uuid
from typing import Optional, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


logger = logging.getLogger(__name__)


class PalmpayService:
    timeout = 60

    def __init__(self, use_live: bool = False):
        prefix = "" if use_live else "TEST_"

        self.merchant_id = getattr(settings, f"PALMPAY_{prefix}MERCHANT_ID", None)
        self.app_id = getattr(settings, f"PALMPAY_{prefix}APP_ID", None)
        self.public_key = getattr(settings, f"PALMPAY_{prefix}PUBLIC_KEY", None)
        self.private_key_raw = getattr(settings, f"PALMPAY_{prefix}PRIVATE_KEY", None)
        self.base_url = (
            getattr(settings, f"PALMPAY_{prefix}BASE_URL", None)
            or ("https://open-gw-prod.palmpay-inc.com/api" if use_live
                else "https://open-gw-daily.palmpay-inc.com/api")
        )


        missing = [
            k for k, v in {
                "MERCHANT_ID": self.merchant_id,
                "APP_ID": self.app_id,
                "PUBLIC_KEY": self.public_key,
                "PRIVATE_KEY": self.private_key_raw,
            }.items() if not v
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
    # CRYPTO
    # ---------------------------------------------------------
    def _wrap_pkcs8_key(self, raw: str) -> bytes:
        raw = raw.strip().replace("\\n", "").replace("\n", "")
        body = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
        pem = (
            "-----BEGIN PRIVATE KEY-----\n"
            f"{body}\n"
            "-----END PRIVATE KEY-----\n"
        )
        return pem.encode("utf-8")


    def _wrap_pkcs1_key(self, raw: str) -> bytes:
        raw = raw.strip().replace("\\n", "").replace("\n", "")
        body = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
        pem = (
            "-----BEGIN RSA PRIVATE KEY-----\n"
            f"{body}\n"
            "-----END RSA PRIVATE KEY-----\n"
        )
        return pem.encode("utf-8")


    def _load_private_key(self, raw_key: str):
        candidates = []

        if "BEGIN" in raw_key:
            candidates.append(raw_key.replace("\\n", "\n").encode("utf-8"))
        else:
            candidates.append(self._wrap_pkcs8_key(raw_key))
            candidates.append(self._wrap_pkcs1_key(raw_key))

        last_exc = None

        for pem in candidates:
            try:
                return serialization.load_pem_private_key(
                    pem,
                    password=None,
                )
            except Exception as exc:
                last_exc = exc

        logger.critical("PalmPay private key invalid: %s", last_exc)
        raise ImproperlyConfigured("Invalid PalmPay PRIVATE_KEY format") from last_exc


    def _sign(self, payload: str, timestamp: str) -> str:
        message = f"{timestamp}{payload}".encode("utf-8")

        signature = self.private_key.sign(
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )

        return base64.b64encode(signature).decode("utf-8")

    def _headers(self, payload: str) -> Dict[str, str]:
        timestamp = str(int(time.time() * 1000))
        signature = self._sign(payload, timestamp)

        return {
            "Content-Type": "application/json;charset=UTF-8",
            "CountryCode": "NG",
            "Request-Time": timestamp,
            "Signature": signature,
            "Authorization": f"Bearer {self.app_id}",
            "Public-Key": self.public_key,
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

        resp = requests.post(
            endpoint,
            data=payload,
            headers=headers,
            timeout=self.timeout,
        )

        data = resp.json()
        logger.warning("PalmPay raw response: %s", data)


        if data.get("respCode") not in ("000000", "0000", "0"):
            return {"error": data.get("respMsg"), "raw": data}

        va = data.get("data") or {}

        return {
            "provider": "palmpay",
            "account_number": va.get("accountNumber"),
            "bank_name": va.get("bankName", "PalmPay"),
            "account_name": va.get("accountName", name),
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
