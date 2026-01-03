from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from decimal import Decimal
from unittest.mock import patch, MagicMock
import json

from .models import Crypto, CryptoPurchase, TransactionMonitoring
from .utils import (
    validate_evm_address, validate_solana_address, validate_near_address,
    validate_ton_address, validate_wallet_address, check_rapid_purchases,
    check_unusual_amount, sanitize_error_message
)
from wallet.models import Wallet

User = get_user_model()


class WalletAddressValidationTestCase(TestCase):
    """Test comprehensive wallet address validation across all supported blockchains"""

    def test_evm_address_validation_basic(self):
        """Test basic EVM address format validation"""
        # Valid addresses (40 hex characters)
        valid_addresses = [
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb0",  # Lowercase
            "0x742D35CC6634C0532925A3B844BC9E7595F0BEB0",  # Uppercase
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",  # Mixed case (checksummed)
            "0x0000000000000000000000000000000000000000",  # Zero address
        ]
        
        for addr in valid_addresses:
            with self.subTest(address=addr):
                self.assertTrue(validate_evm_address(addr), f"Should accept valid address: {addr}")

    def test_evm_address_validation_checksum(self):
        """Test EIP-55 checksum validation for EVM addresses"""
        # Correct checksum
        correct_checksum = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
        self.assertTrue(validate_evm_address(correct_checksum))
        
        # Incorrect checksum (wrong case)
        wrong_checksum = "0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED"
        # This should still pass as it's all uppercase (no checksum enforcement)
        self.assertTrue(validate_evm_address(wrong_checksum))
        
        # Mixed case with wrong checksum
        invalid_mixed = "0x5aAeb6053f3e94c9b9a09f33669435e7ef1beaed"
        self.assertFalse(validate_evm_address(invalid_mixed))

    def test_evm_address_validation_invalid(self):
        """Test rejection of invalid EVM addresses"""
        invalid_addresses = [
            "",  # Empty
            "0x123",  # Too short
            "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",  # Invalid hex
            "742d35cc6634c0532925a3b844bc9e7595f0beb0",  # Missing 0x prefix
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb0123",  # Too long
        ]
        
        for addr in invalid_addresses:
            with self.subTest(address=addr):
                self.assertFalse(validate_evm_address(addr), f"Should reject invalid address: {addr}")

    def test_solana_address_validation(self):
        """Test Solana base58 address validation"""
        # Valid Solana addresses (32 bytes in base58)
        valid_addresses = [
            "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK",  # Example Solana address
            "So11111111111111111111111111111111111111112",  # Wrapped SOL
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC on Solana
        ]
        
        for addr in valid_addresses:
            with self.subTest(address=addr):
                self.assertTrue(validate_solana_address(addr), f"Should accept valid Solana address: {addr}")

    def test_solana_address_validation_invalid(self):
        """Test rejection of invalid Solana addresses"""
        invalid_addresses = [
            "",  # Empty
            "short",  # Too short
            "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",  # Ethereum address
            "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK" + "X" * 50,  # Too long
            "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJe0",  # Invalid base58 (contains 0)
            "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeO",  # Invalid base58 (contains O)
        ]
        
        for addr in invalid_addresses:
            with self.subTest(address=addr):
                self.assertFalse(validate_solana_address(addr), f"Should reject invalid Solana address: {addr}")

    def test_near_address_validation_implicit(self):
        """Test NEAR implicit account (64 hex characters) validation"""
        valid_implicit = "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de"
        self.assertTrue(validate_near_address(valid_implicit))
        
        # Invalid implicit addresses
        invalid_implicit = [
            "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6d",  # 63 chars
            "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6dez",  # Non-hex
            "98793CD91A3F870FB126F66285808C7E094AFCFC4EDA8A970F6648CDF0DBD6DE",  # Uppercase (should be lowercase)
        ]
        
        for addr in invalid_implicit:
            with self.subTest(address=addr):
                self.assertFalse(validate_near_address(addr), f"Should reject invalid implicit address: {addr}")

    def test_near_address_validation_named(self):
        """Test NEAR named account validation"""
        valid_named = [
            "alice.near",
            "bob.testnet",
            "my-account.near",
            "user_123.near",
            "a.near",  # Minimum 2 chars
            "test.test.test.near",  # Nested subaccounts
        ]
        
        for addr in valid_named:
            with self.subTest(address=addr):
                self.assertTrue(validate_near_address(addr), f"Should accept valid named address: {addr}")

    def test_near_address_validation_invalid_named(self):
        """Test rejection of invalid NEAR named accounts"""
        invalid_named = [
            "",  # Empty
            "a",  # Too short
            "Alice.near",  # Uppercase
            "-alice.near",  # Starts with separator
            "alice-.near",  # Ends with separator
            "alice..near",  # Consecutive separators
            "alice@near",  # Invalid character
            "alice near",  # Space
        ]
        
        for addr in invalid_named:
            with self.subTest(address=addr):
                self.assertFalse(validate_near_address(addr), f"Should reject invalid named address: {addr}")

    def test_ton_address_validation(self):
        """Test TON address validation"""
        valid_addresses = [
            "EQD-cvR0Nz6XAyRBvbhz-abTrRC6sI5tvHvvpeQraV9UAAD7",  # Example TON address
            "0:8a8627861a5dd96c9db3ce0807b122da5ed473934ce7568a5b4b1c361cbb28ae",  # With workchain
            "-1:8a8627861a5dd96c9db3ce0807b122da5ed473934ce7568a5b4b1c361cbb28ae",  # Workchain -1
        ]
        
        for addr in valid_addresses:
            with self.subTest(address=addr):
                self.assertTrue(validate_ton_address(addr), f"Should accept valid TON address: {addr}")

    def test_ton_address_validation_invalid(self):
        """Test rejection of invalid TON addresses"""
        invalid_addresses = [
            "",  # Empty
            "short",  # Too short
            "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",  # Ethereum address
            "alice.near",  # NEAR address
            "a:invalid",  # Invalid workchain
        ]
        
        for addr in invalid_addresses:
            with self.subTest(address=addr):
                self.assertFalse(validate_ton_address(addr), f"Should reject invalid TON address: {addr}")

    def test_validate_wallet_address_by_symbol(self):
        """Test the main validate_wallet_address function with different symbols"""
        # EVM chains
        eth_addr = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0"
        for symbol in ['ETH', 'ARB', 'BNB', 'BASE', 'OP', 'POL', 'AVAX', 'LINEA']:
            with self.subTest(symbol=symbol):
                self.assertTrue(validate_wallet_address(symbol, eth_addr))
        
        # Solana
        sol_addr = "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK"
        self.assertTrue(validate_wallet_address('SOL', sol_addr))
        self.assertFalse(validate_wallet_address('SOL', eth_addr))
        
        # NEAR
        near_addr = "alice.near"
        self.assertTrue(validate_wallet_address('NEAR', near_addr))
        self.assertFalse(validate_wallet_address('NEAR', eth_addr))
        
        # TON
        ton_addr = "EQD-cvR0Nz6XAyRBvbhz-abTrRC6sI5tvHvvpeQraV9UAAD7"
        self.assertTrue(validate_wallet_address('TON', ton_addr))
        self.assertFalse(validate_wallet_address('TON', eth_addr))

    def test_validate_wallet_address_token_symbols(self):
        """Test wallet address validation for token-specific symbols (e.g., BNB-USDT, BASE-USDC)"""
        # EVM address for testing
        evm_addr = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0"
        
        # Token symbols that should be validated as EVM addresses
        token_symbols = [
            'BNB-USDT',   # USDT on BNB chain
            'BASE-USDC',  # USDC on BASE chain
            'BASE-ETH',   # ETH on BASE chain (already in codebase)
            'ARB-ETH',    # ETH on Arbitrum (already in codebase)
            'OP-ETH',     # ETH on Optimism (already in codebase)
            'LINEA-ETH',  # ETH on Linea (already in codebase)
        ]
        
        for symbol in token_symbols:
            with self.subTest(symbol=symbol):
                # Should accept valid EVM address
                self.assertTrue(
                    validate_wallet_address(symbol, evm_addr),
                    f"{symbol} should accept valid EVM address"
                )
                
                # Should reject non-EVM addresses
                self.assertFalse(
                    validate_wallet_address(symbol, "alice.near"),
                    f"{symbol} should reject NEAR address"
                )
                self.assertFalse(
                    validate_wallet_address(symbol, "7EqQdEULxWcraVx3mXKFjc84LhCkMGZCkRuDpvcMwJeK"),
                    f"{symbol} should reject Solana address"
                )
                
                # Should reject invalid EVM address
                self.assertFalse(
                    validate_wallet_address(symbol, "0x123"),
                    f"{symbol} should reject invalid EVM address"
                )


class SecurityLoggingTestCase(TestCase):
    """Test security logging and fraud detection"""

    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("100000.00"))
        
        # Create a crypto for testing
        self.crypto = Crypto.objects.create(
            name="Ethereum",
            symbol="ETH",
            network="ETH",
            coingecko_id="ethereum"
        )

    def test_rapid_purchase_detection(self):
        """Test detection of rapid successive purchases"""
        # Create multiple purchases within time window
        for i in range(3):
            CryptoPurchase.objects.create(
                user=self.user,
                crypto=self.crypto,
                input_amount=Decimal("1000"),
                input_currency="NGN",
                crypto_amount=Decimal("0.01"),
                total_price=Decimal("1000"),
                wallet_address="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                status="completed",
                request_id=f"req_{i}"
            )
        
        # This should trigger rapid purchase detection
        is_rapid = check_rapid_purchases(self.user, time_window_minutes=5, max_purchases=3)
        self.assertTrue(is_rapid)
        
        # Verify monitoring record was created
        monitoring = TransactionMonitoring.objects.filter(
            user=self.user,
            event_type='rapid_purchase'
        ).first()
        self.assertIsNotNone(monitoring)
        self.assertEqual(monitoring.severity, 'high')

    def test_unusual_amount_detection_high(self):
        """Test detection of unusually high transaction amounts"""
        high_amount = Decimal("6000000")  # 6M NGN
        
        is_unusual = check_unusual_amount(self.user, high_amount, "ETH")
        self.assertTrue(is_unusual)
        
        # Verify monitoring record
        monitoring = TransactionMonitoring.objects.filter(
            user=self.user,
            event_type='unusual_amount',
            severity='high'
        ).first()
        self.assertIsNotNone(monitoring)

    def test_unusual_amount_detection_low(self):
        """Test detection of unusually low transaction amounts"""
        low_amount = Decimal("50")  # Very low amount
        
        is_unusual = check_unusual_amount(self.user, low_amount, "ETH")
        self.assertTrue(is_unusual)
        
        # Verify monitoring record
        monitoring = TransactionMonitoring.objects.filter(
            user=self.user,
            event_type='unusual_amount',
            severity='low'
        ).first()
        self.assertIsNotNone(monitoring)

    def test_normal_amount_no_alert(self):
        """Test that normal amounts don't trigger alerts"""
        normal_amount = Decimal("50000")  # Normal amount
        
        is_unusual = check_unusual_amount(self.user, normal_amount, "ETH")
        self.assertFalse(is_unusual)

    def test_sanitize_error_message(self):
        """Test sanitization of error messages to prevent information leakage"""
        # Test address redaction
        error_with_eth_addr = "Failed to send to 0x742d35cc6634c0532925a3b844bc9e7595f0beb0"
        sanitized = sanitize_error_message(error_with_eth_addr)
        self.assertNotIn("0x742d35cc", sanitized)
        self.assertIn("[REDACTED_ADDRESS]", sanitized)
        
        # Test sensitive keyword redaction
        error_with_key = "Invalid private_key provided"
        sanitized = sanitize_error_message(error_with_key)
        self.assertIn("[REDACTED]", sanitized)
        
        # Test secret redaction
        error_with_secret = "Secret validation failed"
        sanitized = sanitize_error_message(error_with_secret)
        self.assertIn("[REDACTED]", sanitized)


class RateLimitingTestCase(TestCase):
    """Test rate limiting for price feed APIs"""

    @patch('gasfee.price_services.requests.get')
    @patch('gasfee.price_services.cache')
    def test_rate_limiting_enforced(self, mock_cache, mock_requests):
        """Test that rate limiting is properly enforced"""
        from gasfee.price_services import rate_limited_request
        
        # Mock cache to return timestamp
        mock_cache.get.return_value = 0
        mock_cache.set.return_value = None
        
        # Mock successful response
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.json.return_value = {"test": "data"}
        mock_requests.return_value = mock_response
        
        # Make request
        response = rate_limited_request("https://api.test.com", params={"test": "param"})
        
        # Verify cache was checked and set
        mock_cache.get.assert_called()
        mock_cache.set.assert_called()
        
        # Verify request was made
        mock_requests.assert_called_once()

    @patch('gasfee.price_services.fetch_from_coingecko')
    @patch('gasfee.price_services.cache')
    def test_price_caching(self, mock_cache, mock_fetch):
        """Test that price results are properly cached"""
        from gasfee.price_services import get_crypto_prices_in_usd
        
        # Mock cache hit
        cached_price = Decimal("2500.00")
        mock_cache.get.return_value = cached_price
        
        # Request price
        prices = get_crypto_prices_in_usd(["ethereum"])
        
        # Should return cached value without fetching
        self.assertEqual(prices["ethereum"], cached_price)
        mock_fetch.assert_not_called()

    @patch('gasfee.price_services.fetch_from_coingecko')
    @patch('gasfee.price_services.fetch_from_binance')
    @patch('gasfee.price_services.cache')
    def test_fallback_on_rate_limit(self, mock_cache, mock_binance, mock_coingecko):
        """Test fallback to Binance when CoinGecko is rate limited"""
        from gasfee.price_services import get_crypto_prices_in_usd
        
        # Mock cache miss
        mock_cache.get.side_effect = [None, None, Decimal("2500.00")]
        
        # Mock CoinGecko failure (rate limit)
        mock_coingecko.side_effect = Exception("Rate limited")
        
        # Mock Binance success
        binance_price = Decimal("2500.00")
        mock_binance.return_value = binance_price
        
        # Request price
        prices = get_crypto_prices_in_usd(["ethereum"])
        
        # Should fall back to Binance
        self.assertEqual(prices["ethereum"], binance_price)
        mock_binance.assert_called_with("ethereum")


class CryptoPurchaseFlowTestCase(TestCase):
    """Test comprehensive crypto purchase flows with security features"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="buyer@example.com",
            password="testpass123"
        )
        self.wallet = Wallet.objects.create(user=self.user, balance=Decimal("100000.00"))
        
        self.crypto = Crypto.objects.create(
            name="Ethereum",
            symbol="ETH",
            network="ETH",
            coingecko_id="ethereum"
        )

    def test_invalid_wallet_address_rejection(self):
        """Test that invalid wallet addresses are rejected"""
        self.client.force_login(self.user)
        
        with patch('gasfee.views.get_crypto_prices_in_usd') as mock_prices, \
             patch('gasfee.views.get_usd_ngn_rate_with_margin') as mock_rate:
            
            mock_prices.return_value = {"ethereum": Decimal("2500")}
            mock_rate.return_value = Decimal("1500")
            
            # Invalid address
            response = self.client.post(
                f'/api/crypto/buy/{self.crypto.id}/',
                data=json.dumps({
                    "amount": 10000,
                    "currency": "NGN",
                    "wallet_address": "invalid_address",
                    "request_id": "test_req_1"
                }),
                content_type='application/json'
            )
            
            self.assertEqual(response.status_code, 400)
            self.assertIn("invalid_wallet_address", response.json().get("error", ""))

    def test_valid_evm_address_acceptance(self):
        """Test that valid EVM addresses are accepted"""
        from gasfee.views import _validate_wallet_address
        
        valid_address = "0x742d35cc6634c0532925a3b844bc9e7595f0beb0"
        self.assertTrue(_validate_wallet_address("ETH", valid_address))


class RateLimiterNonBlockingTestCase(TestCase):
    """Test that the rate limiter doesn't block threads unnecessarily"""

    @patch('gasfee.price_service.requests.get')
    @patch('gasfee.price_service.cache')
    def test_rate_limiter_sleeps_outside_lock(self, mock_cache, mock_requests):
        """Test that time.sleep() happens outside the lock"""
        from gasfee.price_service import rate_limited_request
        import time
        
        # Track when requests were made
        request_times = []
        
        def track_request(*args, **kwargs):
            request_times.append(time.time())
            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            return mock_response
        
        mock_requests.side_effect = track_request
        
        # First call - no wait needed
        mock_cache.get.return_value = 0  # Last call was long ago
        rate_limited_request("https://api.test.com")
        
        # Second call - should wait
        mock_cache.get.return_value = time.time() - 1  # Last call was 1 second ago
        rate_limited_request("https://api.test.com")
        
        # Verify both requests were made
        self.assertEqual(len(request_times), 2)
        
        # Verify second request was delayed by at least 3 seconds (MIN_INTERVAL=4, elapsed=1)
        time_diff = request_times[1] - request_times[0]
        self.assertGreaterEqual(time_diff, 3.0)

    @patch('gasfee.price_service.requests.get')
    @patch('gasfee.price_service.cache')  
    def test_rate_limiter_concurrent_access(self, mock_cache, mock_requests):
        """Test that multiple threads can check rate limit without blocking each other during sleep"""
        from gasfee.price_service import rate_limited_request
        import threading
        import time
        
        results = []
        
        def make_request(index):
            try:
                mock_response = MagicMock()
                mock_response.raise_for_status.return_value = None
                mock_requests.return_value = mock_response
                
                rate_limited_request("https://api.test.com")
                results.append({"index": index, "success": True})
            except Exception as e:
                results.append({"index": index, "error": str(e)})
        
        # Set up cache to require waiting
        mock_cache.get.return_value = time.time() - 1  # Last call 1 second ago
        mock_cache.set.return_value = None
        
        # Create multiple threads
        threads = [threading.Thread(target=make_request, args=(i,)) for i in range(3)]
        
        start_time = time.time()
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)  # Wait max 15 seconds
        
        total_time = time.time() - start_time
        
        # All threads should complete
        self.assertEqual(len(results), 3)
        
        # Total time should be less than if they were sequential (3 * 4 = 12 seconds)
        # With concurrent sleeping, it should be closer to 4-6 seconds
        self.assertLess(total_time, 10)


class RPCConfigurationTestCase(TestCase):
    """Test RPC URL configuration for blockchain connections"""

    def test_utilss_send_evm_requires_env_var(self):
        """Test that send_evm in utilss.py requires BASE_RPC_URL environment variable"""
        from gasfee.utilss import send_evm
        import os
        
        # Temporarily unset the environment variable
        old_value = os.environ.get('BASE_RPC_URL')
        if 'BASE_RPC_URL' in os.environ:
            del os.environ['BASE_RPC_URL']
        
        try:
            # Should raise ValueError when RPC URL is not set
            with self.assertRaises(ValueError) as context:
                send_evm("BASE", "0x742d35cc6634c0532925a3b844bc9e7595f0beb0", 1000000000000000000)
            
            self.assertIn("Missing RPC URL", str(context.exception))
            self.assertIn("BASE_RPC_URL", str(context.exception))
        finally:
            # Restore the environment variable
            if old_value is not None:
                os.environ['BASE_RPC_URL'] = old_value

    def test_evm_sender_requires_env_var(self):
        """Test that send_evm in evm_sender.py requires BASE_RPC_URL environment variable"""
        from gasfee.evm_sender import send_evm
        from decimal import Decimal
        import os
        
        # Temporarily unset the environment variable
        old_value = os.environ.get('BASE_RPC_URL')
        if 'BASE_RPC_URL' in os.environ:
            del os.environ['BASE_RPC_URL']
        
        try:
            # Should raise ValueError when RPC URL is not set
            with self.assertRaises(ValueError) as context:
                send_evm("BASE", "0x742d35cc6634c0532925a3b844bc9e7595f0beb0", Decimal("0.001"))
            
            self.assertIn("Missing RPC or private key", str(context.exception))
        finally:
            # Restore the environment variable
            if old_value is not None:
                os.environ['BASE_RPC_URL'] = old_value

    @patch.dict('os.environ', {'BASE_RPC_URL': 'https://base.example.com'})
    def test_utilss_send_evm_uses_env_var(self):
        """Test that send_evm in utilss.py uses the BASE_RPC_URL from environment"""
        from gasfee.utilss import send_evm
        from web3 import Web3
        
        # This should not raise an error for missing RPC URL
        # (it will fail later for missing private key, which is expected)
        try:
            send_evm("BASE", "0x742d35cc6634c0532925a3b844bc9e7595f0beb0", 1000000000000000000)
        except ValueError as e:
            # Should fail on missing wallet config, not RPC URL
            self.assertNotIn("Missing RPC URL", str(e))
            # Should be about wallet configuration
            self.assertIn("Sender wallet not configured", str(e))


class CryptoL2CoinGeckoIDTestCase(TestCase):
    """Test CoinGecko ID handling for Layer 2 networks"""

    def test_l2_eth_token_forces_ethereum_coingecko_id(self):
        """Test that ETH tokens on L2 networks get coingecko_id='ethereum'"""
        # Test for BASE network
        base_eth = Crypto.objects.create(
            name="Ethereum on Base",
            symbol="BASE-ETH",
            network="BASE",
            coingecko_id="some-other-id"  # This should be overridden
        )
        self.assertEqual(base_eth.coingecko_id, "ethereum")
        
        # Test for Arbitrum network
        arb_eth = Crypto.objects.create(
            name="Ethereum on Arbitrum",
            symbol="ARB-ETH",
            network="ARB",
            coingecko_id="some-other-id"  # This should be overridden
        )
        self.assertEqual(arb_eth.coingecko_id, "ethereum")
        
        # Test for Optimism network
        op_eth = Crypto.objects.create(
            name="Ethereum on Optimism",
            symbol="OP-ETH",
            network="OP",
            coingecko_id="some-other-id"  # This should be overridden
        )
        self.assertEqual(op_eth.coingecko_id, "ethereum")

    def test_l2_non_eth_token_keeps_original_coingecko_id(self):
        """Test that non-ETH tokens on L2 networks keep their original coingecko_id"""
        # Create USDC on BASE
        base_usdc = Crypto.objects.create(
            name="USD Coin on Base",
            symbol="BASE-USDC",
            network="BASE",
            coingecko_id="usd-coin"
        )
        self.assertEqual(base_usdc.coingecko_id, "usd-coin")
        
        # Create USDT on BASE
        base_usdt = Crypto.objects.create(
            name="Tether on Base",
            symbol="BASE-USDT",
            network="BASE",
            coingecko_id="tether"
        )
        self.assertEqual(base_usdt.coingecko_id, "tether")
        
        # Create USDC on Arbitrum
        arb_usdc = Crypto.objects.create(
            name="USD Coin on Arbitrum",
            symbol="ARB-USDC",
            network="ARB",
            coingecko_id="usd-coin"
        )
        self.assertEqual(arb_usdc.coingecko_id, "usd-coin")
        
        # Create USDT on Optimism
        op_usdt = Crypto.objects.create(
            name="Tether on Optimism",
            symbol="OP-USDT",
            network="OP",
            coingecko_id="tether"
        )
        self.assertEqual(op_usdt.coingecko_id, "tether")

    def test_multiple_tokens_same_l2_network_no_constraint_violation(self):
        """Test that multiple different tokens can be created on the same L2 network"""
        # This is the main scenario from the issue - should not raise IntegrityError
        base_eth = Crypto.objects.create(
            name="Ethereum on Base",
            symbol="BASE-ETH",
            network="BASE",
            coingecko_id="ethereum"
        )
        
        # This should work now without constraint violation
        base_usdc = Crypto.objects.create(
            name="USD Coin on Base",
            symbol="BASE-USDC",
            network="BASE",
            coingecko_id="usd-coin"
        )
        
        # Verify both exist with different coingecko_ids
        self.assertEqual(base_eth.coingecko_id, "ethereum")
        self.assertEqual(base_usdc.coingecko_id, "usd-coin")
        
        # Verify both are on BASE network
        self.assertEqual(base_eth.network, "BASE")
        self.assertEqual(base_usdc.network, "BASE")

    def test_non_l2_network_keeps_original_coingecko_id(self):
        """Test that tokens on non-L2 networks are not affected by the L2 logic"""
        # Create ETH on mainnet
        eth_mainnet = Crypto.objects.create(
            name="Ethereum",
            symbol="ETH",
            network="ETH",
            coingecko_id="ethereum"
        )
        self.assertEqual(eth_mainnet.coingecko_id, "ethereum")
        
        # Create USDC on BNB chain
        bnb_usdc = Crypto.objects.create(
            name="USD Coin on BNB",
            symbol="BNB-USDC",
            network="BNB",
            coingecko_id="usd-coin"
        )
        self.assertEqual(bnb_usdc.coingecko_id, "usd-coin")

    def test_tokens_containing_eth_substring_not_affected(self):
        """Test that tokens with 'ETH' as a substring (but not exact match) are not affected"""
        # Create a hypothetical token with ETH in the name but not as the asset
        # For example, if there were a METH or SETH token on BASE
        base_meth = Crypto.objects.create(
            name="Synthetic ETH on Base",
            symbol="BASE-SETH",  # Contains 'ETH' but doesn't end with '-ETH'
            network="BASE",
            coingecko_id="synthetic-eth"
        )
        # Should keep its original coingecko_id, not be forced to 'ethereum'
        self.assertEqual(base_meth.coingecko_id, "synthetic-eth")

