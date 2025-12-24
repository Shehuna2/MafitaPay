# wallet/services/palmpay_service.py

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Optional, Dict, Any

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)

# Constants
DEFAULT_PHONE_NUMBER = "+2340000000000"


class PalmpayService:
    """PalmPay Virtual Account Service for Nigerian merchants."""

    timeout = 60

    def __init__(self, use_live: bool = False):
        """
        Initialize PalmPay service with credentials.
        
        Args:
            use_live: Whether to use live or test environment
        """
        if use_live:
            self.merchant_id = getattr(settings, "PALMPAY_MERCHANT_ID")
            self.public_key = getattr(settings, "PALMPAY_PUBLIC_KEY")
            self.private_key = getattr(settings, "PALMPAY_PRIVATE_KEY")
            self.base_url = getattr(
                settings,
                "PALMPAY_BASE_URL",
                "https://api.palmpay.com"
            )
        else:
            # Test credentials (if different from live)
            self.merchant_id = getattr(settings, "PALMPAY_TEST_MERCHANT_ID", 
                                      getattr(settings, "PALMPAY_MERCHANT_ID"))
            self.public_key = getattr(settings, "PALMPAY_TEST_PUBLIC_KEY",
                                     getattr(settings, "PALMPAY_PUBLIC_KEY"))
            self.private_key = getattr(settings, "PALMPAY_TEST_PRIVATE_KEY",
                                      getattr(settings, "PALMPAY_PRIVATE_KEY"))
            self.base_url = getattr(
                settings,
                "PALMPAY_TEST_BASE_URL",
                getattr(settings, "PALMPAY_BASE_URL", "https://api-sandbox.palmpay.com")
            )

        if not self.merchant_id or not self.private_key:
            missing = []
            if not self.merchant_id:
                missing.append("PALMPAY_MERCHANT_ID")
            if not self.private_key:
                missing.append("PALMPAY_PRIVATE_KEY")
            raise ImproperlyConfigured(
                f"Missing PalmPay credentials: {', '.join(missing)}"
            )

        self.base_url = str(self.base_url).rstrip("/")

        logger.info(
            "PalmpayService initialized (%s) → %s",
            "LIVE" if use_live else "SANDBOX",
            self.base_url,
        )

    # ---------------------------------------------------------
    # AUTHENTICATION
    # ---------------------------------------------------------
    def _generate_signature(self, payload: str, timestamp: str) -> str:
        """
        Generate HMAC signature for PalmPay API requests.
        
        Args:
            payload: JSON string of the request body
            timestamp: Request timestamp
            
        Returns:
            Base64-encoded HMAC signature
        """
        try:
            message = f"{timestamp}{payload}"
            signature = hmac.new(
                self.private_key.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256
            ).digest()
            return base64.b64encode(signature).decode("utf-8")
        except Exception as e:
            logger.error("Failed to generate PalmPay signature: %s", str(e))
            raise

    def _get_headers(self, payload: str) -> Dict[str, str]:
        """
        Generate headers for PalmPay API requests.
        
        Args:
            payload: JSON string of the request body
            
        Returns:
            Dictionary of headers
        """
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(payload, timestamp)
        
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.public_key}",
            "X-Merchant-Id": self.merchant_id,
            "X-Timestamp": timestamp,
            "X-Signature": signature,
        }

    # ---------------------------------------------------------
    # VIRTUAL ACCOUNT CREATION
    # ---------------------------------------------------------
    def create_virtual_account(
        self,
        user,
        bvn: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Create a dedicated virtual account for a user.
        
        Args:
            user: Django user object
            bvn: Bank Verification Number (optional but recommended)
            
        Returns:
            Dictionary with virtual account details or None on failure
        """
        try:
            profile = getattr(user, "profile", None)
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
            phone_number = getattr(profile, "phone_number", None) or DEFAULT_PHONE_NUMBER

            # Generate unique reference
            reference = f"palmpay_va_{uuid.uuid4().hex[:12]}"

            payload_dict = {
                "merchantId": self.merchant_id,
                "reference": reference,
                "customerName": f"{first_name} {last_name}",
                "customerEmail": user.email,
                "customerPhone": phone_number,
                "accountType": "STATIC",  # Static virtual account
                "currency": "NGN",
            }

            # Add BVN if provided
            if bvn:
                payload_dict["bvn"] = bvn

            payload = json.dumps(payload_dict)
            headers = self._get_headers(payload)

            endpoint = f"{self.base_url}/api/v1/virtual-account/create"

            logger.info(
                "Creating PalmPay virtual account for user %s with reference %s",
                user.email,
                reference
            )

            response = requests.post(
                endpoint,
                data=payload,
                headers=headers,
                timeout=self.timeout
            )

            if response.status_code not in (200, 201):
                logger.error(
                    "PalmPay VA creation failed: status=%d, response=%s",
                    response.status_code,
                    response.text
                )
                return None

            data = response.json()
            
            # Check response status
            if not data.get("success", False) and data.get("code") != "0000":
                logger.error("PalmPay VA creation failed: %s", data)
                return None

            # Extract virtual account details from response
            va_data = data.get("data", {})
            account_number = va_data.get("accountNumber") or va_data.get("account_number")
            
            if not account_number:
                logger.error("No account number in PalmPay response: %s", data)
                return None

            return {
                "provider": "palmpay",
                "account_number": account_number,
                "bank_name": va_data.get("bankName") or va_data.get("bank_name") or "PalmPay",
                "account_name": va_data.get("accountName") or va_data.get("account_name") or f"{first_name} {last_name}",
                "reference": reference,
                "type": "static",
                "raw_response": data,
                "merchant_id": self.merchant_id,
            }

        except Exception as e:
            logger.exception("PalmPay VA creation failed for user %s: %s", user.email, str(e))
            return None

    # ---------------------------------------------------------
    # WEBHOOK VERIFICATION
    # ---------------------------------------------------------
    def verify_webhook_signature(self, raw_body: bytes, signature: str, timestamp: str) -> bool:
        """
        Verify PalmPay webhook signature.
        
        Args:
            raw_body: Raw request body bytes
            signature: Signature from webhook header
            timestamp: Timestamp from webhook header
            
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
            message = f"{timestamp}{raw_body.decode('utf-8')}"
            computed_signature = base64.b64encode(
                hmac.new(
                    self.private_key.encode("utf-8"),
                    message.encode("utf-8"),
                    hashlib.sha256
                ).digest()
            ).decode("utf-8")

            # Compare signatures
            if hmac.compare_digest(signature.strip(), computed_signature):
                logger.debug("PalmPay webhook signature verified successfully.")
                return True

            logger.warning(
                "PalmPay webhook signature verification failed. "
                "Computed signature does not match received signature."
            )
            return False

        except (UnicodeDecodeError, TypeError, ValueError) as e:
            logger.warning("PalmPay signature verification failed with error: %s", str(e))
            return False
