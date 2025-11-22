# File: backend/gasfee/utils.py
from decimal import Decimal
import logging
import traceback
import time
import uuid
import os
from typing import Dict, List, Optional
from decimal import Decimal, InvalidOperation

import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from .price_service import get_crypto_prices_in_usd, get_usd_ngn_rate
from django.core.cache import cache
from django.conf import settings
from web3 import Web3

# minimal essential logging
logger = logging.getLogger(__name__)


# Validate essential environment variables
def get_env_var(var_name, required=True):
    value = os.getenv(var_name)
    if required and not value:
        raise ValueError(f"Missing required environment variable: {var_name}")
    return value

# constants
COINGECKO_SIMPLE_PRICE = "https://api.coingecko.com/api/v3/simple/price"
BINANCE_TICKER_PRICE = "https://api.binance.com/api/v3/ticker/price"
DEFAULT_USD_NGN_FALLBACK = Decimal("1500")  # used if nothing else works
COINGECKO_CACHE_SECONDS = 300  # 5 minutes

# Web3 / BSC setup (unchanged logic; keep environment config as before)
BSC_RPC_URL = os.getenv("BSC_RPC_URL")
if not BSC_RPC_URL:
    raise ValueError("Missing BSC_RPC_URL")
w3 = Web3(Web3.HTTPProvider(BSC_RPC_URL))
if not w3.is_connected():
    raise ConnectionError(f"Failed to connect to BSC RPC: {BSC_RPC_URL}")

BSC_SENDER_PRIVATE_KEY = os.getenv("BSC_SENDER_PRIVATE_KEY")
BSC_SENDER_ADDRESS = w3.eth.account.from_key(BSC_SENDER_PRIVATE_KEY).address


# HTTP helpers

class HTTP429(Exception):
    """Raised when a 429 is encountered and we want to handle specially."""
    pass


def _normalize_ids(ids: List[str]) -> List[str]:
    # lower-case & dedupe preserving order
    seen = set()
    out = []
    for i in ids:
        key = (i or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out

# EVM/BSC senders kept largely as-is, only minor safe checks added.

def send_evm(chain: str, recipient: str, amount_wei: int, order_id: Optional[int] = None) -> str:
    L2_CHAINS = {
        "ARB": {"rpc": os.getenv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"), "symbol": "ETH"},
        "BASE": {"rpc": os.getenv("BASE_RPC_URL", "https://mainnet.base.org"), "symbol": "ETH"},
        "OP": {"rpc": os.getenv("OPTIMISM_RPC_URL", "https://mainnet.optimism.io"), "symbol": "ETH"}
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
        "chainId": w3_local.eth.chain_id
    }
    try:
        gas_limit = w3_local.eth.estimate_gas(tx_estimate)
    except Exception as e:
        raise ValueError(f"Gas estimation failed: {str(e)}")
    total_cost = amount_wei + (gas_limit * gas_price)
    if sender_balance < total_cost:
        raise ValueError(f"Insufficient balance on {chain}. Required: {w3_local.from_wei(total_cost, 'ether')} ETH, Available: {w3_local.from_wei(sender_balance, 'ether')} ETH")
    tx = {
        "to": recipient,
        "value": amount_wei,
        "gas": gas_limit,
        "gasPrice": gas_price,
        "nonce": nonce,
        "chainId": w3_local.eth.chain_id
    }
    signed_tx = w3_local.eth.account.sign_transaction(tx, sender_private_key)
    tx_hash = w3_local.eth.send_raw_transaction(signed_tx.raw_transaction)
    return w3_local.to_hex(tx_hash)


def send_bsc(to_address: str, amount: Decimal, order_id: Optional[int] = None) -> str:
    """
    Send BNB (native on BSC) from configured BSC_SENDER_{...} to `to_address`.
    amount: Decimal in BNB (e.g. Decimal("0.001"))
    Returns tx hash hex string.
    """
    # validation
    if not Web3.is_address(to_address):
        raise ValueError(f"Invalid BSC wallet address: {to_address}")
    to_address = Web3.to_checksum_address(to_address)

    try:
        value = w3.to_wei(Decimal(amount), "ether")
    except (InvalidOperation, TypeError) as e:
        raise ValueError(f"Invalid amount for BSC send: {amount}") from e

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
        "value": int(value),
        "gas": gas_limit,
        "gasPrice": gas_price,
        "chainId": 56,
    }

    signed_tx = w3.eth.account.sign_transaction(tx, BSC_SENDER_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    return tx_hash.hex()




