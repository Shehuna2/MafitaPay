# wallet/test_card_deposit.py
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from decimal import Decimal
import json
import hmac
import hashlib
from unittest.mock import patch, MagicMock

from .models import Wallet, CardDepositExchangeRate, CardDeposit
from .services.flutterwave_card_service import FlutterwaveCardService

User = get_user_model()


class CardDepositExchangeRateTestCase(TestCase):
    """Test CardDepositExchangeRate model"""

    def setUp(self):
        self.rate = CardDepositExchangeRate.objects.create(
            currency='USD',
            rate=Decimal('1500.00'),
            flutterwave_fee_percent=Decimal('1.4'),
            platform_margin_percent=Decimal('0.5')
        )

    def test_exchange_rate_creation(self):
        """Test exchange rate creation"""
        self.assertEqual(self.rate.currency, 'USD')
        self.assertEqual(self.rate.rate, Decimal('1500.00'))

    def test_calculate_ngn_amount(self):
        """Test NGN amount calculation"""
        result = self.rate.calculate_ngn_amount(100)
        
        # 100 USD * 1500 = 150,000 NGN (gross)
        self.assertEqual(result['gross_ngn'], Decimal('150000.00'))
        
        # Flutterwave fee: 150,000 * 0.014 = 2,100 NGN
        self.assertEqual(result['flutterwave_fee'], Decimal('2100.00'))
        
        # Platform margin: 150,000 * 0.005 = 750 NGN
        self.assertEqual(result['platform_margin'], Decimal('750.00'))
        
        # Net amount: 150,000 - 2,100 - 750 = 147,150 NGN
        self.assertEqual(result['net_amount'], Decimal('147150.00'))

    def test_unique_currency(self):
        """Test currency uniqueness constraint"""
        with self.assertRaises(Exception):
            CardDepositExchangeRate.objects.create(
                currency='USD',  # Already exists
                rate=Decimal('1600.00')
            )


class CardDepositPermissionTestCase(TestCase):
    """Test IsMerchantOrSuperUser permission"""

    def setUp(self):
        self.client = Client()
        self.regular_user = User.objects.create_user(
            email="regular@example.com",
            password="testpass123",
            is_merchant=False
        )
        self.merchant_user = User.objects.create_user(
            email="merchant@example.com",
            password="testpass123",
            is_merchant=True
        )
        self.superuser = User.objects.create_superuser(
            email="admin@example.com",
            password="testpass123"
        )
        
        # Create exchange rate for testing
        CardDepositExchangeRate.objects.create(
            currency='USD',
            rate=Decimal('1500.00')
        )

    def test_regular_user_denied(self):
        """Test that regular users cannot access card deposit"""
        # Use token authentication instead of session
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.regular_user)
        
        response = client.post('/api/wallet/card-deposit/initiate/', {
            'currency': 'USD',
            'amount': '100'
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_merchant_allowed(self):
        """Test that merchant users can access card deposit"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.merchant_user)
        
        # This will fail due to missing fields, but permission should pass
        response = client.post('/api/wallet/card-deposit/initiate/', {
            'currency': 'USD',
            'amount': '100'
        }, format='json')
        # Should not be 403 (forbidden)
        self.assertNotEqual(response.status_code, 403)

    def test_superuser_allowed(self):
        """Test that superusers can access card deposit"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.superuser)
        
        # This will fail due to missing fields, but permission should pass
        response = client.post('/api/wallet/card-deposit/initiate/', {
            'currency': 'USD',
            'amount': '100'
        }, format='json')
        # Should not be 403 (forbidden)
        self.assertNotEqual(response.status_code, 403)


class CardDepositExchangeRateViewTestCase(TestCase):
    """Test exchange rate calculation endpoint"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        # Wallet is created automatically via signal
        
        self.rate_usd = CardDepositExchangeRate.objects.create(
            currency='USD',
            rate=Decimal('1500.00'),
            flutterwave_fee_percent=Decimal('1.4'),
            platform_margin_percent=Decimal('0.5')
        )
        self.rate_eur = CardDepositExchangeRate.objects.create(
            currency='EUR',
            rate=Decimal('1650.00'),
            flutterwave_fee_percent=Decimal('1.4'),
            platform_margin_percent=Decimal('0.5')
        )

    def test_get_all_rates(self):
        """Test getting all exchange rates"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        response = client.get('/api/wallet/card-deposit/calculate-rate/')
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(len(data['rates']), 2)

    def test_calculate_rate(self):
        """Test calculating NGN amount"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        response = client.post(
            '/api/wallet/card-deposit/calculate-rate/',
            {'currency': 'USD', 'amount': '100'},
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['currency'], 'USD')
        self.assertEqual(data['amount'], '100')
        self.assertEqual(Decimal(data['gross_ngn']), Decimal('150000.00'))

    def test_calculate_invalid_currency(self):
        """Test calculation with invalid currency"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        response = client.post(
            '/api/wallet/card-deposit/calculate-rate/',
            {'currency': 'NGN', 'amount': '100'},  # NGN not allowed
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn('Invalid currency', data['error'])

    def test_calculate_invalid_amount(self):
        """Test calculation with invalid amount"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)
        
        response = client.post(
            '/api/wallet/card-deposit/calculate-rate/',
            {'currency': 'USD', 'amount': 'invalid'},
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn('Invalid amount', data['error'])

    def test_unauthenticated_access(self):
        """Test that unauthenticated users cannot access"""
        from rest_framework.test import APIClient
        client = APIClient()
        
        response = client.get('/api/wallet/card-deposit/calculate-rate/')
        self.assertEqual(response.status_code, 401)


class CardDepositInitiateTestCase(TestCase):
    """Test card deposit initiation"""

    def setUp(self):
        self.merchant = User.objects.create_user(
            email="merchant@example.com",
            password="testpass123",
            is_merchant=True
        )
        # Wallet created automatically via signal
        
        CardDepositExchangeRate.objects.create(
            currency='USD',
            rate=Decimal('1500.00')
        )

    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_initiate_card_deposit(self, mock_fw_service):
        """Test successful card deposit initiation"""
        from rest_framework.test import APIClient
        
        # Mock Flutterwave service
        mock_instance = MagicMock()
        mock_instance.charge_card.return_value = {
            'status': 'success',
            'data': {
                'id': 'flw_123456',
                'tx_ref': 'CARD_1_ABC123',
                'link': 'https://checkout.flutterwave.com/3ds',
                'card': {
                    'last4digits': '1234',
                    'type': 'visa'
                }
            }
        }
        mock_fw_service.return_value = mock_instance
        
        client = APIClient()
        client.force_authenticate(user=self.merchant)
        
        response = client.post(
            '/api/wallet/card-deposit/initiate/',
            {
                'currency': 'USD',
                'amount': '100',
                'card_number': '4242424242424242',
                'cvv': '123',
                'expiry_month': '12',
                'expiry_year': '25',
                'fullname': 'Test User',
                'use_live': False
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertIn('tx_ref', data)
        self.assertIn('authorization_url', data)

    def test_initiate_missing_fields(self):
        """Test initiation with missing required fields"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.merchant)
        
        response = client.post(
            '/api/wallet/card-deposit/initiate/',
            {'currency': 'USD', 'amount': '100'},
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn('Missing required fields', data['error'])

    def test_initiate_invalid_currency(self):
        """Test initiation with NGN currency (not allowed)"""
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.merchant)
        
        response = client.post(
            '/api/wallet/card-deposit/initiate/',
            {
                'currency': 'NGN',
                'amount': '100',
                'card_number': '4242424242424242',
                'cvv': '123',
                'expiry_month': '12',
                'expiry_year': '25',
                'fullname': 'Test User'
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn('Card deposits only support EUR, USD, and GBP', data['error'])


class CardDepositWebhookTestCase(TestCase):
    """Test card deposit webhook"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        # Wallet created automatically via signal
        self.wallet = Wallet.objects.get(user=self.user)
        self.wallet.balance = Decimal("0.00")
        self.wallet.save()
        
        self.card_deposit = CardDeposit.objects.create(
            user=self.user,
            currency='USD',
            amount=Decimal('100.00'),
            exchange_rate=Decimal('1500.00'),
            gross_ngn=Decimal('150000.00'),
            flutterwave_fee=Decimal('2100.00'),
            platform_margin=Decimal('750.00'),
            ngn_amount=Decimal('147150.00'),
            flutterwave_tx_ref='CARD_1_TEST123',
            status='processing'
        )

    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_successful_webhook(self, mock_fw_service):
        """Test successful card charge webhook"""
        from rest_framework.test import APIClient
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'CARD_1_TEST123',
                'id': 'flw_123456',
                'status': 'successful',
                'amount': 100,
                'currency': 'USD',
                'card': {
                    'last4digits': '1234',
                    'type': 'visa'
                }
            }
        }
        
        payload_bytes = json.dumps(payload).encode()
        signature = 'test_signature'
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH=signature
        )
        
        self.assertEqual(response.status_code, 200)
        
        # Verify card deposit was updated
        self.card_deposit.refresh_from_db()
        self.assertEqual(self.card_deposit.status, 'successful')
        self.assertEqual(self.card_deposit.card_last4, '1234')
        
        # Verify wallet was credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal('147150.00'))

    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_failed_webhook(self, mock_fw_service):
        """Test failed card charge webhook"""
        from rest_framework.test import APIClient
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'CARD_1_TEST123',
                'id': 'flw_123456',
                'status': 'failed',
                'amount': 100,
                'currency': 'USD'
            }
        }
        
        payload_bytes = json.dumps(payload).encode()
        signature = 'test_signature'
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH=signature
        )
        
        self.assertEqual(response.status_code, 200)
        
        # Verify card deposit status updated
        self.card_deposit.refresh_from_db()
        self.assertEqual(self.card_deposit.status, 'failed')
        
        # Verify wallet was NOT credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal('0.00'))

    def test_webhook_missing_signature(self):
        """Test webhook without signature"""
        from rest_framework.test import APIClient
        
        payload = {
            'event': 'charge.completed',
            'data': {'tx_ref': 'CARD_1_TEST123'}
        }
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json'
        )
        
        self.assertEqual(response.status_code, 400)

    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_webhook_invalid_signature(self, mock_fw_service):
        """Test webhook with invalid signature"""
        from rest_framework.test import APIClient
        
        # Mock webhook signature verification to return False
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = False
        mock_fw_service.return_value = mock_instance
        
        payload = {
            'event': 'charge.completed',
            'data': {'tx_ref': 'CARD_1_TEST123'}
        }
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH='invalid_signature'
        )
        
        self.assertEqual(response.status_code, 401)

    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_webhook_idempotency(self, mock_fw_service):
        """Test that webhook doesn't process same transaction twice"""
        from rest_framework.test import APIClient
        
        # Mark deposit as already successful
        self.card_deposit.status = 'successful'
        self.card_deposit.save()
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'CARD_1_TEST123',
                'id': 'flw_123456',
                'status': 'successful'
            }
        }
        
        payload_bytes = json.dumps(payload).encode()
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH='test_signature'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'already processed')
        
        # Wallet should still be at 0 (not double-credited)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal('0.00'))
