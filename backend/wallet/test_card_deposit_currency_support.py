from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from wallet.models import CardDeposit, CardDepositExchangeRate, Wallet, WalletTransaction
from wallet.serializers import CardDepositInitiateSerializer


class CardDepositCurrencySerializerTests(TestCase):
    def test_serializer_accepts_new_currency(self):
        serializer = CardDepositInitiateSerializer(
            data={"currency": "GHS", "amount": "100", "provider": "flutterwave", "use_live": False}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_serializer_rejects_provider_not_allowed_for_currency(self):
        serializer = CardDepositInitiateSerializer(
            data={"currency": "XOF", "amount": "100", "provider": "fincra", "use_live": False}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("provider", serializer.errors)


class CardDepositInitiateCurrencyRulesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="merchant-currency@example.com",
            password="testpass123",
            is_merchant=True,
        )
        self.client.force_authenticate(self.user)

    def test_initiate_rejects_unsupported_currency(self):
        response = self.client.post(
            "/api/wallet/card-deposit/initiate/",
            {"currency": "NGN", "amount": "100", "provider": "flutterwave", "use_live": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertTrue("currency" in body or "errors" in body)

    def test_initiate_rejects_provider_not_allowed_for_currency(self):
        response = self.client.post(
            "/api/wallet/card-deposit/initiate/",
            {"currency": "XOF", "amount": "100", "provider": "fincra", "use_live": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        # serializer validation can return under provider key
        body = response.json()
        self.assertTrue("provider" in body or "error" in body or "errors" in body)

    def test_initiate_rejects_exchange_rate_missing(self):
        CardDepositExchangeRate.objects.filter(currency="GHS").delete()
        response = self.client.post(
            "/api/wallet/card-deposit/initiate/",
            {"currency": "GHS", "amount": "100", "provider": "flutterwave", "use_live": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())
        self.assertIn("not configured", response.json()["error"])


class CardDepositVerifyIdempotencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email="verify-idempotent@example.com", password="testpass123")
        self.client.force_authenticate(self.user)

        self.wallet = Wallet.objects.get(user=self.user)
        self.wallet.balance = Decimal("0.00")
        self.wallet.save(update_fields=["balance"])

        self.deposit = CardDeposit.objects.create(
            user=self.user,
            provider="flutterwave",
            currency="GHS",
            amount=Decimal("100.00"),
            exchange_rate=Decimal("10.00"),
            gross_ngn=Decimal("1000.00"),
            flutterwave_fee=Decimal("14.00"),
            platform_margin=Decimal("5.00"),
            ngn_amount=Decimal("981.00"),
            flutterwave_tx_ref="CARDVERIFYIDEMP001",
            status="processing",
            use_live_mode=False,
        )

    @patch("wallet.views.CardDepositVerifyView._verify_provider")
    def test_verify_endpoint_does_not_double_credit(self, mock_verify):
        mock_verify.return_value = {
            "status": "success",
            "payment_status": "successful",
            "provider_tx_id": "flw_123",
            "raw": {"status": "successful", "id": "flw_123"},
        }

        payload = {"tx_ref": "CARDVERIFYIDEMP001"}

        first = self.client.post("/api/wallet/card-deposit/verify/", payload, format="json")
        second = self.client.post("/api/wallet/card-deposit/verify/", payload, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)

        self.wallet.refresh_from_db()
        self.deposit.refresh_from_db()

        self.assertEqual(self.deposit.status, "successful")
        self.assertEqual(self.wallet.balance, Decimal("981.00"))
        self.assertEqual(
            WalletTransaction.objects.filter(user=self.user, reference="CARDVERIFYIDEMP001", status="success").count(),
            1,
        )
