# rewards/tests/test_rewards_engine.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from wallet.models import Wallet, WalletTransaction
from rewards.models import BonusType, Bonus
from rewards.engine import RewardEngine
from decimal import Decimal

User = get_user_model()


class RewardEngineTests(TestCase):

    def setUp(self):
        # Users
        self.referrer = User.objects.create_user(email="referrer@test.com", password="pass")
        self.referee = User.objects.create_user(email="referee@test.com", password="pass", referred_by=self.referrer)

        # Ensure wallets exist
        self.referrer_wallet = Wallet.objects.get(user=self.referrer)
        self.referee_wallet = Wallet.objects.get(user=self.referee)

    def create_bonus_type(self, **kwargs):
        return BonusType.objects.create(
            name=kwargs.get("name", "test_bonus"),
            display_name=kwargs.get("display_name", "Test Bonus"),
            is_active=True,
            default_amount=kwargs.get("default_amount", Decimal("100")),
            award_trigger=kwargs.get("award_trigger", "manual"),
            default_rules=kwargs.get("default_rules", {}),
        )

    # ----------------------------------------------------------
    # BASIC BONUS CREDITING
    # ----------------------------------------------------------
    def test_basic_bonus_credit_locked(self):
        bonus_type = self.create_bonus_type(
            default_rules={"locked": True}
        )

        result = RewardEngine.credit(
            user=self.referrer,
            bonus_type=bonus_type,
            amount=100,
            event="test_event",
            context={"id": "1"}
        )

        self.assertEqual(len(result["created"]), 1)
        bonus = result["created"][0]
        self.assertEqual(bonus.amount, Decimal("100"))
        self.assertEqual(bonus.is_locked, True)

        # Wallet DOES NOT increase
        self.referrer_wallet.refresh_from_db()
        self.assertEqual(self.referrer_wallet.balance, Decimal("0"))
        self.assertEqual(self.referrer_wallet.locked_balance, Decimal("0"))

    def test_basic_bonus_credit_unlocked(self):
        bonus_type = self.create_bonus_type(
            default_rules={"locked": False}
        )

        result = RewardEngine.credit(
            user=self.referee,
            bonus_type=bonus_type,
            amount=50,
            event="manual_test",
            context={"x": "1"}
        )

        self.assertEqual(len(result["created"]), 1)
        bonus = result["created"][0]
        self.assertEqual(bonus.amount, Decimal("50"))
        self.assertFalse(bonus.is_locked)

        # Wallet should be credited instantly
        self.referee_wallet.refresh_from_db()
        self.assertEqual(self.referee_wallet.locked_balance, Decimal("0"))
        self.assertEqual(self.referee_wallet.balance, Decimal("50"))

        # WalletTransaction is recorded
        tx = WalletTransaction.objects.filter(user=self.referee, category="bonus").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.amount, Decimal("50"))

    # ----------------------------------------------------------
    # IDEMPOTENCY TESTS
    # ----------------------------------------------------------
    def test_bonus_idempotency(self):
        bonus_type = self.create_bonus_type()

        ctx = {"id": "abc123"}

        # First call
        r1 = RewardEngine.credit(
            user=self.referrer,
            bonus_type=bonus_type,
            amount=100,
            event="deposit_made",
            context=ctx,
        )
        self.assertEqual(len(r1["created"]), 1)

        # Duplicate call with same signature
        r2 = RewardEngine.credit(
            user=self.referrer,
            bonus_type=bonus_type,
            amount=100,
            event="deposit_made",
            context=ctx,
        )
        self.assertEqual(len(r2["created"]), 0)
        self.assertEqual(len(r2["existing"]), 1)

        # Database has exactly ONE Bonus
        bonuses = Bonus.objects.filter(user=self.referrer, bonus_type=bonus_type)
        self.assertEqual(bonuses.count(), 1)

    # ----------------------------------------------------------
    # REFERRAL: REFEREE DEPOSIT + TX BONUS
    # ----------------------------------------------------------
    def test_referral_double_reward(self):
        bonus_type = self.create_bonus_type(
            default_rules={
                "locked": False,
                "give_referrer": True,
                "give_referee": True,
                "referrer_amount": 150,
                "referee_amount": 80,
            },
            award_trigger="referee_deposit_and_tx",
        )

        event_ctx = {"deposit_id": "123", "tx_id": "777"}

        # Fire referral trigger
        result = RewardEngine.credit(
            user=self.referrer,
            referee=self.referee,
            bonus_type=bonus_type,
            amount=150,
            event="referee_deposit_and_tx",
            context=event_ctx
        )

        # Should award BOTH users
        self.assertEqual(len(result["created"]), 2)

        # Check exact assigned amounts
        referrer_bonus = Bonus.objects.filter(user=self.referrer, bonus_type=bonus_type).first()
        referee_bonus = Bonus.objects.filter(user=self.referee, bonus_type=bonus_type).first()

        self.assertEqual(referrer_bonus.amount, Decimal("150"))
        self.assertEqual(referee_bonus.amount, Decimal("80"))

        # Wallet credited
        self.referrer_wallet.refresh_from_db()
        self.referee_wallet.refresh_from_db()

        self.assertEqual(self.referrer_wallet.balance, Decimal("150"))
        self.assertEqual(self.referee_wallet.balance, Decimal("80"))

    # ----------------------------------------------------------
    # WITHDRAWAL-RESTRICTED BONUSES
    # ----------------------------------------------------------
    def test_withdrawal_restricted_flag(self):
        bonus_type = self.create_bonus_type(
            default_rules={
                "locked": False,
                "withdrawal_restricted": True,
            }
        )

        result = RewardEngine.credit(
            user=self.referee,
            bonus_type=bonus_type,
            amount=200,
            event="deposit_made",
            context={"check": 1},
        )

        bonus = result["created"][0]
        self.assertTrue(bonus.withdrawal_restricted)

        self.referee_wallet.refresh_from_db()
        self.assertEqual(self.referee_wallet.balance, Decimal("200"))
