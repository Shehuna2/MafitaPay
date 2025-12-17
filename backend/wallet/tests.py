from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from decimal import Decimal
import json
import hmac
import hashlib
import base64

from .models import Wallet, VirtualAccount, Deposit
from .services.flutterwave_service import FlutterwaveService

User = get_user_model()


class FlutterwaveWebhookTestCase(TestCase):
    """Test Flutterwave webhook handling"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("0.00"))
        self.virtual_account = VirtualAccount.objects.create(
            user=self.user,
            provider="flutterwave",
            provider_account_id="test_ref_123",
            account_number="1234567890",
            bank_name="Wema Bank",
            account_name="Test User",
        )

    def test_webhook_payload_account_number_extraction(self):
        """Test that webhook can extract account number from various payload structures"""
        
        # Test case 1: Direct account_number field
        payload1 = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_123",
                "account_number": "1234567890",
                "amount": 1000,
                "status": "success"
            }
        }
        
        # Test case 2: Nested in payment_details
        payload2 = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_124",
                "payment_details": {
                    "account_number": "1234567890"
                },
                "amount": 1000,
                "status": "success"
            }
        }
        
        # Test case 3: Nested in meta
        payload3 = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_125",
                "meta": {
                    "account_number": "1234567890"
                },
                "amount": 1000,
                "status": "success"
            }
        }
        
        # Test case 4: Fallback by reference
        payload4 = {
            "event": "virtualaccount.payment.completed",
            "data": {
                "id": "txn_126",
                "reference": "test_ref_123",
                "amount": 1000,
                "status": "success"
            }
        }
        
        # All test cases should work
        for payload in [payload1, payload2, payload3, payload4]:
            data = payload.get("data", {})
            
            # Simulate the extraction logic from webhook
            account_number = (
                data.get("account_number")
                or data.get("destination_account")
                or data.get("receiver_account")
                or data.get("credited_account")
            )
            
            if not account_number and data.get("payment_details"):
                payment_details = data.get("payment_details", {})
                account_number = (
                    payment_details.get("account_number")
                    or payment_details.get("destination_account")
                )
            
            if not account_number and data.get("meta"):
                meta = data.get("meta", {})
                account_number = meta.get("account_number") or meta.get("beneficiary_account_number")
            
            if not account_number and data.get("reference"):
                va_fallback = VirtualAccount.objects.filter(
                    provider_account_id=data.get("reference"),
                    provider="flutterwave",
                ).first()
                if va_fallback:
                    account_number = va_fallback.account_number
            
            self.assertIsNotNone(account_number, f"Failed to extract account number from payload: {payload}")
            self.assertEqual(account_number, "1234567890")

    def test_bank_transfer_info_extraction(self):
        """Test that webhook can extract bank transfer info from various structures"""
        
        # Test case 1: Nested in payment_method.bank_transfer
        data1 = {
            "payment_method": {
                "bank_transfer": {
                    "originator_name": "John Doe",
                    "originator_bank_name": "GTBank",
                    "originator_account_number": "0123456789"
                }
            }
        }
        
        # Test case 2: In transfer_details
        data2 = {
            "transfer_details": {
                "originator_name": "Jane Smith",
                "originator_bank_name": "Access Bank",
                "originator_account_number": "9876543210"
            }
        }
        
        # Test case 3: Direct fields
        data3 = {
            "sender_name": "Bob Johnson",
            "sender_bank": "Zenith Bank",
            "sender_account": "5555555555"
        }
        
        # Test extraction logic
        for data in [data1, data2, data3]:
            bt = {}
            if data.get("payment_method"):
                bt = data.get("payment_method", {}).get("bank_transfer", {})
            
            if not bt and data.get("transfer_details"):
                bt = data.get("transfer_details", {})
            
            if not bt:
                bt = {
                    "originator_name": data.get("sender_name") or data.get("customer_name") or data.get("originator_name"),
                    "originator_bank_name": data.get("sender_bank") or data.get("originator_bank"),
                    "originator_account_number": data.get("sender_account") or data.get("originator_account"),
                }
            
            self.assertTrue(
                bt.get("originator_name") or bt.get("originator_bank_name") or bt.get("originator_account_number"),
                f"Failed to extract any bank transfer info from: {data}"
            )


class FlutterwaveVABankNameExtractionTestCase(TestCase):
    """Test Flutterwave VA bank_name extraction from deeply nested responses"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="banktest@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("0.00"))

    def test_deeply_nested_bank_name_extraction(self):
        """Test extraction of bank_name from raw_response.raw_response.data.account_bank_name"""
        
        # This mimics the actual metadata structure reported in the issue
        nested_metadata = {
            "type": "static",
            "raw_response": {
                "type": "static",
                "provider": "flutterwave",
                "bank_name": None,
                "reference": "vad8ef9cd3c879",
                "customer_id": "cus_zyRRrX9qSZ",
                "account_name": None,
                "raw_response": {
                    "data": {
                        "id": "van_Fc6W0rQzOF",
                        "meta": {},
                        "note": "Please make a bank transfer to Mafita Digital Solutions FLW",
                        "amount": 0.0,
                        "status": "active",
                        "currency": "NGN",
                        "reference": "vad8ef9cd3c879",
                        "customer_id": "cus_zyRRrX9qSZ",
                        "account_type": "static",
                        "account_number": "8817473385",
                        "created_datetime": "2025-12-17T06:58:26.658Z",
                        "account_bank_name": "Sterling BANK",
                        "account_expiration_datetime": "3025-04-19T06:58:26.646Z"
                    },
                    "status": "success",
                    "message": "Virtual account created"
                },
                "account_number": "8817473385"
            }
        }
        
        # Create a VirtualAccount with this nested structure
        va = VirtualAccount.objects.create(
            user=self.user,
            provider="flutterwave",
            provider_account_id="vad8ef9cd3c879",
            account_number="8817473385",
            bank_name=None,  # Intentionally null as per the bug report
            account_name=None,
            metadata=nested_metadata,
            assigned=True
        )
        
        # Import the serializer to test extraction logic
        from .serializers import VirtualAccountSerializer
        
        serializer = VirtualAccountSerializer(va)
        extracted_bank_name = serializer.get_bank_name(va)
        
        # The serializer should extract "Sterling BANK" from the deeply nested path
        self.assertEqual(extracted_bank_name, "Sterling BANK")
        self.assertNotEqual(extracted_bank_name, "Bank")  # Should not fallback
        self.assertNotEqual(extracted_bank_name, "Mock Bank")

    def test_bank_name_from_various_paths(self):
        """Test that bank_name can be extracted from various metadata structures"""
        
        test_cases = [
            # Case 1: Direct bank_name
            ({"bank_name": "Wema Bank"}, "Wema Bank"),
            
            # Case 2: In data.account_bank_name
            ({"data": {"account_bank_name": "Access Bank"}}, "Access Bank"),
            
            # Case 3: In raw_response.bank_name
            ({"raw_response": {"bank_name": "GTBank"}}, "GTBank"),
            
            # Case 4: In raw_response.data.account_bank_name
            ({"raw_response": {"data": {"account_bank_name": "Zenith Bank"}}}, "Zenith Bank"),
            
            # Case 5: Deeply nested (as per bug report)
            ({
                "raw_response": {
                    "raw_response": {
                        "data": {
                            "account_bank_name": "Sterling BANK"
                        }
                    }
                }
            }, "Sterling BANK"),
            
            # Case 6: Fallback when nothing found
            ({"some_other_field": "value"}, "Bank"),
        ]
        
        from .serializers import VirtualAccountSerializer
        
        for idx, (metadata, expected_bank) in enumerate(test_cases):
            with self.subTest(case=idx):
                va = VirtualAccount.objects.create(
                    user=self.user,
                    provider="flutterwave",
                    provider_account_id=f"test_ref_{idx}",
                    account_number=f"123456789{idx}",
                    bank_name=None,
                    metadata=metadata,
                    assigned=True
                )
                
                serializer = VirtualAccountSerializer(va)
                result = serializer.get_bank_name(va)
                
                self.assertEqual(result, expected_bank, 
                    f"Failed to extract bank_name from metadata: {metadata}")

    def test_fw_response_extraction_logic(self):
        """Test the extraction logic that should be in generate_flutterwave_va"""
        
        # Simulate the fw_response structure from the issue
        fw_response = {
            "provider": "flutterwave",
            "account_number": "8817473385",
            "bank_name": None,
            "account_name": None,
            "reference": "vad8ef9cd3c879",
            "type": "static",
            "raw_response": {
                "type": "static",
                "provider": "flutterwave",
                "bank_name": None,
                "reference": "vad8ef9cd3c879",
                "customer_id": "cus_zyRRrX9qSZ",
                "account_name": None,
                "raw_response": {
                    "data": {
                        "id": "van_Fc6W0rQzOF",
                        "account_number": "8817473385",
                        "account_bank_name": "Sterling BANK",
                        "account_name": "Mafita Digital Solutions FLW",
                    },
                    "status": "success",
                    "message": "Virtual account created"
                },
                "account_number": "8817473385"
            },
            "customer_id": "cus_zyRRrX9qSZ"
        }
        
        # Replicate the extraction logic from views.py
        bank_name = (
            fw_response.get("bank_name")
            or fw_response.get("bank")
            or fw_response.get("account_bank_name")
            or (fw_response.get("data") or {}).get("account_bank_name")
            or (fw_response.get("raw_response") or {}).get("bank_name")
            or (fw_response.get("raw_response") or {}).get("account_bank_name")
            or (fw_response.get("raw_response") or {}).get("data", {}).get("account_bank_name")
            or (fw_response.get("raw_response") or {}).get("raw_response", {}).get("data", {}).get("account_bank_name")
            or "Unknown Bank"
        )
        
        account_name = (
            fw_response.get("account_name")
            or fw_response.get("name")
            or (fw_response.get("data") or {}).get("account_name")
            or (fw_response.get("raw_response") or {}).get("account_name")
            or (fw_response.get("raw_response") or {}).get("data", {}).get("account_name")
            or (fw_response.get("raw_response") or {}).get("raw_response", {}).get("data", {}).get("account_name")
            or "Virtual Account"
        )
        
        # Verify extraction worked correctly
        self.assertEqual(bank_name, "Sterling BANK")
        self.assertEqual(account_name, "Mafita Digital Solutions FLW")
        self.assertNotEqual(bank_name, "Unknown Bank")
        self.assertNotEqual(account_name, "Virtual Account")
