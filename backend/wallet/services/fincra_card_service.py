# wallet/services/fincra_card_service.py
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FincraCardService:
    """
    Fincra Checkout Redirect integration.

    - Create checkout: POST /checkout/payments
    - Required headers: api-key (SECRET), x-pub-key (PUBLIC)
    """

    timeout = 60

    def __init__(self, use_live: bool = False):
        cfg = "LIVE" if use_live else "TEST"

        self.public_key = getattr(settings, f"FINCRA_{cfg}_PUBLIC_KEY", None)
        self.secret_key = getattr(settings, f"FINCRA_{cfg}_SECRET_KEY", None)
        self.webhook_secret = getattr(settings, f"FINCRA_{cfg}_WEBHOOK_SECRET", None)

        self.base_url = getattr(
            settings,
            f"FINCRA_{cfg}_BASE_URL",
            "https://api.fincra.com" if use_live else "https://sandboxapi.fincra.com",
        ).rstrip("/")

        if not self.secret_key or not self.public_key:
            raise ImproperlyConfigured("Fincra credentials are incomplete (public/secret key missing)")

    def _headers(self) -> Dict[str, str]:
        return {
            "accept": "application/json",
            "Content-Type": "application/json",
            "api-key": self.secret_key,
            "x-pub-key": self.public_key,
        }

    @staticmethod
    def _safe_json(resp: requests.Response) -> Dict[str, Any]:
        try:
            data = resp.json()
            return data if isinstance(data, dict) else {"data": data}
        except ValueError:
            text = (resp.text or "").strip()
            return {"raw": text[:2000]}

    def initiate_checkout(
        self,
        *,
        tx_ref: str,
        amount: str,
        currency: str,
        redirect_url: str,
        email: str,
        name: str,
        metadata: Dict[str, Any],
        fee_bearer: str = "customer",
    ) -> Dict[str, Any]:
        endpoint = f"{self.base_url}/checkout/payments"

        payload: Dict[str, Any] = {
            "reference": tx_ref,
            "amount": float(amount),
            "currency": currency,
            "redirectUrl": redirect_url,
            "feeBearer": fee_bearer,  # <-- use the param, don’t hardcode
            "customer": {"name": name, "email": email},
            "metadata": metadata,
            "paymentMethods": ["card"],
            "defaultPaymentMethod": "card",
        }

        headers = self._headers()  # <-- FIX: define headers

        try:
            resp = requests.post(endpoint, json=payload, headers=headers, timeout=self.timeout)
        except requests.RequestException:
            logger.exception("Fincra checkout initiation failed (network)")
            return {"status": "error", "message": "Provider request failed"}

        data = self._safe_json(resp)

        if resp.status_code not in (200, 201):
            logger.warning(
                "Fincra /checkout/payments failed status=%s response=%s payload=%s",
                resp.status_code,
                data,
                {**payload, "customer": {"name": name, "email": email}},  # keep readable
            )
            return {
                "status": "error",
                "message": (data.get("message") if isinstance(data, dict) else None) or "Payment initiation failed",
                "data": data,
                "http_status": resp.status_code,
            }

        inner = data.get("data") if isinstance(data, dict) else None
        link = None
        if isinstance(inner, dict):
            link = inner.get("link") or inner.get("checkoutLink") or inner.get("paymentLink")

        if not link:
            return {"status": "error", "message": "Provider did not return payment link", "data": data}

        return {"status": "success", "data": data, "link": link}

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        if not self.webhook_secret:
            logger.warning("Fincra webhook secret is missing; verification failed")
            return False

        try:
            payload_obj = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return False

        message = json.dumps(payload_obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        digest = hmac.new(self.webhook_secret.encode("utf-8"), message, hashlib.sha512).hexdigest()
        return hmac.compare_digest(digest, signature)

    def verify_by_reference(self, reference: str) -> Dict[str, Any]:
        """
        Verify a checkout payment by merchant reference.

        Endpoint:
            GET /checkout/payments/merchant-reference/{reference}
        """
        endpoint = f"{self.base_url}/checkout/payments/merchant-reference/{reference}"

        try:
            resp = requests.get(endpoint, headers=self._headers(), timeout=self.timeout)
        except requests.RequestException:
            logger.exception("Fincra checkout verification failed (network)")
            return {"status": "error", "message": "Provider request failed"}

        data = self._safe_json(resp)
        if resp.status_code != 200:
            logger.warning(
                "Fincra verification failed status=%s reference=%s response=%s",
                resp.status_code,
                reference,
                data,
            )
            return {
                "status": "error",
                "message": (data.get("message") if isinstance(data, dict) else None) or "Verification failed",
                "data": data,
                "http_status": resp.status_code,
            }

        return {"status": "success", "data": data}

    @staticmethod
    def extract_signature(headers: Any, meta: Dict[str, Any]) -> Optional[str]:
        for k in (
            "signature",
            "Signature",
            "x-fincra-signature",
            "X-Fincra-Signature",
            "fincra-signature",
            "Fincra-Signature",
        ):
            v = headers.get(k) if hasattr(headers, "get") else None
            if v:
                return v
        for k in ("HTTP_SIGNATURE", "HTTP_X_FINCRA_SIGNATURE", "HTTP_FINCRA_SIGNATURE"):
            v = meta.get(k)
            if v:
                return v
        return None
