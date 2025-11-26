from decimal import Decimal
from web3 import Web3, HTTPProvider
from eth_account import Account
import os
import logging

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


def get_gas_fees(w3: Web3):
    try:
        # EIP-1559 fee format
        base_fee = w3.eth.get_block("pending").baseFeePerGas
        max_priority = w3.to_wei(1.5, "gwei")
        max_fee = base_fee + max_priority + w3.to_wei(1, "gwei")
        return {
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": max_priority,
        }
    except Exception:
        # Legacy gas_price fallback
        gas_price = w3.eth.gas_price
        return {"gasPrice": gas_price}


def send_evm(chain: str, to_address: str, amount_eth: Decimal, order_id=None) -> str:
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

    # Nonce
    nonce = w3.eth.get_transaction_count(sender.address)

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

    # Gas fees (EIP-1559 or legacy)
    fee_fields = get_gas_fees(w3)
    tx.update(fee_fields)

    # Sign + send
    signed = w3.eth.account.sign_transaction(tx, private_key)
    try:
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return tx_hash.hex()

    except Exception as e:
        # decode common RPC errors
        msg = str(e)

        if "intrinsic gas too low" in msg:
            raise ValueError("Gas too low — retry in seconds.")
        if "insufficient funds" in msg.lower():
            raise ValueError("Sender wallet is out of gas/ETH.")
        if "underpriced" in msg.lower():
            raise ValueError("Gas price too low — try again.")
        raise
