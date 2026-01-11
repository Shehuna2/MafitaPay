import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

import requests
from django.conf import settings
from django. core.exceptions import ImproperlyConfigured

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
            use_live:  Whether to use live or test environment
        """
        if use_live:
            self. merchant_id = getattr(settings, "PALMPAY_MERCHANT_ID", None)
            self.app_id = getattr(settings, "PALMPAY_APP_ID", None)
            self.merchant_public_key = getattr(
                settings,
                "PALMPAY_MERCHANT_PUBLIC_KEY" if use_live else "PALMPAY_MERCHANT_PUBLIC_KEY",
            None)
            self.public_key = getattr(settings, "PALMPAY_PUBLIC_KEY", None)  # ← ADD THIS! 
            self.private_key = getattr(settings, "PALMPAY_PRIVATE_KEY", None)
            self.base_url = getattr(
                settings,
                "PALMPAY_BASE_URL",
                "https://open-gw-prod.palmpay-inc.com/api"
            )
            env_name = "LIVE"
        else:
            # Test credentials
            self.merchant_id = getattr(settings, "PALMPAY_TEST_MERCHANT_ID", None)
            self.app_id = getattr(settings, "PALMPAY_TEST_APP_ID", None)
            self.public_key = getattr(settings, "PALMPAY_TEST_PUBLIC_KEY", None)  # ← ADD THIS!
            self.merchant_public_key = getattr(
                settings,
                "PALMPAY_TEST_MERCHANT_PUBLIC_KEY" if use_live else "PALMPAY_TEST_MERCHANT_PUBLIC_KEY",
            None)
            self.private_key = getattr(settings, "PALMPAY_TEST_PRIVATE_KEY", None)
            self.base_url = getattr(
                settings,
                "PALMPAY_TEST_BASE_URL",
                "https://open-gw-daily.palmpay-inc.com/api"
            )
            env_name = "SANDBOX"

        # Validate required credentials
        missing = []
        if not self.merchant_id:
            missing.append("PALMPAY_MERCHANT_ID" if use_live else "PALMPAY_TEST_MERCHANT_ID")
        if not self. app_id:
            missing. append("PALMPAY_APP_ID" if use_live else "PALMPAY_TEST_APP_ID")
        if not self.public_key:  # ← ADD THIS CHECK!
            missing.append("PALMPAY_PUBLIC_KEY" if use_live else "PALMPAY_TEST_PUBLIC_KEY")
        if not self.merchant_public_key:
            missing.append("PALMPAY_MERCHANT_PUBLIC_KEY" if use_live else "PALMPAY_TEST_MERCHANT_PUBLIC_KEY")
        if not self.private_key:
            missing.append("PALMPAY_PRIVATE_KEY" if use_live else "PALMPAY_TEST_PRIVATE_KEY")

        if missing: 
            raise ImproperlyConfigured(
                f"Missing PalmPay credentials ({env_name}): {', '.join(missing)}"
            )

        self.base_url = str(self.base_url).rstrip("/")

        logger.info(
            "PalmpayService initialized (%s) with appId=%s merchantId=%s → %s",
            env_name,
            self.app_id,
            self.merchant_id,
            self.base_url,
        )

    # ---------------------------------------------------------
    # AUTHENTICATION
    # ---------------------------------------------------------
    def _generate_signature(self, payload: str, timestamp: str) -> str:
        message = f"{timestamp}{payload}".encode("utf-8")

        private_key = serialization.load_pem_private_key(
            self.private_key.encode("utf-8"),
            password=None,
        )

        signature = private_key.sign(
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )

        return base64.b64encode(signature).decode("utf-8")


    def _get_headers(self, payload: str) -> Dict[str, str]:
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(payload, timestamp)

        return {
            "Content-Type": "application/json;charset=UTF-8",
            "CountryCode": "NG",
            "Signature": signature,
            "Request-Time": timestamp,
            "Public-Key": self.public_key,  # FULL PEM
            "App-Id": self.app_id,
            "Merchant-Id": self.merchant_id,
        }


        return headers

    # ---------------------------------------------------------
    # VIRTUAL ACCOUNT CREATION
    # ---------------------------------------------------------
    def create_virtual_account(
        self,
        user,
        bvn: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a dedicated virtual account for a user.

        Args:
            user: Django user object
            bvn: Bank Verification Number (optional but recommended)

        Returns:
            Dictionary with virtual account details on success or error key on failure
        """
        try:
            profile = getattr(user, "profile", None)
            first_name = (
                profile.first_name. strip()
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
                "requestTime": int(time.time() * 1000),
                "identityType": "personal",
                "virtualAccountName": f"{first_name} {last_name}",
                "customerName": f"{first_name} {last_name}",
                "email": user.email,
                "nonceStr": str(uuid.uuid4()),
                "version": "V2.0",
                # Explicitly include app and merchant identifiers required by the gateway
                "appId": self.app_id,
                "merchantId": self.merchant_id,
            }

            if bvn: 
                payload_dict["bvn"] = bvn

            payload = json.dumps(payload_dict, separators=(",", ":"), ensure_ascii=False)
            headers = self._get_headers(payload)

            # Note: base_url already contains '/api' in defaults; endpoint path follows API docs
            endpoint = f"{self.base_url}/v2/virtual/account/label/create"

            logger.info(
                "Creating PalmPay virtual account for user %s with reference %s",
                user.email,
                reference
            )
            # Redact sensitive header values when logging
            redacted_headers = {k: ("<redacted>" if k in ("Authorization", "Signature") else v) for k, v in headers.items()}
            logger.debug("PalmPay request endpoint=%s payload=%s headers=%s", endpoint, payload, redacted_headers)

            response = requests.post(
                endpoint,
                data=payload. encode("utf-8"),
                headers=headers,
                timeout=self.timeout
            )

            # Always log the raw response text for debugging
            logger.debug("PalmPay response status=%s text=%s", response.status_code, response.text)

            # Try to parse JSON even on non-200 to get gateway error details
            try:
                data = response.json()
            except ValueError:
                data = {"raw_text": response.text}

            if response.status_code not in (200, 201):
                logger.error(
                    "PalmPay VA creation failed:  status=%d, response=%s",
                    response. status_code,
                    data
                )
                resp_code = data.get("respCode") or data.get("code") or ""
                resp_msg = data.get("respMsg") or data.get("message") or ""
                error_msg = f"PalmPay API error (status {response.status_code})"
                if resp_code or resp_msg:
                    error_msg = f"{error_msg}: {resp_code} {resp_msg}".strip()
                return {
                    "error": error_msg,
                    "raw_response": data,
                    "status_code": response.status_code
                }

            # Check response status:  many PalmPay endpoints use respCode/respMsg or success flags
            is_success = data.get("success", False) or data.get("code") == "0000" or data.get("respCode") in ("000000", "0", "0000")

            if not is_success: 
                resp_code = data.get("respCode") or data.get("code")
                resp_msg = data. get("respMsg") or data.get("message") or "PalmPay VA creation failed"
                logger.error("PalmPay VA creation failed:  %s", data)
                return {
                    "error": f"{resp_code or ''} {resp_msg}". strip(),
                    "raw_response": data
                }

            # Extract virtual account details from response
            va_data = data.get("data", {}) if isinstance(data, dict) else {}
            account_number = va_data.get("accountNumber") or va_data.get("account_number") or va_data.get("acctNo")

            if not account_number: 
                error_msg = "No account number in PalmPay response"
                logger.error("No account number in PalmPay response: %s", data)
                return {
                    "error":  error_msg,
                    "raw_response": data
                }

            return {
                "provider": "palmpay",
                "account_number": account_number,
                "bank_name": va_data.get("bankName") or va_data.get("bank_name") or "PalmPay",
                "account_name": va_data.get("accountName") or va_data.get("account_name") or f"{first_name} {last_name}",
                "reference": reference,
                "type": "static",
                "raw_response": data,
                "merchant_id": self.merchant_id,
                "app_id": self.app_id,
            }

        except requests.exceptions.RequestException as e:
            error_msg = f"Network error while creating PalmPay virtual account: {str(e)}"
            logger.error("PalmPay VA creation failed for user %s: %s", getattr(user, "email", "<unknown>"), error_msg)
            return {
                "error": error_msg
            }
        except Exception as e:
            error_msg = f"Failed to create PalmPay virtual account:  {str(e)}"
            logger.exception("PalmPay VA creation failed for user %s: %s", getattr(user, "email", "<unknown>"), str(e))
            return {
                "error": error_msg
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
