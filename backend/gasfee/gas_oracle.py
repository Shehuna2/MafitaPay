# backend/gasfee/gas_oracle.py
"""
Gas Oracle Service - Centralized gas price fetching and caching for all chains
"""
import os
import logging
from decimal import Decimal
from typing import Dict, Optional, Tuple
from django.core.cache import cache
from web3 import Web3

logger = logging.getLogger(__name__)

# ============================================================
# GAS TIER DEFINITIONS
# ============================================================
GAS_TIERS = {
    "fast": {
        "priority_multiplier": Decimal("1.5"),
        "base_multiplier": Decimal("1.2"),
        "description": "Higher priority fee for urgent transactions"
    },
    "standard": {
        "priority_multiplier": Decimal("1.0"),
        "base_multiplier": Decimal("1.0"),
        "description": "Balanced fee for normal transactions"
    },
    "economy": {
        "priority_multiplier": Decimal("0.8"),
        "base_multiplier": Decimal("0.9"),
        "description": "Lower fee for non-urgent transactions"
    }
}

# ============================================================
# GAS PRICE CAPS (in Gwei) - Safety limits per chain
# ============================================================
GAS_PRICE_CAPS = {
    "ETH": Decimal(os.getenv("ETH_GAS_PRICE_MAX_GWEI", "300")),
    "ARB": Decimal(os.getenv("ARB_GAS_PRICE_MAX_GWEI", "10")),
    "BASE": Decimal(os.getenv("BASE_GAS_PRICE_MAX_GWEI", "10")),
    "OP": Decimal(os.getenv("OP_GAS_PRICE_MAX_GWEI", "10")),
    "POL": Decimal(os.getenv("POL_GAS_PRICE_MAX_GWEI", "500")),
    "AVAX": Decimal(os.getenv("AVAX_GAS_PRICE_MAX_GWEI", "100")),
    "LINEA": Decimal(os.getenv("LINEA_GAS_PRICE_MAX_GWEI", "20")),
    "BSC": Decimal(os.getenv("BSC_GAS_PRICE_MAX_GWEI", "20")),
}

# Cache TTL for gas prices (in seconds)
GAS_ORACLE_CACHE_TTL = int(os.getenv("GAS_ORACLE_CACHE_TTL", "30"))


class GasOracle:
    """
    Centralized gas price oracle with caching and fallback mechanisms
    """
    
    @staticmethod
    def _get_cache_key(chain: str, tier: str) -> str:
        """Generate cache key for gas prices"""
        return f"gas_price:{chain}:{tier}"
    
    @staticmethod
    def get_tier_multipliers(tier: str = "standard") -> Dict[str, Decimal]:
        """
        Get multipliers for a given gas tier
        
        Args:
            tier: Gas tier (fast/standard/economy)
            
        Returns:
            Dict with priority_multiplier and base_multiplier
        """
        tier = tier.lower()
        if tier not in GAS_TIERS:
            logger.warning(f"Unknown gas tier '{tier}', using 'standard'")
            tier = "standard"
        return GAS_TIERS[tier]
    
    @staticmethod
    def get_gas_cap(chain: str) -> Decimal:
        """
        Get maximum gas price cap for a chain (in Gwei)
        
        Args:
            chain: Chain identifier (e.g., ETH, ARB, BASE)
            
        Returns:
            Maximum gas price in Gwei
        """
        chain = chain.upper()
        return GAS_PRICE_CAPS.get(chain, Decimal("100"))  # Default cap
    
    @staticmethod
    def fetch_eip1559_fees(w3: Web3, chain: str, tier: str = "standard") -> Dict[str, int]:
        """
        Fetch EIP-1559 gas fees (maxFeePerGas and maxPriorityFeePerGas)
        
        Args:
            w3: Web3 instance
            chain: Chain identifier
            tier: Gas tier (fast/standard/economy)
            
        Returns:
            Dict with maxFeePerGas and maxPriorityFeePerGas in Wei
        """
        # Check cache first
        cache_key = GasOracle._get_cache_key(chain, tier)
        cached = cache.get(cache_key)
        if cached:
            logger.debug(f"Using cached gas prices for {chain} ({tier})")
            return cached
        
        try:
            # Get base fee from latest block
            latest_block = w3.eth.get_block("latest")
            base_fee = latest_block.get("baseFeePerGas", 0)
            
            if not base_fee:
                # Chain doesn't support EIP-1559, use legacy
                return GasOracle.fetch_legacy_gas_price(w3, chain, tier)
            
            # Get tier multipliers
            multipliers = GasOracle.get_tier_multipliers(tier)
            
            # Calculate priority fee based on tier
            # Start with a reasonable default (1.5 Gwei for standard)
            base_priority_gwei = Decimal("1.5")
            priority_fee_wei = int(w3.to_wei(
                base_priority_gwei * multipliers["priority_multiplier"], 
                "gwei"
            ))
            
            # Calculate max fee (base fee + priority + buffer)
            base_fee_adjusted = int(Decimal(base_fee) * multipliers["base_multiplier"])
            buffer_wei = w3.to_wei(1, "gwei")  # Add 1 Gwei buffer
            max_fee_wei = base_fee_adjusted + priority_fee_wei + buffer_wei
            
            # Apply gas price cap
            gas_cap_gwei = GasOracle.get_gas_cap(chain)
            gas_cap_wei = w3.to_wei(gas_cap_gwei, "gwei")
            
            if max_fee_wei > gas_cap_wei:
                logger.warning(
                    f"Gas price {w3.from_wei(max_fee_wei, 'gwei')} Gwei exceeds cap "
                    f"{gas_cap_gwei} Gwei for {chain}. Capping."
                )
                max_fee_wei = gas_cap_wei
                # Ensure priority fee doesn't exceed max fee
                priority_fee_wei = min(priority_fee_wei, max_fee_wei // 2)
            
            fees = {
                "maxFeePerGas": max_fee_wei,
                "maxPriorityFeePerGas": priority_fee_wei,
                "type": 2,  # EIP-1559
            }
            
            # Cache the result
            cache.set(cache_key, fees, GAS_ORACLE_CACHE_TTL)
            
            logger.info(
                f"Fetched EIP-1559 fees for {chain} ({tier}): "
                f"maxFee={w3.from_wei(max_fee_wei, 'gwei'):.2f} Gwei, "
                f"priority={w3.from_wei(priority_fee_wei, 'gwei'):.2f} Gwei"
            )
            
            return fees
            
        except Exception as e:
            logger.error(f"Failed to fetch EIP-1559 fees for {chain}: {e}")
            # Fallback to legacy
            return GasOracle.fetch_legacy_gas_price(w3, chain, tier)
    
    @staticmethod
    def fetch_legacy_gas_price(w3: Web3, chain: str, tier: str = "standard") -> Dict[str, int]:
        """
        Fetch legacy gas price (for non-EIP-1559 chains)
        
        Args:
            w3: Web3 instance
            chain: Chain identifier
            tier: Gas tier (fast/standard/economy)
            
        Returns:
            Dict with gasPrice in Wei
        """
        # Check cache first
        cache_key = GasOracle._get_cache_key(chain, tier)
        cached = cache.get(cache_key)
        if cached:
            logger.debug(f"Using cached gas price for {chain} ({tier})")
            return cached
        
        try:
            # Get current gas price
            gas_price = w3.eth.gas_price
            
            # Get tier multipliers
            multipliers = GasOracle.get_tier_multipliers(tier)
            
            # Adjust based on tier
            adjusted_price = int(Decimal(gas_price) * multipliers["base_multiplier"])
            
            # Apply gas price cap
            gas_cap_gwei = GasOracle.get_gas_cap(chain)
            gas_cap_wei = w3.to_wei(gas_cap_gwei, "gwei")
            
            if adjusted_price > gas_cap_wei:
                adjusted_gwei = w3.from_wei(adjusted_price, 'gwei')
                logger.warning(
                    f"Gas price {adjusted_gwei} Gwei exceeds cap {gas_cap_gwei} Gwei for {chain}. Capping."
                )
                adjusted_price = gas_cap_wei
            
            fees = {
                "gasPrice": adjusted_price,
                "type": 0,  # Legacy
            }
            
            # Cache the result
            cache.set(cache_key, fees, GAS_ORACLE_CACHE_TTL)
            
            logger.info(
                f"Fetched legacy gas price for {chain} ({tier}): "
                f"{w3.from_wei(adjusted_price, 'gwei'):.2f} Gwei"
            )
            
            return fees
            
        except Exception as e:
            logger.error(f"Failed to fetch gas price for {chain}: {e}")
            # Return a safe fallback
            fallback_price = w3.to_wei(20, "gwei")  # 20 Gwei fallback
            return {
                "gasPrice": fallback_price,
                "type": 0,
            }
    
    @staticmethod
    def get_gas_fees(w3: Web3, chain: str, tier: str = "standard") -> Dict[str, int]:
        """
        Get gas fees for a chain (auto-detects EIP-1559 support)
        
        Args:
            w3: Web3 instance
            chain: Chain identifier
            tier: Gas tier (fast/standard/economy)
            
        Returns:
            Dict with gas fee fields (either EIP-1559 or legacy)
        """
        try:
            # Try EIP-1559 first
            return GasOracle.fetch_eip1559_fees(w3, chain, tier)
        except Exception as e:
            logger.warning(f"EIP-1559 failed for {chain}, falling back to legacy: {e}")
            return GasOracle.fetch_legacy_gas_price(w3, chain, tier)
    
    @staticmethod
    def estimate_transaction_cost(
        w3: Web3, 
        chain: str, 
        gas_limit: int, 
        tier: str = "standard"
    ) -> Tuple[Decimal, Dict[str, int]]:
        """
        Estimate total transaction cost in native currency
        
        Args:
            w3: Web3 instance
            chain: Chain identifier
            gas_limit: Estimated gas limit
            tier: Gas tier
            
        Returns:
            Tuple of (cost_in_native_currency, gas_fees_dict)
        """
        fees = GasOracle.get_gas_fees(w3, chain, tier)
        
        if fees.get("type") == 2:
            # EIP-1559
            total_cost_wei = fees["maxFeePerGas"] * gas_limit
        else:
            # Legacy
            total_cost_wei = fees["gasPrice"] * gas_limit
        
        cost_native = w3.from_wei(total_cost_wei, "ether")
        return Decimal(str(cost_native)), fees
    
    @staticmethod
    def bump_gas_price(current_fees: Dict[str, int], bump_percent: int = 20) -> Dict[str, int]:
        """
        Bump gas price for retry attempts
        
        Args:
            current_fees: Current gas fee dict
            bump_percent: Percentage to increase (default 20%)
            
        Returns:
            New gas fees dict with increased prices
        """
        multiplier = Decimal("1") + Decimal(bump_percent) / Decimal("100")
        
        if current_fees.get("type") == 2:
            # EIP-1559
            return {
                "maxFeePerGas": int(Decimal(current_fees["maxFeePerGas"]) * multiplier),
                "maxPriorityFeePerGas": int(Decimal(current_fees["maxPriorityFeePerGas"]) * multiplier),
                "type": 2,
            }
        else:
            # Legacy
            return {
                "gasPrice": int(Decimal(current_fees["gasPrice"]) * multiplier),
                "type": 0,
            }
