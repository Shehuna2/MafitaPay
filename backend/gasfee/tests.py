from django.test import TestCase
from django.core.cache import cache
from decimal import Decimal
from unittest.mock import Mock, patch, MagicMock
from web3 import Web3

from .gas_oracle import GasOracle, GAS_TIERS, GAS_PRICE_CAPS


class GasOracleTestCase(TestCase):
    """Test cases for Gas Oracle service"""
    
    def setUp(self):
        """Set up test fixtures"""
        cache.clear()
        self.mock_w3 = Mock(spec=Web3)
        
    def tearDown(self):
        """Clean up after tests"""
        cache.clear()
    
    def test_get_tier_multipliers_standard(self):
        """Test getting standard tier multipliers"""
        multipliers = GasOracle.get_tier_multipliers("standard")
        self.assertEqual(multipliers["priority_multiplier"], Decimal("1.0"))
        self.assertEqual(multipliers["base_multiplier"], Decimal("1.0"))
    
    def test_get_tier_multipliers_fast(self):
        """Test getting fast tier multipliers"""
        multipliers = GasOracle.get_tier_multipliers("fast")
        self.assertEqual(multipliers["priority_multiplier"], Decimal("1.5"))
        self.assertEqual(multipliers["base_multiplier"], Decimal("1.2"))
    
    def test_get_tier_multipliers_economy(self):
        """Test getting economy tier multipliers"""
        multipliers = GasOracle.get_tier_multipliers("economy")
        self.assertEqual(multipliers["priority_multiplier"], Decimal("0.8"))
        self.assertEqual(multipliers["base_multiplier"], Decimal("0.9"))
    
    def test_get_tier_multipliers_invalid(self):
        """Test getting multipliers with invalid tier defaults to standard"""
        multipliers = GasOracle.get_tier_multipliers("invalid")
        self.assertEqual(multipliers["priority_multiplier"], Decimal("1.0"))
        self.assertEqual(multipliers["base_multiplier"], Decimal("1.0"))
    
    def test_get_gas_cap_eth(self):
        """Test getting gas cap for ETH"""
        cap = GasOracle.get_gas_cap("ETH")
        self.assertEqual(cap, Decimal("300"))
    
    def test_get_gas_cap_arb(self):
        """Test getting gas cap for Arbitrum"""
        cap = GasOracle.get_gas_cap("ARB")
        self.assertEqual(cap, Decimal("10"))
    
    def test_get_gas_cap_unknown_chain(self):
        """Test getting gas cap for unknown chain returns default"""
        cap = GasOracle.get_gas_cap("UNKNOWN")
        self.assertEqual(cap, Decimal("100"))
    
    def test_fetch_eip1559_fees_basic(self):
        """Test fetching EIP-1559 fees"""
        # Mock Web3 instance
        self.mock_w3.eth.get_block.return_value = {
            "baseFeePerGas": Web3.to_wei(30, "gwei")
        }
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        fees = GasOracle.fetch_eip1559_fees(self.mock_w3, "ETH", "standard")
        
        self.assertIn("maxFeePerGas", fees)
        self.assertIn("maxPriorityFeePerGas", fees)
        self.assertEqual(fees["type"], 2)
        self.assertGreater(fees["maxFeePerGas"], 0)
        self.assertGreater(fees["maxPriorityFeePerGas"], 0)
    
    def test_fetch_eip1559_fees_with_cap(self):
        """Test that EIP-1559 fees respect gas price caps"""
        # Mock very high base fee
        self.mock_w3.eth.get_block.return_value = {
            "baseFeePerGas": Web3.to_wei(500, "gwei")  # Very high
        }
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        fees = GasOracle.fetch_eip1559_fees(self.mock_w3, "ARB", "standard")
        
        # Should be capped at 10 Gwei for Arbitrum
        cap_wei = Web3.to_wei(10, "gwei")
        self.assertLessEqual(fees["maxFeePerGas"], cap_wei)
    
    def test_fetch_eip1559_fees_caching(self):
        """Test that gas fees are cached"""
        self.mock_w3.eth.get_block.return_value = {
            "baseFeePerGas": Web3.to_wei(30, "gwei")
        }
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        # First call
        fees1 = GasOracle.fetch_eip1559_fees(self.mock_w3, "ETH", "standard")
        
        # Second call should use cache
        fees2 = GasOracle.fetch_eip1559_fees(self.mock_w3, "ETH", "standard")
        
        self.assertEqual(fees1, fees2)
        # Should only call get_block once
        self.assertEqual(self.mock_w3.eth.get_block.call_count, 1)
    
    def test_fetch_legacy_gas_price(self):
        """Test fetching legacy gas price"""
        self.mock_w3.eth.gas_price = Web3.to_wei(20, "gwei")
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        fees = GasOracle.fetch_legacy_gas_price(self.mock_w3, "BSC", "standard")
        
        self.assertIn("gasPrice", fees)
        self.assertEqual(fees["type"], 0)
        self.assertGreater(fees["gasPrice"], 0)
    
    def test_fetch_legacy_gas_price_with_tier(self):
        """Test legacy gas price respects tier multipliers"""
        self.mock_w3.eth.gas_price = Web3.to_wei(20, "gwei")
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        standard_fees = GasOracle.fetch_legacy_gas_price(self.mock_w3, "BSC", "standard")
        fast_fees = GasOracle.fetch_legacy_gas_price(self.mock_w3, "BSC", "fast")
        economy_fees = GasOracle.fetch_legacy_gas_price(self.mock_w3, "BSC", "economy")
        
        # Fast should be higher than standard, economy should be lower
        self.assertGreater(fast_fees["gasPrice"], standard_fees["gasPrice"])
        self.assertLess(economy_fees["gasPrice"], standard_fees["gasPrice"])
    
    def test_bump_gas_price_eip1559(self):
        """Test bumping EIP-1559 gas prices"""
        original_fees = {
            "maxFeePerGas": 1000000000,  # 1 Gwei
            "maxPriorityFeePerGas": 100000000,  # 0.1 Gwei
            "type": 2
        }
        
        bumped_fees = GasOracle.bump_gas_price(original_fees, bump_percent=20)
        
        self.assertEqual(bumped_fees["maxFeePerGas"], 1200000000)  # 1.2 Gwei
        self.assertEqual(bumped_fees["maxPriorityFeePerGas"], 120000000)  # 0.12 Gwei
        self.assertEqual(bumped_fees["type"], 2)
    
    def test_bump_gas_price_legacy(self):
        """Test bumping legacy gas prices"""
        original_fees = {
            "gasPrice": 1000000000,  # 1 Gwei
            "type": 0
        }
        
        bumped_fees = GasOracle.bump_gas_price(original_fees, bump_percent=20)
        
        self.assertEqual(bumped_fees["gasPrice"], 1200000000)  # 1.2 Gwei
        self.assertEqual(bumped_fees["type"], 0)
    
    def test_estimate_transaction_cost(self):
        """Test estimating transaction cost"""
        self.mock_w3.eth.get_block.return_value = {
            "baseFeePerGas": Web3.to_wei(30, "gwei")
        }
        self.mock_w3.to_wei = Web3.to_wei
        self.mock_w3.from_wei = Web3.from_wei
        
        gas_limit = 21000
        cost, fees = GasOracle.estimate_transaction_cost(
            self.mock_w3, "ETH", gas_limit, "standard"
        )
        
        self.assertIsInstance(cost, Decimal)
        self.assertGreater(cost, 0)
        self.assertIn("maxFeePerGas", fees)


class EVMSenderTestCase(TestCase):
    """Test cases for EVM sender with gas improvements"""
    
    @patch('gasfee.evm_sender.get_web3')
    @patch('gasfee.evm_sender.Account')
    def test_send_evm_with_tier(self, mock_account, mock_get_web3):
        """Test sending EVM transaction with gas tier"""
        # This is a basic test structure - full implementation would require
        # more complex mocking of Web3 and transaction signing
        pass


class GasTiersIntegrationTestCase(TestCase):
    """Integration tests for gas tier functionality"""
    
    def test_all_tiers_defined(self):
        """Test that all expected tiers are defined"""
        expected_tiers = ["fast", "standard", "economy"]
        for tier in expected_tiers:
            self.assertIn(tier, GAS_TIERS)
            self.assertIn("priority_multiplier", GAS_TIERS[tier])
            self.assertIn("base_multiplier", GAS_TIERS[tier])
    
    def test_all_chains_have_caps(self):
        """Test that all major chains have gas caps defined"""
        expected_chains = ["ETH", "ARB", "BASE", "OP", "POL", "AVAX", "LINEA", "BSC"]
        for chain in expected_chains:
            cap = GasOracle.get_gas_cap(chain)
            self.assertIsInstance(cap, Decimal)
            self.assertGreater(cap, 0)
