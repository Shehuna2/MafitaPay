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

    @patch('wallet.views.FlutterwaveCardService')
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
        self.assertIn('Card deposits only support', data['error'])


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


class WebhookLoggingTestCase(TestCase):
    """Test enhanced webhook logging functionality"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
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
            flutterwave_tx_ref='CARD_LOG_TEST',
            status='processing'
        )
    
    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_webhook_missing_card_deposit_creates_retry_entry(self, mock_fw_service):
        """Test that missing CardDeposit creates a permanent failure retry entry"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'NONEXISTENT_TX_REF',
                'id': 'flw_999',
                'status': 'successful',
                'amount': 100
            }
        }
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH='test_signature'
        )
        
        self.assertEqual(response.status_code, 404)
        
        # Check that retry queue entry was created
        retry_entry = WebhookRetryQueue.objects.filter(
            webhook_type='card_deposit',
            tx_ref='NONEXISTENT_TX_REF'
        ).first()
        
        self.assertIsNotNone(retry_entry)
        self.assertEqual(retry_entry.status, 'failed_permanent')
        self.assertTrue(retry_entry.is_permanent_failure)
        self.assertIn('CardDeposit record not found', retry_entry.error_message)
    
    @patch('wallet.webhooks.Wallet.objects.select_for_update')
    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_webhook_wallet_not_found_creates_transient_retry(self, mock_fw_service, mock_wallet_qs):
        """Test that missing Wallet creates a transient failure retry entry"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        # Mock wallet not found
        mock_wallet_qs.return_value.get.side_effect = Wallet.DoesNotExist
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'CARD_LOG_TEST',
                'id': 'flw_123456',
                'status': 'successful',
                'amount': 100
            }
        }
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH='test_signature'
        )
        
        self.assertEqual(response.status_code, 500)
        self.assertTrue(response.json().get('will_retry'))
        
        # Check that retry queue entry was created
        retry_entry = WebhookRetryQueue.objects.filter(
            webhook_type='card_deposit',
            tx_ref='CARD_LOG_TEST'
        ).first()
        
        self.assertIsNotNone(retry_entry)
        self.assertEqual(retry_entry.status, 'pending')
        self.assertFalse(retry_entry.is_permanent_failure)
        self.assertEqual(retry_entry.retry_count, 1)
        self.assertIsNotNone(retry_entry.next_retry_at)
    
    @patch('wallet.models.Wallet.deposit')
    @patch('wallet.services.flutterwave_card_service.FlutterwaveCardService')
    def test_webhook_wallet_deposit_failure_creates_retry(self, mock_fw_service, mock_deposit):
        """Test that wallet.deposit() failure creates a retry entry"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        
        # Mock webhook signature verification
        mock_instance = MagicMock()
        mock_instance.verify_webhook_signature.return_value = True
        mock_fw_service.return_value = mock_instance
        
        # Mock deposit failure
        mock_deposit.return_value = False
        
        payload = {
            'event': 'charge.completed',
            'data': {
                'tx_ref': 'CARD_LOG_TEST',
                'id': 'flw_123456',
                'status': 'successful',
                'amount': 100,
                'card': {
                    'last4digits': '1234',
                    'type': 'visa'
                }
            }
        }
        
        client = APIClient()
        response = client.post(
            '/api/wallet/flutterwave-card-webhook/',
            data=payload,
            format='json',
            HTTP_VERIF_HASH='test_signature'
        )
        
        self.assertEqual(response.status_code, 500)
        self.assertTrue(response.json().get('will_retry'))
        
        # Check that retry queue entry was created
        retry_entry = WebhookRetryQueue.objects.filter(
            webhook_type='card_deposit',
            tx_ref='CARD_LOG_TEST'
        ).first()
        
        self.assertIsNotNone(retry_entry)
        self.assertEqual(retry_entry.status, 'pending')
        self.assertEqual(retry_entry.error_type, 'WalletDepositFailed')


class WebhookRetryQueueTestCase(TestCase):
    """Test WebhookRetryQueue model functionality"""
    
    def setUp(self):
        from .models import WebhookRetryQueue
        self.retry_entry = WebhookRetryQueue.objects.create(
            webhook_type='card_deposit',
            tx_ref='TEST_RETRY_123',
            payload={'test': 'data'},
            signature='test_sig'
        )
    
    def test_calculate_next_retry_exponential_backoff(self):
        """Test exponential backoff calculation"""
        # First retry: 2^0 = 1 minute
        next_retry = self.retry_entry.calculate_next_retry()
        self.assertIsNotNone(next_retry)
        
        # Second retry: 2^1 = 2 minutes
        self.retry_entry.retry_count = 1
        next_retry = self.retry_entry.calculate_next_retry()
        self.assertIsNotNone(next_retry)
        
        # Third retry: 2^2 = 4 minutes
        self.retry_entry.retry_count = 2
        next_retry = self.retry_entry.calculate_next_retry()
        self.assertIsNotNone(next_retry)
        
        # Max retries reached
        self.retry_entry.retry_count = 5
        next_retry = self.retry_entry.calculate_next_retry()
        self.assertIsNone(next_retry)
    
    def test_mark_permanent_failure(self):
        """Test marking as permanent failure"""
        self.retry_entry.mark_permanent_failure(
            'Invalid transaction',
            'InvalidTransaction'
        )
        
        self.assertTrue(self.retry_entry.is_permanent_failure)
        self.assertEqual(self.retry_entry.status, 'failed_permanent')
        self.assertEqual(self.retry_entry.error_message, 'Invalid transaction')
        self.assertEqual(self.retry_entry.error_type, 'InvalidTransaction')
    
    def test_mark_transient_failure(self):
        """Test marking as transient failure with retry scheduling"""
        self.retry_entry.mark_transient_failure(
            'Database lock timeout',
            'DatabaseError'
        )
        
        self.assertFalse(self.retry_entry.is_permanent_failure)
        self.assertEqual(self.retry_entry.status, 'pending')
        self.assertEqual(self.retry_entry.retry_count, 1)
        self.assertIsNotNone(self.retry_entry.next_retry_at)
        self.assertIsNotNone(self.retry_entry.last_retry_at)
    
    def test_mark_transient_failure_max_retries(self):
        """Test that max retries marks as failed"""
        self.retry_entry.retry_count = 4  # One before max
        self.retry_entry.mark_transient_failure('Still failing', 'Error')
        
        # Should now be at max retries (5)
        self.assertEqual(self.retry_entry.retry_count, 5)
        self.assertEqual(self.retry_entry.status, 'failed_transient')
        self.assertTrue(self.retry_entry.is_permanent_failure)
    
    def test_mark_success(self):
        """Test marking as successful"""
        self.retry_entry.retry_count = 2
        self.retry_entry.mark_success()
        
        self.assertEqual(self.retry_entry.status, 'succeeded')
        self.assertIsNotNone(self.retry_entry.succeeded_at)


class WebhookDebugEndpointTestCase(TestCase):
    """Test webhook debug endpoint"""
    
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="testpass123"
        )
        self.regular_user = User.objects.create_user(
            email="user@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.get(user=self.regular_user)
        
        self.card_deposit = CardDeposit.objects.create(
            user=self.regular_user,
            currency='USD',
            amount=Decimal('100.00'),
            exchange_rate=Decimal('1500.00'),
            gross_ngn=Decimal('150000.00'),
            flutterwave_fee=Decimal('2100.00'),
            platform_margin=Decimal('750.00'),
            ngn_amount=Decimal('147150.00'),
            flutterwave_tx_ref='DEBUG_TEST_123',
            status='processing'
        )
    
    def test_debug_endpoint_requires_admin(self):
        """Test that debug endpoint requires admin permissions"""
        from rest_framework.test import APIClient
        
        client = APIClient()
        client.force_authenticate(user=self.regular_user)
        
        response = client.get('/api/wallet/card-deposit/webhook-debug/?tx_ref=DEBUG_TEST_123')
        self.assertEqual(response.status_code, 403)
    
    def test_debug_endpoint_get_history(self):
        """Test getting webhook processing history"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        
        # Create some retry history
        retry1 = WebhookRetryQueue.objects.create(
            webhook_type='card_deposit',
            tx_ref='DEBUG_TEST_123',
            payload={'test': 'data'},
            status='failed_transient',
            retry_count=2
        )
        
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        
        response = client.get('/api/wallet/card-deposit/webhook-debug/?tx_ref=DEBUG_TEST_123')
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['tx_ref'], 'DEBUG_TEST_123')
        self.assertIsNotNone(data['card_deposit'])
        self.assertEqual(len(data['retry_history']), 1)
        self.assertEqual(data['retry_history'][0]['retry_count'], 2)
    
    def test_debug_endpoint_manual_reprocess(self):
        """Test manual webhook re-processing"""
        from rest_framework.test import APIClient
        
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        
        # Initial balance
        self.assertEqual(self.wallet.balance, Decimal('0.00'))
        
        response = client.post(
            '/api/wallet/card-deposit/webhook-debug/',
            {'tx_ref': 'DEBUG_TEST_123'},
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        
        # Verify wallet was credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal('147150.00'))
        
        # Verify card deposit status updated
        self.card_deposit.refresh_from_db()
        self.assertEqual(self.card_deposit.status, 'successful')
    
    def test_debug_endpoint_prevents_double_credit(self):
        """Test that manual reprocessing doesn't double-credit"""
        from rest_framework.test import APIClient
        
        # Mark as already successful and create wallet transaction
        self.card_deposit.status = 'successful'
        self.card_deposit.save()
        
        self.wallet.deposit(
            amount=self.card_deposit.ngn_amount,
            reference='DEBUG_TEST_123',
            metadata={'type': 'card_deposit'}
        )
        
        self.wallet.refresh_from_db()
        initial_balance = self.wallet.balance
        
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        
        response = client.post(
            '/api/wallet/card-deposit/webhook-debug/',
            {'tx_ref': 'DEBUG_TEST_123'},
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['already_processed'])
        
        # Balance should not change
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, initial_balance)


class WebhookRetryProcessTestCase(TestCase):
    """Test webhook retry processing endpoint"""
    
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="testpass123"
        )
        self.user = User.objects.create_user(
            email="user@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.get(user=self.user)
        
        self.card_deposit = CardDeposit.objects.create(
            user=self.user,
            currency='USD',
            amount=Decimal('100.00'),
            exchange_rate=Decimal('1500.00'),
            gross_ngn=Decimal('150000.00'),
            flutterwave_fee=Decimal('2100.00'),
            platform_margin=Decimal('750.00'),
            ngn_amount=Decimal('147150.00'),
            flutterwave_tx_ref='RETRY_PROC_123',
            flutterwave_tx_id='flw_999',
            status='processing'
        )
    
    def test_retry_process_requires_admin(self):
        """Test that retry process endpoint requires admin"""
        from rest_framework.test import APIClient
        
        client = APIClient()
        response = client.post('/api/wallet/webhook-retry/process/')
        self.assertEqual(response.status_code, 401)
    
    def test_retry_process_successful_retry(self):
        """Test successful retry processing"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        from django.utils import timezone
        
        # Create a pending retry that's due
        retry_entry = WebhookRetryQueue.objects.create(
            webhook_type='card_deposit',
            tx_ref='RETRY_PROC_123',
            payload={'event': 'charge.completed'},
            status='pending',
            retry_count=1,
            next_retry_at=timezone.now() - timezone.timedelta(minutes=5)
        )
        
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        
        response = client.post('/api/wallet/webhook-retry/process/')
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['processed_count'], 1)
        
        # Check retry entry was marked as successful
        retry_entry.refresh_from_db()
        self.assertEqual(retry_entry.status, 'succeeded')
        
        # Check wallet was credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal('147150.00'))
    
    def test_retry_process_only_processes_due_retries(self):
        """Test that only due retries are processed"""
        from rest_framework.test import APIClient
        from .models import WebhookRetryQueue
        from django.utils import timezone
        
        # Create a pending retry that's NOT due yet
        retry_entry = WebhookRetryQueue.objects.create(
            webhook_type='card_deposit',
            tx_ref='RETRY_PROC_123',
            payload={'event': 'charge.completed'},
            status='pending',
            retry_count=1,
            next_retry_at=timezone.now() + timezone.timedelta(hours=1)
        )
        
        client = APIClient()
        client.force_authenticate(user=self.admin_user)
        
        response = client.post('/api/wallet/webhook-retry/process/')
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(data['processed_count'], 0)
        
        # Retry entry should still be pending
        retry_entry.refresh_from_db()
        self.assertEqual(retry_entry.status, 'pending')
