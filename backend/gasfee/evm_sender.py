from decimal import Decimal
from web3 import Web3, HTTPProvider
from eth_account import Account
import os
import logging
import time
from typing import Optional, Tuple
from django.core.cache import cache

from .gas_oracle import GasOracle

logger = logging.getLogger(__name__)

# ============================================================
# CONFIG — add or remove chains here
# ============================================================

EVM_CHAINS = {
    "ETH": {
        "rpc": "ETH_RPC_URL",
        "private_key": "ETH_PRIVATE_KEY",
        "chain_id": 1,
        "symbol": "ETH",
    },
    "ARB": {
        "rpc": "ARB_RPC_URL",
        "private_key": "ARB_PRIVATE_KEY",
        "chain_id": 42161,
        "symbol": "ETH",
    },
    "BASE": {
        "rpc": "BASE_RPC_URL",
        "private_key": "BASE_PRIVATE_KEY",
        "chain_id": 8453,
        "symbol": "ETH",
    },
    "OP": {
        "rpc": "OP_RPC_URL",
        "private_key": "OP_PRIVATE_KEY",
        "chain_id": 10,
        "symbol": "ETH",
    },
    "POL": {
        "rpc": "POL_RPC_URL",
        "private_key": "POL_PRIVATE_KEY",
        "chain_id": 137,
        "symbol": "MATIC",
    },
    "AVAX": {
        "rpc": "AVAX_RPC_URL",
        "private_key": "AVAX_PRIVATE_KEY",
        "chain_id": 43114,
        "symbol": "AVAX",
    },
    "LINEA": {
        "rpc": "LINEA_RPC_URL",
        "private_key": "LINEA_PRIVATE_KEY",
        "chain_id": 59144,
        "symbol": "ETH",
    },
}



_WEB3_CACHE = {}

def get_web3(rpc_url: str) -> Web3:
    rpc_url = rpc_url.strip()
    if rpc_url not in _WEB3_CACHE:
        w3 = Web3(HTTPProvider(rpc_url, request_kwargs={"timeout": 15}))
        if not w3.is_connected():
            raise ConnectionError(f"RPC not reachable: {rpc_url}")
        _WEB3_CACHE[rpc_url] = w3
    return _WEB3_CACHE[rpc_url]


def estimate_gas(w3: Web3, tx: dict, chain: str) -> int:
    try:
        gas_limit = w3.eth.estimate_gas(tx)
        # Add safety margin
        gas_limit = int(gas_limit * 1.25)
        return gas_limit
    except Exception as e:
        logger.warning(f"Gas estimation failed ({chain}), falling back: {e}")

        # Layer-2 chains need higher baseline
        if chain in {"ARB", "BASE", "OP", "LINEA"}:
            return 120_000  # safe fallback

        # L1s can use 21k normally
        return 21000


def get_gas_fees(w3: Web3, chain: str = "ETH", tier: str = "standard"):
    """
    Get gas fees using the Gas Oracle service
    
    Args:
        w3: Web3 instance
        chain: Chain identifier (e.g., ETH, ARB, BASE)
        tier: Gas tier (fast/standard/economy)
    
    Returns:
        Dict with gas fee fields
    """
    try:
        fees = GasOracle.get_gas_fees(w3, chain, tier)
        # Remove 'type' field as it's not part of transaction dict
        fees_copy = fees.copy()
        fees_copy.pop("type", None)
        return fees_copy
    except Exception as e:
        logger.error(f"Gas oracle failed for {chain}, using fallback: {e}")
        # Fallback to simple gas price
        gas_price = w3.eth.gas_price
        return {"gasPrice": gas_price}


def get_nonce_with_lock(w3: Web3, address: str, chain: str) -> int:
    """
    Get nonce with cache-based locking to prevent nonce collisions
    
    Args:
        w3: Web3 instance
        address: Sender address
        chain: Chain identifier
        
    Returns:
        Next available nonce
    """
    lock_key = f"nonce_lock:{chain}:{address}"
    nonce_key = f"nonce:{chain}:{address}"
    
    # Try to acquire lock (simple spinlock with timeout)
    max_attempts = 50
    for attempt in range(max_attempts):
        if cache.add(lock_key, "locked", timeout=10):
            try:
                # Get current nonce from cache
                cached_nonce = cache.get(nonce_key)
                chain_nonce = w3.eth.get_transaction_count(address)
                
                # Use the higher of cached or chain nonce
                if cached_nonce is not None:
                    nonce = max(cached_nonce, chain_nonce)
                else:
                    nonce = chain_nonce
                
                # Update cache with next nonce
                cache.set(nonce_key, nonce + 1, timeout=300)  # 5 min TTL
                
                return nonce
            finally:
                # Release lock
                cache.delete(lock_key)
        
        # Wait a bit before retrying
        time.sleep(0.1)
    
    # Fallback: just get nonce from chain if we couldn't acquire lock
    logger.warning(f"Could not acquire nonce lock for {chain}:{address}, using chain nonce")
    return w3.eth.get_transaction_count(address)


def send_evm(
    chain: str, 
    to_address: str, 
    amount_eth: Decimal, 
    order_id=None,
    tier: str = "standard",
    max_retries: int = 2
) -> str:
    chain = chain.upper()

    if chain not in EVM_CHAINS:
        raise ValueError(f"Unsupported EVM chain: {chain}")

    cfg = EVM_CHAINS[chain]
    rpc_url = os.getenv(cfg["rpc"])
    private_key = os.getenv(cfg["private_key"])
    chain_id = cfg["chain_id"]

    if not rpc_url or not private_key:
        raise ValueError(f"Missing RPC or private key for {chain}")

    w3 = get_web3(rpc_url)
    sender = Account.from_key(private_key)

    # Convert ETH → wei
    try:
        value = Web3.to_wei(amount_eth, "ether")
    except Exception:
        raise ValueError(f"Invalid amount: {amount_eth}")

    # Validate address
    try:
        to_checksum = w3.to_checksum_address(to_address)
    except Exception:
        raise ValueError("Invalid recipient address")

    # Nonce with locking
    nonce = get_nonce_with_lock(w3, sender.address, chain)

    # Base TX (no gas fields yet)
    tx = {
        "chainId": chain_id,
        "from": sender.address,
        "to": to_checksum,
        "nonce": nonce,
        "value": value,
    }

    # Gas limit (L1+L2 aware)
    gas_limit = estimate_gas(w3, tx, chain)
    tx["gas"] = gas_limit

    # Gas fees (EIP-1559 or legacy) with tier support
    fee_fields = get_gas_fees(w3, chain, tier)
    tx.update(fee_fields)
    
    # Validate gas fees don't exceed caps
    gas_cap_wei = w3.to_wei(GasOracle.get_gas_cap(chain), "gwei")
    if "maxFeePerGas" in tx:
        if tx["maxFeePerGas"] > gas_cap_wei:
            logger.warning(f"Gas fee exceeds cap for {chain}, capping at {GasOracle.get_gas_cap(chain)} Gwei")
            tx["maxFeePerGas"] = gas_cap_wei
            tx["maxPriorityFeePerGas"] = min(tx["maxPriorityFeePerGas"], gas_cap_wei // 2)
    elif "gasPrice" in tx:
        if tx["gasPrice"] > gas_cap_wei:
            logger.warning(f"Gas price exceeds cap for {chain}, capping at {GasOracle.get_gas_cap(chain)} Gwei")
            tx["gasPrice"] = gas_cap_wei

    # Retry loop for transaction submission
    last_error = None
    for attempt in range(max_retries):
        try:
            # Sign + send
            signed = w3.eth.account.sign_transaction(tx, private_key)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            tx_hash_hex = tx_hash.hex()
            
            logger.info(f"Transaction sent successfully on {chain}: {tx_hash_hex} (attempt {attempt + 1})")
            return tx_hash_hex

        except Exception as e:
            last_error = e
            msg = str(e)
            
            # Check if error is retryable
            is_retryable = any(keyword in msg.lower() for keyword in [
                "underpriced", "replacement transaction underpriced",
                "nonce too low", "transaction underpriced"
            ])
            
            if is_retryable and attempt < max_retries - 1:
                logger.warning(f"Transaction failed on {chain} (attempt {attempt + 1}), retrying with bumped gas: {msg}")
                
                # Bump gas price by 20%
                bump_percent = int(os.getenv("TX_RETRY_GAS_BUMP_PERCENT", "20"))
                if "maxFeePerGas" in tx:
                    tx["maxFeePerGas"] = int(tx["maxFeePerGas"] * (1 + bump_percent / 100))
                    tx["maxPriorityFeePerGas"] = int(tx["maxPriorityFeePerGas"] * (1 + bump_percent / 100))
                    
                    # Re-check cap
                    if tx["maxFeePerGas"] > gas_cap_wei:
                        tx["maxFeePerGas"] = gas_cap_wei
                        tx["maxPriorityFeePerGas"] = min(tx["maxPriorityFeePerGas"], gas_cap_wei // 2)
                elif "gasPrice" in tx:
                    tx["gasPrice"] = int(tx["gasPrice"] * (1 + bump_percent / 100))
                    
                    # Re-check cap
                    if tx["gasPrice"] > gas_cap_wei:
                        tx["gasPrice"] = gas_cap_wei
                
                # Wait before retry
                time.sleep(2)
                continue
            
            # Decode common RPC errors
            if "intrinsic gas too low" in msg:
                raise ValueError("Gas too low — retry in seconds.")
            if "insufficient funds" in msg.lower():
                raise ValueError("Sender wallet is out of gas/ETH.")
            if "underpriced" in msg.lower():
                raise ValueError("Gas price too low — all retries exhausted.")
            
            # Re-raise original error
            raise
    
    # If we get here, all retries failed
    raise ValueError(f"Transaction failed after {max_retries} attempts: {last_error}")
