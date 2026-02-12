import json
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.test import override_settings
from rest_framework.test import APIClient

from accounts.models import User
from wallet.models import CardDepositExchangeRate, CardDeposit, Wallet


@override_settings(FINCRA_TEST_SECRET_KEY="test_secret", FINCRA_TEST_PUBLIC_KEY="test_pub", FINCRA_TEST_WEBHOOK_SECRET="whsec")
class FincraCardDepositInitiateTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="merchant-fincra@example.com",
            password="testpass123",
            is_merchant=True,
        )
        self.client.force_authenticate(user=self.user)
        CardDepositExchangeRate.objects.create(currency="USD", rate=Decimal("1500.00"))

    @patch("wallet.services.fincra_card_service.requests.post")
    def test_initiate_fincra_card_deposit_success(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "data": {
                "checkoutLink": "https://checkout.fincra.com/pay/abc123"
            }
        }
        mock_post.return_value = mock_response

        response = self.client.post(
            "/api/wallet/card-deposit/initiate/",
            {
                "currency": "USD",
                "amount": "100",
                "provider": "fincra",
                "use_live": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["provider"], "fincra")
        self.assertIn("authorization_url", payload)

        deposit = CardDeposit.objects.get(id=payload["deposit_id"])
        self.assertEqual(deposit.provider, "fincra")
        self.assertEqual(deposit.status, "processing")


@override_settings(FINCRA_TEST_SECRET_KEY="test_secret", FINCRA_TEST_PUBLIC_KEY="test_pub", FINCRA_TEST_WEBHOOK_SECRET="whsec")
class FincraCardDepositWebhookTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email="fincra-webhook@example.com", password="testpass123")
        self.wallet = Wallet.objects.get(user=self.user)
        self.wallet.balance = Decimal("0.00")
        self.wallet.save()

        self.deposit = CardDeposit.objects.create(
            user=self.user,
            provider="fincra",
            currency="USD",
            amount=Decimal("100.00"),
            exchange_rate=Decimal("1500.00"),
            gross_ngn=Decimal("150000.00"),
            flutterwave_fee=Decimal("2100.00"),
            platform_margin=Decimal("750.00"),
            ngn_amount=Decimal("147150.00"),
            flutterwave_tx_ref="CARDTXFINCRA123",
            status="processing",
        )

    @patch("wallet.webhooks.settings.DEBUG", True)
    @patch("wallet.services.fincra_card_service.FincraCardService.verify_webhook_signature", return_value=True)
    def test_fincra_webhook_credits_wallet(self, _mock_verify):
        payload = {
            "event": "checkout.completed",
            "data": {
                "reference": "CARDTXFINCRA123",
                "status": "successful",
                "id": "fn_tx_123",
            },
        }

        response = self.client.post(
            "/api/wallet/fincra-card-webhook/",
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_FINCRA_SIGNATURE="valid",
        )

        self.assertEqual(response.status_code, 200)
        self.deposit.refresh_from_db()
        self.wallet.refresh_from_db()

        self.assertEqual(self.deposit.status, "successful")
        self.assertEqual(self.wallet.balance, Decimal("147150.00"))
