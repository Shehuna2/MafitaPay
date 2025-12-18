"""
Security-focused tests for Flutterwave integration
"""
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from decimal import Decimal
import json
import hmac
import hashlib
import base64
from unittest.mock import patch

from .models import Wallet, VirtualAccount, Deposit
from .services.flutterwave_service import FlutterwaveService
from .webhooks import MAX_WEBHOOK_SIZE, MAX_AMOUNT

User = get_user_model()


class FlutterwaveSecurityTestCase(TestCase):
    """Test security features of Flutterwave webhook"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="security@test.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("0.00"))
        self.virtual_account = VirtualAccount.objects.create(
            user=self.user,
            provider="flutterwave",
            provider_account_id="test_ref_sec",
            account_number="9876543210",
            bank_name="Wema Bank",
            account_name="Security Test",
        )

    def test_webhook_payload_size_limit(self):
        """Test that webhook rejects payloads larger than MAX_WEBHOOK_SIZE"""
        # Create a payload just over the maximum allowed size
        large_payload = json.dumps({
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_large",
                "account_number": "9876543210",
                "amount": 1000,
                "status": "success",
                "padding": "x" * (MAX_WEBHOOK_SIZE + 1000)  # Exceed limit
            }
        }).encode()

        response = self.client.post(
            '/api/wallet/flutterwave-webhook/',
            data=large_payload,
            content_type='application/json',
            HTTP_VERIF_HASH="dummy-signature"
        )

        self.assertEqual(response.status_code, 413)
        self.assertIn("payload too large", response.json().get("error", "").lower())

    def test_webhook_hash_secret_validation(self):
        """Test that webhook fails gracefully when hash secret is not configured"""
        payload = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_no_secret",
                "account_number": "9876543210",
                "amount": 1000,
                "status": "success"
            }
        }
        payload_bytes = json.dumps(payload).encode()

        with patch.object(FlutterwaveService, '__init__', return_value=None):
            with patch.object(FlutterwaveService, 'hash_secret', None):
                response = self.client.post(
                    '/api/wallet/flutterwave-webhook/',
                    data=payload_bytes,
                    content_type='application/json',
                    HTTP_VERIF_HASH="some-signature"
                )

                # Should return 500 configuration error
                self.assertEqual(response.status_code, 500)
                self.assertIn("configuration error", response.json().get("error", "").lower())

    def test_maximum_amount_validation(self):
        """Test that unrealistically large amounts are rejected"""
        test_hash_secret = "test_hash_secret_12345"

        payload = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_huge_amount",
                "account_number": "9876543210",
                "amount": 99999999999,  # Way over 10M NGN limit
                "status": "success"
            }
        }

        payload_bytes = json.dumps(payload).encode()

        # Compute correct signature
        dig = hmac.new(
            test_hash_secret.encode(),
            payload_bytes,
            hashlib.sha256
        ).digest()
        signature = base64.b64encode(dig).decode()

        from django.conf import settings
        with patch.object(settings, 'FLW_LIVE_HASH_SECRET', test_hash_secret):
            response = self.client.post(
                '/api/wallet/flutterwave-webhook/',
                data=payload_bytes,
                content_type='application/json',
                HTTP_VERIF_HASH=signature
            )

            # Should be ignored due to excessive amount
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json().get("status"), "ignored")

            # Wallet should not be credited
            self.wallet.refresh_from_db()
            self.assertEqual(self.wallet.balance, Decimal("0.00"))

    def test_negative_amount_rejected(self):
        """Test that negative amounts are rejected"""
        test_hash_secret = "test_hash_secret_12345"

        payload = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_negative",
                "account_number": "9876543210",
                "amount": -1000,  # Negative amount
                "status": "success"
            }
        }

        payload_bytes = json.dumps(payload).encode()
        dig = hmac.new(test_hash_secret.encode(), payload_bytes, hashlib.sha256).digest()
        signature = base64.b64encode(dig).decode()

        from django.conf import settings
        with patch.object(settings, 'FLW_LIVE_HASH_SECRET', test_hash_secret):
            response = self.client.post(
                '/api/wallet/flutterwave-webhook/',
                data=payload_bytes,
                content_type='application/json',
                HTTP_VERIF_HASH=signature
            )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json().get("status"), "ignored")


class FlutterwaveBVNValidationTestCase(TestCase):
    """Test BVN/NIN validation in VA creation"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="bvntest@test.com",
            password="testpass123"
        )
        self.client.force_authenticate(user=self.user)

    def test_invalid_bvn_too_short(self):
        """Test that BVN with fewer than 11 digits is rejected"""
        response = self.client.post(
            '/api/wallet/generate-dva/',
            {
                "provider": "flutterwave",
                "bvn_or_nin": "12345"  # Too short
            },
            format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid", response.json().get("error", "").lower())

    def test_invalid_bvn_too_long(self):
        """Test that BVN with more than 12 digits is rejected"""
        response = self.client.post(
            '/api/wallet/generate-dva/',
            {
                "provider": "flutterwave",
                "bvn_or_nin": "1234567890123"  # 13 digits - too long
            },
            format='json'
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid", response.json().get("error", "").lower())

    def test_valid_bvn_format(self):
        """Test that valid 11-digit BVN passes validation"""
        with patch('wallet.views.FlutterwaveService') as mock_fw:
            mock_fw.return_value.create_static_virtual_account.return_value = None

            response = self.client.post(
                '/api/wallet/generate-dva/',
                {
                    "provider": "flutterwave",
                    "bvn_or_nin": "12345678901"  # 11 digits - valid BVN
                },
                format='json'
            )

            # Should not fail validation (may fail for other reasons like API error)
            # The important thing is it doesn't return the "Invalid BVN/NIN format" error
            if response.status_code == 400:
                error = response.json().get("error", "")
                self.assertNotIn("invalid bvn/nin format", error.lower())

    def test_valid_nin_format(self):
        """Test that valid 12-digit NIN passes validation"""
        with patch('wallet.views.FlutterwaveService') as mock_fw:
            mock_fw.return_value.create_static_virtual_account.return_value = None

            response = self.client.post(
                '/api/wallet/generate-dva/',
                {
                    "provider": "flutterwave",
                    "bvn_or_nin": "123456789012"  # 12 digits - valid NIN
                },
                format='json'
            )

            if response.status_code == 400:
                error = response.json().get("error", "")
                self.assertNotIn("invalid bvn/nin format", error.lower())


class FlutterwaveHashSecretValidationTestCase(TestCase):
    """Test hash secret validation in FlutterwaveService"""

    def test_verify_webhook_signature_with_no_hash_secret(self):
        """Test that verification fails and logs when hash secret is missing"""
        with patch('wallet.services.flutterwave_service.settings') as mock_settings:
            mock_settings.FLW_TEST_HASH_SECRET = None
            mock_settings.FLW_TEST_CLIENT_ID = "test"
            mock_settings.FLW_TEST_CLIENT_SECRET = "test"
            mock_settings.FLW_TEST_ENCRYPTION_KEY = "test"

            fw_service = FlutterwaveService(use_live=False)
            fw_service.hash_secret = None  # Explicitly set to None

            result = fw_service.verify_webhook_signature(b"test payload", "signature")

            self.assertFalse(result, "Should return False when hash secret is missing")

    def test_verify_webhook_signature_with_empty_signature(self):
        """Test that verification fails when signature is empty"""
        with patch('wallet.services.flutterwave_service.settings') as mock_settings:
            mock_settings.FLW_TEST_HASH_SECRET = "test_secret"
            mock_settings.FLW_TEST_CLIENT_ID = "test"
            mock_settings.FLW_TEST_CLIENT_SECRET = "test"
            mock_settings.FLW_TEST_ENCRYPTION_KEY = "test"

            fw_service = FlutterwaveService(use_live=False)
            fw_service.hash_secret = "test_secret"

            result = fw_service.verify_webhook_signature(b"test payload", "")

            self.assertFalse(result, "Should return False when signature is empty")
