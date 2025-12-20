from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
import json

from .models import Deposit_P2P_Offer, Withdraw_P2P_Offer, DepositOrder, WithdrawOrder
from wallet.models import Wallet

User = get_user_model()


class DuplicateDepositOrderTestCase(TestCase):
    """Test duplicate P2P deposit order detection by amount"""

    def setUp(self):
        self.client = APIClient()
        
        # Create merchant user
        self.merchant = User.objects.create_user(
            email="merchant@example.com",
            password="testpass123",
            is_merchant=True
        )
        self.merchant_wallet = Wallet.objects.get(user=self.merchant)
        self.merchant_wallet.balance = Decimal("10000.00")
        self.merchant_wallet.save()
        
        # Create buyer user
        self.buyer = User.objects.create_user(
            email="buyer@example.com",
            password="testpass123"
        )
        self.buyer_wallet = Wallet.objects.get(user=self.buyer)
        
        # Create a deposit offer from merchant
        self.merchant_wallet.lock_funds(Decimal("5000.00"))
        self.deposit_offer = Deposit_P2P_Offer.objects.create(
            merchant=self.merchant,
            amount_available=Decimal("5000.00"),
            min_amount=Decimal("100.00"),
            max_amount=Decimal("5000.00"),
            price_per_unit=Decimal("1.00"),
            is_available=True
        )
        
        self.client.force_authenticate(user=self.buyer)

    def test_can_create_first_deposit_order(self):
        """Test that first deposit order can be created successfully"""
        response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get("success"))

    def test_cannot_create_duplicate_amount_deposit_order(self):
        """Test that user cannot create duplicate deposit order with same amount"""
        # Create first order
        first_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        
        # Try to create another order with same amount
        second_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already have an active deposit order", second_response.data.get("error", ""))

    def test_can_create_deposit_order_with_different_amount(self):
        """Test that user can create deposit order with different amount"""
        # Create first order with 500
        first_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        
        # Create second order with different amount (600)
        second_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "600.00"},
            format='json'
        )
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(second_response.data.get("success"))

    def test_can_create_same_amount_after_cancel(self):
        """Test that user can create order with same amount after cancelling previous one"""
        # Create first order
        first_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        order_id = first_response.data.get("order_id")
        
        # Cancel the first order
        cancel_response = self.client.post(
            f'/api/p2p/orders/{order_id}/cancel/',
            format='json'
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        
        # Now should be able to create order with same amount
        new_response = self.client.post(
            f'/api/p2p/offers/{self.deposit_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(new_response.status_code, status.HTTP_201_CREATED)


class DuplicateWithdrawOrderTestCase(TestCase):
    """Test duplicate P2P withdraw order detection by amount"""

    def setUp(self):
        self.client = APIClient()
        
        # Create merchant user (buyer in withdraw context)
        self.merchant = User.objects.create_user(
            email="merchant@example.com",
            password="testpass123",
            is_merchant=True
        )
        self.merchant_wallet = Wallet.objects.get(user=self.merchant)
        self.merchant_wallet.balance = Decimal("10000.00")
        self.merchant_wallet.save()
        
        # Create seller user
        self.seller = User.objects.create_user(
            email="seller@example.com",
            password="testpass123"
        )
        self.seller_wallet = Wallet.objects.get(user=self.seller)
        self.seller_wallet.balance = Decimal("10000.00")
        self.seller_wallet.save()
        
        # Create a withdraw offer from merchant
        self.withdraw_offer = Withdraw_P2P_Offer.objects.create(
            merchant=self.merchant,
            amount_available=Decimal("5000.00"),
            min_amount=Decimal("100.00"),
            max_amount=Decimal("5000.00"),
            price_per_unit=Decimal("1.00"),
            is_active=True
        )
        
        self.client.force_authenticate(user=self.seller)

    def test_can_create_first_withdraw_order(self):
        """Test that first withdraw order can be created successfully"""
        response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data.get("success"))

    def test_cannot_create_duplicate_amount_withdraw_order(self):
        """Test that user cannot create duplicate withdraw order with same amount"""
        # Create first order
        first_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        
        # Try to create another order with same amount
        second_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already have an active withdraw order", second_response.data.get("error", ""))

    def test_can_create_withdraw_order_with_different_amount(self):
        """Test that user can create withdraw order with different amount"""
        # Create first order with 500
        first_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        
        # Create second order with different amount (600)
        second_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "600.00"},
            format='json'
        )
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(second_response.data.get("success"))

    def test_can_create_same_amount_after_cancel(self):
        """Test that user can create order with same amount after cancelling previous one"""
        # Create first order
        first_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        order_id = first_response.data.get("order_id")
        
        # Cancel the first order
        cancel_response = self.client.post(
            f'/api/p2p/withdraw-orders/{order_id}/cancel/',
            format='json'
        )
        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        
        # Now should be able to create order with same amount
        new_response = self.client.post(
            f'/api/p2p/withdraw-offers/{self.withdraw_offer.id}/create-order/',
            {"amount_requested": "500.00"},
            format='json'
        )
        self.assertEqual(new_response.status_code, status.HTTP_201_CREATED)
