"""
Tests for PalmPay view error handling - specifically for None response and error message handling.
"""
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from unittest.mock import patch, Mock
from decimal import Decimal
import json

from .models import Wallet

User = get_user_model()


class PalmpayViewErrorHandlingTestCase(TestCase):
    """Test PalmPay view handles service errors gracefully"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("0.00"))
        self.client.force_login(self.user)

    @patch('wallet.views.PalmpayService')
    def test_none_response_returns_500(self, mock_palmpay_service):
        """Test that None response from service returns 500 error"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = None
        mock_palmpay_service.return_value = mock_service
        
        response = self.client.post(
            '/api/wallet/generate-va/',
            data=json.dumps({"provider": "palmpay"}),
            content_type='application/json'
        )
        
        # Should return 500 for None response
        self.assertEqual(response.status_code, 500)
        response_data = response.json()
        self.assertIn("error", response_data)
        self.assertIn("no response", response_data["error"].lower())

    @patch('wallet.views.PalmpayService')
    def test_network_error_returns_500(self, mock_palmpay_service):
        """Test that network errors return 500 status code"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = {
            "error": "Network error while creating PalmPay virtual account: Connection refused"
        }
        mock_palmpay_service.return_value = mock_service
        
        response = self.client.post(
            '/api/wallet/generate-va/',
            data=json.dumps({"provider": "palmpay"}),
            content_type='application/json'
        )
        
        # Should return 500 for network errors
        self.assertEqual(response.status_code, 500)
        response_data = response.json()
        self.assertIn("error", response_data)
        self.assertIn("network error", response_data["error"].lower())

    @patch('wallet.views.PalmpayService')
    def test_timeout_error_returns_500(self, mock_palmpay_service):
        """Test that timeout errors return 500 status code"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = {
            "error": "Network error while creating PalmPay virtual account: Request timed out"
        }
        mock_palmpay_service.return_value = mock_service
        
        response = self.client.post(
            '/api/wallet/generate-va/',
            data=json.dumps({"provider": "palmpay"}),
            content_type='application/json'
        )
        
        # Should return 500 for timeout errors
        self.assertEqual(response.status_code, 500)
        response_data = response.json()
        self.assertIn("error", response_data)
        self.assertIn("timeout", response_data["error"].lower())

    @patch('wallet.views.PalmpayService')
    def test_api_error_returns_400(self, mock_palmpay_service):
        """Test that API errors (non-network) return 400 status code"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = {
            "error": "Invalid merchant credentials"
        }
        mock_palmpay_service.return_value = mock_service
        
        response = self.client.post(
            '/api/wallet/generate-va/',
            data=json.dumps({"provider": "palmpay"}),
            content_type='application/json'
        )
        
        # Should return 400 for API errors
        self.assertEqual(response.status_code, 400)
        response_data = response.json()
        self.assertIn("error", response_data)
        self.assertEqual(response_data["error"], "Invalid merchant credentials")

    @patch('wallet.views.PalmpayService')
    def test_no_attribute_error_on_none_response(self, mock_palmpay_service):
        """Test that None response does not cause AttributeError"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = None
        mock_palmpay_service.return_value = mock_service
        
        # This should not raise AttributeError
        try:
            response = self.client.post(
                '/api/wallet/generate-va/',
                data=json.dumps({"provider": "palmpay"}),
                content_type='application/json'
            )
            # If we get here, no AttributeError was raised
            self.assertEqual(response.status_code, 500)
        except AttributeError as e:
            self.fail(f"AttributeError was raised: {e}")

    @patch('wallet.views.PalmpayService')
    def test_successful_creation(self, mock_palmpay_service):
        """Test that successful creation works correctly"""
        mock_service = Mock()
        mock_service.create_virtual_account.return_value = {
            "provider": "palmpay",
            "account_number": "1234567890",
            "bank_name": "PalmPay",
            "account_name": "Test User",
            "reference": "test_ref_123",
            "type": "static",
            "raw_response": {},
            "merchant_id": "test_merchant"
        }
        mock_palmpay_service.return_value = mock_service
        
        response = self.client.post(
            '/api/wallet/generate-va/',
            data=json.dumps({"provider": "palmpay"}),
            content_type='application/json'
        )
        
        # Should return 201 for successful creation
        self.assertEqual(response.status_code, 201)
        response_data = response.json()
        self.assertIn("account_number", response_data)
        self.assertEqual(response_data["account_number"], "1234567890")
