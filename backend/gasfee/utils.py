# File: backend/gasfee/utils.py
from decimal import Decimal, InvalidOperation, getcontext
import logging
import os
from typing import Optional

from django.conf import settings
from web3 import Web3, HTTPProvider
from eth_account import Account

# Import your price functions
from .price_service import get_crypto_prices_in_usd, get_usd_ngn_rate_with_margin
from .evm_sender import get_web3

logger = logging.getLogger(__name__)

# Ensure enough precision
getcontext().prec = 28

# ==============================
# Environment helper
# ==============================
def get_env_var(var_name, required=True):
    value = os.getenv(var_name)
    if required and not value:
        raise ValueError(f"Missing required environment variable: {var_name}")
    return value

# ==============================
# Constants
# ==============================
DEFAULT_USD_NGN_FALLBACK = Decimal("1500")
COINGECKO_CACHE_SECONDS = 300

# ==============================
# Price Utilities
# ==============================
def get_asset_price_ngn(asset_id: str, margin_type: str) -> Decimal:
    asset_id = (asset_id or "").lower()
    usd_prices = get_crypto_prices_in_usd([asset_id])
    usd_price = usd_prices.get(asset_id)
    if usd_price is None:
        logger.error(f"[Price] Asset {asset_id} returned no USD price")
        return Decimal("0")
    usd_price = Decimal(usd_price)

    ngn_rate = get_usd_ngn_rate_with_margin(margin_type)
    if not ngn_rate or Decimal(ngn_rate) <= 0:
        logger.warning(f"[Price] Invalid NGN rate ({ngn_rate}), using fallback")
        ngn_rate = DEFAULT_USD_NGN_FALLBACK

    ngn_value = usd_price * Decimal(ngn_rate)
    return ngn_value.quantize(Decimal("0.01"))

# ==============================
# EVM / BSC SENDERS
# ==============================
# BSC global provider
BSC_RPC_URL = get_env_var("BSC_RPC_URL")
w3_bsc = Web3(HTTPProvider(BSC_RPC_URL))
if not w3_bsc.is_connected():
    raise ConnectionError(f"Failed to connect to BSC RPC: {BSC_RPC_URL}")
BSC_PRIVATE_KEY = get_env_var("BSC_PRIVATE_KEY")
BSC_SENDER_ADDRESS = w3_bsc.eth.account.from_key(BSC_PRIVATE_KEY).address




# ==============================
# BSC native send
# ==============================
def send_bsc(to_address: str, amount: Decimal, order_id: Optional[int] = None, tier: str = "standard") -> str:
    """
    Send BNB on BSC with improved gas handling
    
    Args:
        to_address: Recipient address
        amount: Amount in BNB
        order_id: Optional order ID for tracking
        tier: Gas tier (fast/standard/economy)
        
    Returns:
        Transaction hash
    """
    if not Web3.is_address(to_address):
        raise ValueError(f"Invalid BSC address: {to_address}")
    to_address = Web3.to_checksum_address(to_address)
    
    try:
        value = w3_bsc.to_wei(amount, "ether")
    except Exception:
        raise ValueError(f"Invalid BNB amount: {amount}")

    # Import gas oracle here to avoid circular imports
    from .gas_oracle import GasOracle
    
    # Get gas fees using oracle
    try:
        fee_fields = GasOracle.get_gas_fees(w3_bsc, "BSC", tier)
        # Remove type field if present
        fee_fields.pop("type", None)
    except Exception as e:
        logger.warning(f"Gas oracle failed for BSC, using fallback: {e}")
        gas_price = w3_bsc.eth.gas_price
        fee_fields = {"gasPrice": gas_price}
    
    gas_limit = 21000
    
    # Calculate transaction cost
    if "gasPrice" in fee_fields:
        tx_cost = gas_limit * fee_fields["gasPrice"]
    else:
        # EIP-1559 (BSC supports it now)
        tx_cost = gas_limit * fee_fields.get("maxFeePerGas", fee_fields.get("gasPrice", 0))
    
    # Check balance
    sender_balance = w3_bsc.eth.get_balance(BSC_SENDER_ADDRESS)
    if sender_balance < (value + tx_cost):
        raise ValueError("Insufficient BNB balance.")

    # Get nonce (with retry for concurrent transactions)
    nonce = w3_bsc.eth.get_transaction_count(BSC_SENDER_ADDRESS)
    
    # Build transaction
    tx = {
        "nonce": nonce,
        "to": to_address,
        "value": value,
        "gas": gas_limit,
        "chainId": 56,
    }
    tx.update(fee_fields)
    
    # Apply gas cap
    gas_cap_wei = w3_bsc.to_wei(GasOracle.get_gas_cap("BSC"), "gwei")
    if "maxFeePerGas" in tx:
        if tx["maxFeePerGas"] > gas_cap_wei:
            logger.warning(f"BSC gas fee exceeds cap, capping at {GasOracle.get_gas_cap('BSC')} Gwei")
            tx["maxFeePerGas"] = gas_cap_wei
            tx["maxPriorityFeePerGas"] = min(tx.get("maxPriorityFeePerGas", 0), gas_cap_wei // 2)
    elif "gasPrice" in tx:
        if tx["gasPrice"] > gas_cap_wei:
            logger.warning(f"BSC gas price exceeds cap, capping at {GasOracle.get_gas_cap('BSC')} Gwei")
            tx["gasPrice"] = gas_cap_wei
    
    # Sign and send
    signed_tx = w3_bsc.eth.account.sign_transaction(tx, BSC_PRIVATE_KEY)
    tx_hash = w3_bsc.eth.send_raw_transaction(signed_tx.raw_transaction)
    
    logger.info(f"BSC transaction sent: {tx_hash.hex()}")
    return tx_hash.hex()

