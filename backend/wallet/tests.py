import json
from decimal import Decimal
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from unittest.mock import patch, MagicMock

from .models import Wallet, VirtualAccount, Deposit, WalletTransaction
from .services.flutterwave_service import FlutterwaveService

User = get_user_model()


class FlutterwaveWebhookTestCase(TestCase):
    """Test Flutterwave webhook handling with multiple payload shapes."""
    
    def setUp(self):
        """Set up test user, wallet and virtual account."""
        self.client = Client()
        self.user = User.objects.create_user(
            email="testuser@example.com",
            password="testpass123"
        )
        self.wallet, _ = Wallet.objects.get_or_create(user=self.user, defaults={'balance': Decimal("0.00")})
        self.va = VirtualAccount.objects.create(
            user=self.user,
            provider="flutterwave",
            account_number="1234567890",
            bank_name="Wema Bank",
            account_name="Test User",
            provider_account_id="va_ref_123"
        )
        
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_account_number_extraction_direct(self, mock_verify):
        """Test account_number extraction from direct field."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_123456",
                "amount": 1000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        
        # Verify deposit was created
        deposit = Deposit.objects.filter(provider_reference="txn_123456").first()
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.amount, Decimal("1000"))
        self.assertEqual(deposit.status, "credited")
        
        # Verify wallet was credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("1000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_account_number_extraction_destination_account(self, mock_verify):
        """Test account_number extraction from destination_account field."""
        mock_verify.return_value = True
        
        payload = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "flw_ref": "FLW-REF-456",
                "amount": 2000,
                "status": "success",
                "destination_account": "1234567890"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        
        deposit = Deposit.objects.filter(provider_reference="FLW-REF-456").first()
        self.assertIsNotNone(deposit)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("2000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_account_number_extraction_from_payment_details(self, mock_verify):
        """Test account_number extraction from nested payment_details."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_789",
                "amount": 3000,
                "status": "successful",
                "payment_details": {
                    "account_number": "1234567890",
                    "bank_code": "035"
                }
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        deposit = Deposit.objects.filter(provider_reference="txn_789").first()
        self.assertIsNotNone(deposit)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("3000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_account_number_extraction_from_meta(self, mock_verify):
        """Test account_number extraction from nested meta."""
        mock_verify.return_value = True
        
        payload = {
            "event": "transfer.completed",
            "data": {
                "reference": "REF-META-001",
                "amount": 4000,
                "status": "success",
                "meta": {
                    "account_number": "1234567890",
                    "beneficiary_name": "Test User"
                }
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        deposit = Deposit.objects.filter(provider_reference="REF-META-001").first()
        self.assertIsNotNone(deposit)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("4000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_account_number_extraction_fallback_by_reference(self, mock_verify):
        """Test account_number extraction by looking up VA via reference."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_fallback_001",
                "amount": 5000,
                "status": "successful",
                "reference": "va_ref_123"  # This matches provider_account_id
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        deposit = Deposit.objects.filter(provider_reference="txn_fallback_001").first()
        self.assertIsNotNone(deposit)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("5000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_bank_transfer_info_from_payment_method(self, mock_verify):
        """Test bank transfer info extraction from payment_method.bank_transfer."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_bt_001",
                "amount": 6000,
                "status": "successful",
                "account_number": "1234567890",
                "payment_method": {
                    "bank_transfer": {
                        "originator_name": "John Doe",
                        "originator_bank_name": "GTBank",
                        "originator_account_number": "9876543210"
                    }
                }
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        deposit = Deposit.objects.filter(provider_reference="txn_bt_001").first()
        self.assertIsNotNone(deposit)
        
        # Verify bank transfer info was recorded in transaction metadata
        txn = WalletTransaction.objects.filter(reference="flw_txn_bt_001").first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.metadata.get("sender_name"), "John Doe")
        self.assertEqual(txn.metadata.get("sender_bank"), "GTBank")
        self.assertEqual(txn.metadata.get("sender_account_number"), "9876543210")
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_bank_transfer_info_from_transfer_details(self, mock_verify):
        """Test bank transfer info extraction from transfer_details."""
        mock_verify.return_value = True
        
        payload = {
            "event": "transfer.successful",
            "data": {
                "id": "txn_bt_002",
                "amount": 7000,
                "status": "successful",
                "account_number": "1234567890",
                "transfer_details": {
                    "sender_name": "Jane Smith",
                    "sender_bank": "Access Bank",
                    "sender_account": "1122334455"
                }
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        txn = WalletTransaction.objects.filter(reference="flw_txn_bt_002").first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.metadata.get("sender_name"), "Jane Smith")
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_bank_transfer_info_from_direct_fields(self, mock_verify):
        """Test bank transfer info extraction from direct data fields."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_bt_003",
                "amount": 8000,
                "status": "successful",
                "account_number": "1234567890",
                "sender_name": "Bob Johnson",
                "sender_bank": "Zenith Bank",
                "sender_account_number": "5566778899"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        txn = WalletTransaction.objects.filter(reference="flw_txn_bt_003").first()
        self.assertIsNotNone(txn)
        self.assertEqual(txn.metadata.get("sender_name"), "Bob Johnson")
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_idempotent_handling_already_credited(self, mock_verify):
        """Test idempotent handling - duplicate webhook for already credited deposit."""
        mock_verify.return_value = True
        
        # Create existing credited deposit
        Deposit.objects.create(
            user=self.user,
            virtual_account=self.va,
            amount=Decimal("9000"),
            provider_reference="txn_duplicate_001",
            status="credited"
        )
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_duplicate_001",
                "amount": 9000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        initial_balance = self.wallet.balance
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "already_processed")
        
        # Balance should not change
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, initial_balance)
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_idempotent_handling_retry_pending(self, mock_verify):
        """Test idempotent handling - retry crediting for pending deposit."""
        mock_verify.return_value = True
        
        # Create existing pending deposit
        Deposit.objects.create(
            user=self.user,
            virtual_account=self.va,
            amount=Decimal("10000"),
            provider_reference="txn_pending_001",
            status="pending"
        )
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_pending_001",
                "amount": 10000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        initial_balance = self.wallet.balance
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "recovered")
        
        # Verify deposit status updated
        deposit = Deposit.objects.get(provider_reference="txn_pending_001")
        self.assertEqual(deposit.status, "credited")
        
        # Verify wallet was credited
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, initial_balance + Decimal("10000"))
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_provider_reference_none_string(self, mock_verify):
        """Test that string 'None' is treated as missing reference."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": None,
                "flw_ref": "None",
                "amount": 1000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ignored")
        
        # Verify no deposit was created
        self.assertEqual(Deposit.objects.count(), 0)
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_missing_account_number_ignored(self, mock_verify):
        """Test that webhook is ignored when account_number cannot be resolved."""
        mock_verify.return_value = True
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_no_account",
                "amount": 1000,
                "status": "successful"
                # No account_number anywhere
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="test_signature"
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ignored")
        self.assertEqual(Deposit.objects.count(), 0)
    
    @patch.object(FlutterwaveService, 'verify_webhook_signature')
    def test_invalid_signature_rejected(self, mock_verify):
        """Test that webhook with invalid signature is rejected."""
        mock_verify.return_value = False
        
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_invalid_sig",
                "amount": 1000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_VERIF_HASH="invalid_signature"
        )
        
        self.assertEqual(response.status_code, 401)
        self.assertEqual(Deposit.objects.count(), 0)
    
    def test_missing_signature_rejected(self):
        """Test that webhook without signature header is rejected."""
        payload = {
            "event": "charge.completed",
            "data": {
                "id": "txn_no_sig",
                "amount": 1000,
                "status": "successful",
                "account_number": "1234567890"
            }
        }
        
        response = self.client.post(
            "/api/wallet/flutterwave-webhook/",
            data=json.dumps(payload),
            content_type="application/json"
            # No HTTP_VERIF_HASH
        )
        
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Deposit.objects.count(), 0)
