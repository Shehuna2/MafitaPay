"""
Tests for PalmPay error handling - specifically for network errors and None response handling.
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch, Mock
from decimal import Decimal
import requests

from .models import Wallet
from .services.palmpay_service import PalmpayService

User = get_user_model()


class PalmpayNetworkErrorHandlingTestCase(TestCase):
    """Test PalmPay service handles network errors gracefully"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("0.00"))

    @patch('wallet.services.palmpay_service.requests.post')
    def test_network_connection_error_returns_error_dict(self, mock_post):
        """Test that network connection errors return error dict instead of None"""
        # Simulate a connection error
        mock_post.side_effect = requests.exceptions.ConnectionError("Failed to connect")
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key, not None
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("network error", result["error"].lower())

    @patch('wallet.services.palmpay_service.requests.post')
    def test_timeout_error_returns_error_dict(self, mock_post):
        """Test that timeout errors return error dict instead of None"""
        # Simulate a timeout
        mock_post.side_effect = requests.exceptions.Timeout("Request timed out")
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key, not None
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("network error", result["error"].lower())

    @patch('wallet.services.palmpay_service.requests.post')
    def test_request_exception_returns_error_dict(self, mock_post):
        """Test that generic request exceptions return error dict instead of None"""
        # Simulate a generic request exception
        mock_post.side_effect = requests.exceptions.RequestException("Request failed")
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key, not None
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)

    @patch('wallet.services.palmpay_service.requests.post')
    def test_http_error_returns_error_dict(self, mock_post):
        """Test that HTTP errors (4xx, 5xx) return error dict with status code"""
        # Simulate a 500 error
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("500", result["error"])

    @patch('wallet.services.palmpay_service.requests.post')
    def test_api_failure_response_returns_error_dict(self, mock_post):
        """Test that API failures return error dict with message"""
        # Simulate an API failure response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": False,
            "code": "1001",
            "message": "Invalid merchant credentials"
        }
        mock_post.return_value = mock_response
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("Invalid merchant credentials", result["error"])

    @patch('wallet.services.palmpay_service.requests.post')
    def test_missing_account_number_returns_error_dict(self, mock_post):
        """Test that missing account number returns error dict"""
        # Simulate a success response but without account number
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": True,
            "code": "0000",
            "data": {
                # Missing accountNumber
            }
        }
        mock_post.return_value = mock_response
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return a dict with error key
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertIn("error", result)
        self.assertIn("No account number", result["error"])

    @patch('wallet.services.palmpay_service.requests.post')
    def test_successful_creation_returns_account_details(self, mock_post):
        """Test that successful creation returns account details without error key"""
        # Simulate a successful response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "success": True,
            "code": "0000",
            "data": {
                "accountNumber": "1234567890",
                "bankName": "PalmPay",
                "accountName": "Test User"
            }
        }
        mock_post.return_value = mock_response
        
        service = PalmpayService(use_live=False)
        result = service.create_virtual_account(user=self.user)
        
        # Should return account details
        self.assertIsNotNone(result)
        self.assertIsInstance(result, dict)
        self.assertNotIn("error", result)
        self.assertEqual(result["account_number"], "1234567890")
        self.assertEqual(result["provider"], "palmpay")
