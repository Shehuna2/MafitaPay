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
from .palmpay_callback import verify_palmpay_callback


logger = logging.getLogger(__name__)


class PalmpayService:


    def __init__(self, use_live: bool = False):
        self.timeout = 30  # seconds

        prefix = "" if use_live else "TEST_"

        self.merchant_id = getattr(settings, f"PALMPAY_{prefix}MERCHANT_ID")
        self.app_id = getattr(settings, f"PALMPAY_{prefix}APP_ID")
        self.private_key_raw = getattr(settings, f"PALMPAY_{prefix}PRIVATE_KEY")
        self.palmpay_public_key_raw = getattr(
            settings, f"PALMPAY_{prefix}PUBLIC_KEY"
        )

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
                "PUBLIC_KEY": self.palmpay_public_key_raw,
                "BASE_URL": self.base_url,
            }.items()
            if not v
        ]

        if missing:
            raise ImproperlyConfigured(f"Missing PalmPay config: {', '.join(missing)}")

        self.base_url = self.base_url.rstrip("/")
        self.private_key = self._load_private_key(self.private_key_raw)
        self.palmpay_public_key = self._load_public_key(self.palmpay_public_key_raw)


        logger.info(
            "PalmPay initialized (%s) appId=%s merchantId=%s",
            "LIVE" if use_live else "SANDBOX",
            self.app_id,
            self.merchant_id,
        )

    # ---------------------------------------------------------
    # PRIVATE KEY LOADING
    # ---------------------------------------------------------
    def _extract_key_body(self, raw: str) -> str:
        lines = []
        for line in raw.strip().splitlines():
            if "BEGIN" in line or "END" in line:
                continue
            lines.append(line.strip())
        return "".join(lines).replace("\\n", "").replace("\n", "")

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

        key_body = self._extract_key_body(raw_key)
        if key_body:
            candidates.append(self._wrap_pkcs8_key(key_body))
            candidates.append(self._wrap_pkcs1_key(key_body))

        last_exc = None

        for pem in candidates:
            try:
                return serialization.load_pem_private_key(pem, password=None)
            except Exception as exc:
                last_exc = exc

        logger.critical("PalmPay private key invalid: %s", last_exc)
        raise ImproperlyConfigured("Invalid PalmPay PRIVATE_KEY format") from last_exc

    def _wrap_public_key(self, raw: str) -> bytes:
        raw = raw.strip().replace("\\n", "").replace("\n", "")
        body = "\n".join(raw[i:i + 64] for i in range(0, len(raw), 64))
        return (
            "-----BEGIN PUBLIC KEY-----\n"
            f"{body}\n"
            "-----END PUBLIC KEY-----\n"
        ).encode()

    def _load_public_key(self, raw_key: str):
        if "BEGIN" in raw_key:
            pem = raw_key.replace("\\n", "\n").encode()
        else:
            pem = self._wrap_public_key(raw_key)

        return serialization.load_pem_public_key(pem)
    

    def sign_payload(self, payload: dict) -> str:
        return palmpay_sign(payload, self.private_key)

    def verify_callback(self, body: dict) -> bool:
        signature = body.get("sign")
        if not signature:
            return False

        return verify_palmpay_callback(
            payload=body,
            signature=signature,
            palmpay_public_key=self.palmpay_public_key,
        )


    # ---------------------------------------------------------
    # VIRTUAL ACCOUNT
    # ---------------------------------------------------------
    def create_virtual_account(
        self,
        user,
        bvn: Optional[str] = None,
        phone_number: Optional[str] = None,  # we won't use it anyway
    ) -> Dict[str, Any]:
        name = user.email.split("@")[0][:50]

        if not bvn:
            bvn = str(getattr(user, "bvn", "")).strip()

        payload = {
            "requestTime": int(time.time() * 1000),
            "version": "V1.1",                           # good choice
            "nonceStr": str(uuid.uuid4()).replace("-", ""),  # good
            "identityType": "personal",
            "licenseNumber": bvn if bvn else "",         # empty string OK
            "virtualAccountName": name,
            "customerName": name,
            "email": user.email,
            # DO NOT ADD phoneNumber !!!
            # Optional: "accountReference": str(uuid.uuid4())[:32],
        }

        signature = self.sign_payload(payload)

        headers = {
            "Content-Type": "application/json;charset=UTF-8",
            "CountryCode": "NG",
            "Signature": signature,
            "Authorization": f"Bearer {self.app_id}",
            # No App-Id, no Merchant-Id
        }

        endpoint = f"{self.base_url}/v2/virtual/account/label/create"

        try:
            resp = requests.post(endpoint, json=payload, headers=headers, timeout=self.timeout)
            data = resp.json()
            logger.info("PalmPay raw response: %s", data)

            if data.get("respCode") != "00000000":
                return {"error": data.get("respMsg", "Unknown error"), "raw": data}

            va = data.get("data") or {}
            return {
                "provider": "palmpay",
                "account_number": va.get("virtualAccountNo"),
                "bank_name": "PalmPay",
                "account_name": va.get("virtualAccountName"),
                "status": va.get("status"),
                "raw_response": data,
            }

        except Exception as exc:
            logger.error("PalmPay request failed", exc_info=True)
            return {"error": str(exc)}
