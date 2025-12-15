# rewards/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from wallet.models import Wallet, WalletTransaction
from rewards.models import BonusType, Bonus
from rewards.services import BonusService
from decimal import Decimal

User = get_user_model()


class ClaimBonusServiceTests(TestCase):
    """Test the BonusService.claim_bonus() method"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="testuser@test.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.get(user=self.user)
        
        # Create a bonus type
        self.bonus_type = BonusType.objects.create(
            name="welcome",
            display_name="Welcome Bonus",
            is_active=True,
            default_amount=Decimal("100.00")
        )

    def test_claim_unlocked_bonus_success(self):
        """Test successfully claiming an unlocked bonus"""
        # Create and unlock a bonus
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("50.00"),
            locked=True
        )
        
        # Unlock and apply to wallet
        BonusService.unlock_bonus(bonus)
        BonusService.apply_bonus_to_wallet(bonus)
        
        # Verify locked balance
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.locked_balance, Decimal("50.00"))
        self.assertEqual(self.wallet.balance, Decimal("0.00"))
        
        # Claim the bonus
        bonus.refresh_from_db()
        result = BonusService.claim_bonus(bonus)
        
        # Verify success
        self.assertTrue(result)
        
        # Verify bonus status changed to "used"
        bonus.refresh_from_db()
        self.assertEqual(bonus.status, "used")
        
        # Verify wallet balances updated
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("50.00"))
        self.assertEqual(self.wallet.locked_balance, Decimal("0.00"))
        
        # Verify transaction was created
        tx = WalletTransaction.objects.filter(
            user=self.user,
            category="bonus",
            metadata__action="claim"
        ).first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, Decimal("50.00"))
        self.assertEqual(tx.tx_type, "credit")
        self.assertEqual(tx.status, "success")

    def test_claim_locked_bonus_fails(self):
        """Test claiming a locked bonus fails"""
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("50.00"),
            locked=True
        )
        
        result = BonusService.claim_bonus(bonus)
        self.assertFalse(result)
        
        # Verify bonus status unchanged
        bonus.refresh_from_db()
        self.assertEqual(bonus.status, "locked")

    def test_claim_already_used_bonus_fails(self):
        """Test claiming an already used bonus fails"""
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("50.00"),
            locked=True
        )
        
        BonusService.unlock_bonus(bonus)
        BonusService.apply_bonus_to_wallet(bonus)
        bonus.refresh_from_db()
        
        # Claim once
        result1 = BonusService.claim_bonus(bonus)
        self.assertTrue(result1)
        
        # Try to claim again
        bonus.refresh_from_db()
        result2 = BonusService.claim_bonus(bonus)
        self.assertFalse(result2)
        
        # Verify wallet balance hasn't doubled
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.balance, Decimal("50.00"))

    def test_claim_with_insufficient_locked_balance_fails(self):
        """Test claiming bonus when locked_balance is insufficient"""
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("50.00"),
            locked=True
        )
        
        BonusService.unlock_bonus(bonus)
        # Don't apply to wallet - locked_balance will be 0
        
        bonus.refresh_from_db()
        result = BonusService.claim_bonus(bonus)
        
        # Should fail due to insufficient locked balance
        self.assertFalse(result)
        
        # Verify bonus status unchanged
        bonus.refresh_from_db()
        self.assertEqual(bonus.status, "unlocked")


class ClaimBonusAPITests(TestCase):
    """Test the ClaimBonusView API endpoint"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="apiuser@test.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.get(user=self.user)
        
        self.other_user = User.objects.create_user(
            email="otheruser@test.com",
            password="testpass123"
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        self.bonus_type = BonusType.objects.create(
            name="welcome",
            display_name="Welcome Bonus",
            is_active=True,
            default_amount=Decimal("100.00")
        )

    def test_claim_bonus_api_success(self):
        """Test successful bonus claim via API"""
        # Create and prepare bonus
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("75.00"),
            locked=True
        )
        BonusService.unlock_bonus(bonus)
        BonusService.apply_bonus_to_wallet(bonus)
        
        # Make API request
        response = self.client.post(f"/api/rewards/claim/{bonus.id}/")
        
        # Verify response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertIn("Successfully claimed", response.data["message"])
        
        # Verify bonus data in response
        self.assertEqual(response.data["bonus"]["status"], "used")
        
        # Verify wallet data in response
        self.assertEqual(Decimal(response.data["wallet"]["balance"]), Decimal("75.00"))
        self.assertEqual(Decimal(response.data["wallet"]["locked_balance"]), Decimal("0.00"))

    def test_claim_bonus_api_unauthorized(self):
        """Test claiming another user's bonus fails"""
        # Create bonus for other user
        bonus = BonusService.create_bonus(
            user=self.other_user,
            bonus_type=self.bonus_type,
            amount=Decimal("75.00"),
            locked=True
        )
        BonusService.unlock_bonus(bonus)
        BonusService.apply_bonus_to_wallet(bonus)
        
        # Try to claim as current user
        response = self.client.post(f"/api/rewards/claim/{bonus.id}/")
        
        # Should be forbidden
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("permission", response.data["error"].lower())

    def test_claim_bonus_api_locked_bonus(self):
        """Test API returns error for locked bonus"""
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("75.00"),
            locked=True
        )
        
        response = self.client.post(f"/api/rewards/claim/{bonus.id}/")
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be claimed", response.data["error"].lower())

    def test_claim_bonus_api_not_found(self):
        """Test API returns 404 for non-existent bonus"""
        response = self.client.post("/api/rewards/claim/99999/")
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_claim_bonus_api_unauthenticated(self):
        """Test unauthenticated request is rejected"""
        client = APIClient()
        
        bonus = BonusService.create_bonus(
            user=self.user,
            bonus_type=self.bonus_type,
            amount=Decimal("75.00"),
            locked=True
        )
        BonusService.unlock_bonus(bonus)
        BonusService.apply_bonus_to_wallet(bonus)
        
        response = client.post(f"/api/rewards/claim/{bonus.id}/")
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
