# wallet/services/flutterwave_card_service.py

import base64
import hashlib
import hmac
import logging
import time
import uuid
from typing import Optional, Dict, Any
from decimal import Decimal
from Crypto.Cipher import DES3
from Crypto.Util.Padding import pad

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class FlutterwaveCardService:
    """Flutterwave Card Charge Service with 3D Secure support."""

    timeout = 60

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
        self.use_live = use_live

        self.access_token: Optional[str] = None
        self.token_expiry_ts: float = 0

        logger.info(
            "FlutterwaveCardService initialized (%s) → %s",
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
    # CARD ENCRYPTION (3DES)
    # ---------------------------------------------------------
    def encrypt_card_data(self, card_data: Dict[str, str]) -> str:
        """
        Encrypt card data using 3DES encryption with the encryption key.
        This is required for PCI-DSS compliance.
        """
        if not self.encryption_key:
            raise ImproperlyConfigured("Encryption key is required for card transactions")

        # Convert card data to JSON string
        import json
        plaintext = json.dumps(card_data)
        
        # Validate and get the encryption key (must be 24 bytes for 3DES)
        key_bytes = self.encryption_key.encode('utf-8')
        if len(key_bytes) < 24:
            raise ImproperlyConfigured("Encryption key must be at least 24 bytes")
        # Use first 24 bytes for 3DES
        key = key_bytes[:24]
        
        # Pad plaintext to multiple of 8 bytes
        plaintext_bytes = plaintext.encode('utf-8')
        padded = pad(plaintext_bytes, DES3.block_size)
        
        # Encrypt using 3DES in ECB mode
        cipher = DES3.new(key, DES3.MODE_ECB)
        encrypted = cipher.encrypt(padded)
        
        # Return base64 encoded string
        return base64.b64encode(encrypted).decode('utf-8')

    # ---------------------------------------------------------
    # CARD CHARGE
    # ---------------------------------------------------------
    def charge_card(
        self,
        amount: Decimal,
        currency: str,
        email: str,
        tx_ref: str,
        card_number: str,
        cvv: str,
        expiry_month: str,
        expiry_year: str,
        fullname: str,
        redirect_url: str,
    ) -> Dict[str, Any]:
        """
        Initiate a card charge with 3D Secure support.
        
        Args:
            amount: Transaction amount in the specified currency
            currency: Currency code (EUR, USD, GBP)
            email: Customer email
            tx_ref: Unique transaction reference
            card_number: Card number (will be encrypted)
            cvv: Card CVV (will be encrypted)
            expiry_month: Card expiry month (MM)
            expiry_year: Card expiry year (YY or YYYY)
            fullname: Cardholder full name
            redirect_url: URL to redirect after 3D Secure authentication
            
        Returns:
            Dictionary with charge response
        """
        token = self.get_access_token()
        if not token:
            logger.error("Failed to get access token for card charge")
            return {"status": "error", "message": "Authentication failed"}

        # Prepare card data for encryption
        card_data = {
            "cardno": card_number.replace(" ", ""),
            "cvv": cvv,
            "expirymonth": expiry_month,
            "expiryyear": expiry_year,
        }

        try:
            # Encrypt card data
            encrypted_card = self.encrypt_card_data(card_data)
        except Exception as e:
            logger.error(f"Failed to encrypt card data: {str(e)}", exc_info=True)
            return {"status": "error", "message": "Card encryption failed"}

        # Prepare charge payload
        payload = {
            "tx_ref": tx_ref,
            "amount": str(amount),
            "currency": currency,
            "email": email,
            "fullname": fullname,
            "client": encrypted_card,
            "redirect_url": redirect_url,
            "payment_type": "card",
        }

        endpoint = f"{self.base_url}/charges?type=card"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            logger.info(f"Initiating card charge: tx_ref={tx_ref}, amount={amount} {currency}")
            resp = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            
            response_data = resp.json()
            logger.info(f"Card charge response: {response_data}")

            if resp.status_code not in (200, 201):
                logger.error(f"Card charge failed: {response_data}")
                return {
                    "status": "error",
                    "message": response_data.get("message", "Charge failed"),
                    "data": response_data,
                }

            # Return response data
            return {
                "status": "success",
                "data": response_data.get("data", response_data),
            }

        except requests.exceptions.Timeout:
            logger.error(f"Card charge timeout for tx_ref={tx_ref}")
            return {"status": "error", "message": "Request timeout"}
        except Exception as e:
            logger.error(f"Card charge exception: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e)}

    # ---------------------------------------------------------
    # VERIFY TRANSACTION
    # ---------------------------------------------------------
    def verify_transaction(self, tx_ref: str) -> Dict[str, Any]:
        """
        Verify a transaction by transaction reference.
        
        Args:
            tx_ref: Transaction reference
            
        Returns:
            Dictionary with verification response
        """
        token = self.get_access_token()
        if not token:
            logger.error("Failed to get access token for transaction verification")
            return {"status": "error", "message": "Authentication failed"}

        endpoint = f"{self.base_url}/transactions/verify_by_reference?tx_ref={tx_ref}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            logger.info(f"Verifying transaction: tx_ref={tx_ref}")
            resp = requests.get(endpoint, headers=headers, timeout=self.timeout)
            
            response_data = resp.json()
            logger.info(f"Verification response: {response_data}")

            if resp.status_code != 200:
                logger.error(f"Verification failed: {response_data}")
                return {
                    "status": "error",
                    "message": response_data.get("message", "Verification failed"),
                    "data": response_data,
                }

            return {
                "status": "success",
                "data": response_data.get("data", response_data),
            }

        except Exception as e:
            logger.error(f"Verification exception: {str(e)}", exc_info=True)
            return {"status": "error", "message": str(e)}

    # ---------------------------------------------------------
    # WEBHOOK SIGNATURE VERIFICATION
    # ---------------------------------------------------------
    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Verify webhook signature to ensure it came from Flutterwave.
        
        Args:
            payload: Raw webhook payload bytes
            signature: Signature from webhook headers
            
        Returns:
            True if signature is valid, False otherwise
        """
        if not self.hash_secret:
            logger.error("Hash secret not configured for webhook verification")
            return False

        try:
            # Compute expected signature
            expected = hmac.new(
                self.hash_secret.encode('utf-8'),
                payload,
                hashlib.sha256
            ).hexdigest()
            
            # Compare signatures
            return hmac.compare_digest(expected, signature)
        except Exception as e:
            logger.error(f"Webhook signature verification error: {str(e)}", exc_info=True)
            return False
