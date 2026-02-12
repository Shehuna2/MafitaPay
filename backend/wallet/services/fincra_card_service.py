import hashlib
import hmac
import logging
from typing import Any, Dict

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FincraCardService:
    timeout = 60

    def __init__(self, use_live: bool = False):
        cfg = "LIVE" if use_live else "TEST"
        self.public_key = getattr(settings, f"FINCRA_{cfg}_PUBLIC_KEY", None)
        self.secret_key = getattr(settings, f"FINCRA_{cfg}_SECRET_KEY", None)
        self.webhook_secret = getattr(settings, f"FINCRA_{cfg}_WEBHOOK_SECRET", None)
        self.base_url = getattr(settings, f"FINCRA_{cfg}_BASE_URL", "https://api.fincra.com").rstrip("/")

        if not self.secret_key:
            raise ImproperlyConfigured("Fincra credentials are incomplete")

    def initiate_checkout(
        self,
        *,
        tx_ref: str,
        amount: str,
        redirect_url: str,
        email: str,
        name: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        endpoint = f"{self.base_url}/checkout/payments"
        payload = {
            "reference": tx_ref,
            "amount": amount,
            "currency": "NGN",
            "redirectUrl": redirect_url,
            "customer": {
                "name": name,
                "email": email,
            },
            "metadata": metadata,
            "paymentMethods": ["card"],
        }
        headers = {
            "api-key": self.public_key or "",
            "x-pub-key": self.public_key or "",
            "x-secret-key": self.secret_key,
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=self.timeout)
            data = response.json()
        except requests.RequestException:
            logger.exception("Fincra checkout initiation failed")
            return {"status": "error", "message": "Provider request failed"}
        except ValueError:
            logger.exception("Fincra checkout returned non-JSON response")
            return {"status": "error", "message": "Invalid provider response"}

        if response.status_code not in (200, 201):
            return {
                "status": "error",
                "message": data.get("message", "Payment initiation failed"),
                "data": data,
            }

        checkout_data = data.get("data", data)
        link = (
            checkout_data.get("checkoutLink")
            or checkout_data.get("link")
            or checkout_data.get("authorization_url")
            or checkout_data.get("paymentLink")
        )

        if not link:
            return {
                "status": "error",
                "message": "Provider did not return payment link",
                "data": data,
            }

        return {"status": "success", "data": data, "link": link}

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        if not self.webhook_secret:
            logger.warning("Fincra webhook secret is missing; verification failed")
            return False

        digest = hmac.new(
            self.webhook_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(digest, signature)
