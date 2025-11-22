# File: backend/gasfee/utils.py
from decimal import Decimal, InvalidOperation
import logging
import traceback
import time
import uuid
import os
from typing import Dict, List, Optional

import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

# ✅ NEW: import corrected pricing functions
from .price_service import (
    get_crypto_prices_in_usd,
    get_usd_ngn_rate_with_margin,   # replaces old get_usd_ngn_rate
)

from django.core.cache import cache
from django.conf import settings
from web3 import Web3

logger = logging.getLogger(__name__)


# ENV helper
def get_env_var(var_name, required=True):
    value = os.getenv(var_name)
    if required and not value:
        raise ValueError(f"Missing required environment variable: {var_name}")
    return value


# DEFAULTS / CONSTANTS
DEFAULT_USD_NGN_FALLBACK = Decimal("1500")
COINGECKO_CACHE_SECONDS = 300


# =============================================================
#                       PRICE UTILITIES
# =============================================================

def get_asset_price_ngn(asset_id: str, margin_type: str) -> Decimal:
    """
    Unified helper:
        - fetch USD price for asset
        - fetch NGN rate WITH margin applied (correct for BUY/SELL)
        - return NGN price
    """
    asset_id = (asset_id or "").lower()

    # 1. Grab USD price for the asset
    usd_prices = get_crypto_prices_in_usd([asset_id])
    usd_price = usd_prices.get(asset_id)

    if usd_price is None:
        logger.error(f"[Price] Asset {asset_id} returned no USD price")
        return Decimal("0")

    usd_price = Decimal(usd_price)

    # 2. Get USD → NGN rate with BUY/SELL margin applied
    ngn_rate = get_usd_ngn_rate_with_margin(margin_type)

    if ngn_rate <= 0:
        logger.error(f"[Price] Invalid NGN rate ({ngn_rate}). Using fallback.")
        ngn_rate = DEFAULT_USD_NGN_FALLBACK

    # 3. Convert asset USD → NGN
    ngn_value = usd_price * ngn_rate

    return ngn_value.quantize(Decimal("0.01"))



# =============================================================
#                      EVM / BSC SENDERS
# =============================================================

BSC_RPC_URL = os.getenv("BSC_RPC_URL")
if not BSC_RPC_URL:
    raise ValueError("Missing BSC_RPC_URL")

w3 = Web3(Web3.HTTPProvider(BSC_RPC_URL))
if not w3.is_connected():
    raise ConnectionError(f"Failed to connect to BSC RPC: {BSC_RPC_URL}")

BSC_SENDER_PRIVATE_KEY = os.getenv("BSC_SENDER_PRIVATE_KEY")
BSC_SENDER_ADDRESS = w3.eth.account.from_key(BSC_SENDER_PRIVATE_KEY).address


def send_evm(chain: str, recipient: str, amount_wei: int, order_id: Optional[int] = None) -> str:
    L2_CHAINS = {
        "ARB": {"rpc": os.getenv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"), "symbol": "ETH"},
        "BASE": {"rpc": os.getenv("BASE_RPC_URL", "https://mainnet.base.org"), "symbol": "ETH"},
        "OP": {"rpc": os.getenv("OPTIMISM_RPC_URL", "https://mainnet.optimism.io"), "symbol": "ETH"},
    }

    if chain not in L2_CHAINS:
        raise ValueError(f"Unsupported chain: {chain}")

    w3_local = Web3(Web3.HTTPProvider(L2_CHAINS[chain]["rpc"]))
    sender_private_key = os.getenv(f"{chain}_PRIVATE_KEY")
    sender_address = os.getenv(f"{chain}_SENDER_ADDRESS")

    if not sender_private_key or not sender_address:
        raise ValueError("Sender wallet not configured for " + chain)

    sender_address = Web3.to_checksum_address(sender_address)
    recipient = Web3.to_checksum_address(recipient)

    sender_balance = w3_local.eth.get_balance(sender_address)
    nonce = w3_local.eth.get_transaction_count(sender_address)
    gas_price = w3_local.eth.gas_price

    tx_estimate = {
        "from": sender_address,
        "to": recipient,
        "value": amount_wei,
        "gasPrice": gas_price,
        "nonce": nonce,
        "chainId": w3_local.eth.chain_id,
    }

    try:
        gas_limit = w3_local.eth.estimate_gas(tx_estimate)
    except Exception as e:
        raise ValueError(f"Gas estimation failed: {str(e)}")

    total_cost = amount_wei + (gas_limit * gas_price)
    if sender_balance < total_cost:
        raise ValueError("Insufficient balance on chain.")

    tx = {
        "to": recipient,
        "value": amount_wei,
        "gas": gas_limit,
        "gasPrice": gas_price,
        "nonce": nonce,
        "chainId": w3_local.eth.chain_id,
    }

    signed_tx = w3_local.eth.account.sign_transaction(tx, sender_private_key)
    tx_hash = w3_local.eth.send_raw_transaction(signed_tx.raw_transaction)
    return w3_local.to_hex(tx_hash)


def send_bsc(to_address: str, amount: Decimal, order_id: Optional[int] = None) -> str:
    """
    Sends BNB native token.
    """
    if not Web3.is_address(to_address):
        raise ValueError(f"Invalid BSC wallet address: {to_address}")

    to_address = Web3.to_checksum_address(to_address)

    try:
        value = w3.to_wei(Decimal(amount), "ether")
    except (InvalidOperation, TypeError):
        raise ValueError(f"Invalid BNB amount: {amount}")

    gas_price = w3.eth.gas_price
    gas_limit = 21000
    tx_cost = gas_limit * gas_price

    sender_balance = w3.eth.get_balance(BSC_SENDER_ADDRESS)
    if sender_balance < (value + tx_cost):
        raise ValueError("Insufficient BNB balance.")

    nonce = w3.eth.get_transaction_count(BSC_SENDER_ADDRESS)
    tx = {
        "nonce": nonce,
        "to": to_address,
        "value": value,
        "gas": gas_limit,
        "gasPrice": gas_price,
        "chainId": 56,
    }

    signed_tx = w3.eth.account.sign_transaction(tx, BSC_SENDER_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    return tx_hash.hex()
