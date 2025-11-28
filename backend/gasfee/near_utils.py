# backend/gasfee/near_utils.py
import re
import logging
import traceback
import asyncio
import threading
from decimal import Decimal, InvalidOperation
from py_near.account import Account
from .utils import get_env_var

logger = logging.getLogger(__name__)

# NEAR configuration
NEAR_RPC_URL = get_env_var("NEAR_RPC_URL", required=True)  # e.g., "https://rpc.mainnet.near.org"
NEAR_PRIVATE_KEY = get_env_var("NEAR_PRIVATE_KEY", required=True).strip('"')
NEAR_ACCOUNT_ID = get_env_var("NEAR_ACCOUNT_ID", required=True)


# Persistent background event loop for all NEAR RPC activity
_background_loop = None
_background_thread = None

def _ensure_background_loop():
    global _background_loop, _background_thread

    if _background_loop and _background_loop.is_running():
        return _background_loop

    _background_loop = asyncio.new_event_loop()

    def _loop_thread():
        asyncio.set_event_loop(_background_loop)
        _background_loop.run_forever()

    _background_thread = threading.Thread(target=_loop_thread, daemon=True)
    _background_thread.start()
    return _background_loop


def run_async(coro):
    """
    NEAR-safe async runner.
    Never uses asyncio.run().
    Always dispatches work to a persistent background loop.
    """
    loop = _ensure_background_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()



# -------------------------
# NEAR helpers
# -------------------------
def _yocto_to_near(yocto: int) -> Decimal:
    return Decimal(yocto) / (Decimal(10) ** 24)

def _near_to_yocto(amount_near) -> int:
    try:
        d = Decimal(str(amount_near))
    except (InvalidOperation, TypeError) as e:
        raise ValueError(f"Invalid NEAR amount: {amount_near}") from e
    return int((d * (Decimal(10) ** 24)).to_integral_value())

def check_near_balance(account_id: str) -> Decimal:
    """Return balance in NEAR as Decimal. Raises ValueError on failure."""
    try:
        temp_account = Account(account_id=account_id, rpc_addr=NEAR_RPC_URL)
        run_async(temp_account.startup())
        balance_info = run_async(temp_account.get_balance())
        logger.debug(f"Raw balance info for {account_id}: {balance_info}")

        # Accept int (yocto) or object with .total or .available
        if isinstance(balance_info, int):
            balance_yocto = balance_info
        else:
            # try common attrs, fallback to string/int conversion
            balance_yocto = None
            for attr in ("total", "available", "balance"):
                if hasattr(balance_info, attr):
                    val = getattr(balance_info, attr)
                    try:
                        balance_yocto = int(val)
                        break
                    except Exception:
                        continue
            if balance_yocto is None:
                # try parse as int
                try:
                    balance_yocto = int(balance_info)
                except Exception:
                    raise ValueError("RPC returned unexpected balance structure")

        balance_near = _yocto_to_near(balance_yocto)
        logger.info(f"Balance for {account_id}: {balance_near} NEAR")
        return balance_near
    except Exception as e:
        logger.error(f"Failed to fetch balance for {account_id}: {e}\n{traceback.format_exc()}")
        raise ValueError(f"Failed to fetch balance: {e}")

def validate_near_account_id(account_id: str) -> bool:
    if not account_id or not isinstance(account_id, str):
        return False

    account_id = account_id.strip().lower()

    if len(account_id) < 2 or len(account_id) > 64:
        return False

    # implicit hex account (64-char)
    if len(account_id) == 64 and re.fullmatch(r'[0-9a-f]{64}', account_id):
        return True

    # strict NEAR human readable rule: lowercase only
    if not re.fullmatch(r'[0-9a-z._\-]+', account_id):
        return False

    return True


def send_near(receiver_account_id: str, amount_near, order_id=None) -> str:
    """
    Send NEAR from configured NEAR_ACCOUNT_ID to receiver_account_id.
    amount_near may be Decimal, float, or numeric string. Returns tx hash on success.
    """
    try:
        # Normalize amount (Decimal for precision)
        amount_yocto = _near_to_yocto(amount_near)
    except Exception as e:
        raise ValueError(str(e))

    logger.info(f"Initiating transfer: {Decimal(amount_yocto) / (Decimal(10) ** 24)} NEAR -> {receiver_account_id}")

    receiver_account_id = receiver_account_id.strip().lower()
    # Validate receiver account ID
    if not validate_near_account_id(receiver_account_id):
        raise ValueError(f"Invalid receiver account ID: {receiver_account_id}")

    # Init account (sender)
    temp_account = Account(
        account_id=NEAR_ACCOUNT_ID,
        private_key=NEAR_PRIVATE_KEY,
        rpc_addr=NEAR_RPC_URL
    )
    run_async(temp_account.startup())

    # Check sender balance
    sender_balance_near = check_near_balance(NEAR_ACCOUNT_ID)
    # Estimate gas conservatively (keep a buffer)
    gas_fee_near = Decimal("0.0002")
    total_needed = (Decimal(amount_yocto) / (Decimal(10) ** 24)) + gas_fee_near
    if sender_balance_near < total_needed:
        raise ValueError(f"Insufficient balance: {sender_balance_near} NEAR, need {total_needed} NEAR")

    try:
        # send_money expects yoctoNEAR amount (int)
        result = run_async(temp_account.send_money(receiver_account_id, amount_yocto))
        # py_near usually returns a structure; extract transaction hash defensively
        tx_hash = None
        if hasattr(result, "transaction") and hasattr(result.transaction, "hash"):
            tx_hash = result.transaction.hash
        elif isinstance(result, dict):
            # try common dict paths
            tx_hash = result.get("transaction", {}).get("hash") or result.get("hash")
        if not tx_hash:
            # fallback to stringification if present
            tx_hash = str(result)
        logger.info(f"Transaction successful: {tx_hash}")
        return tx_hash
    except Exception as e:
        logger.error(f"Transaction failed: {e}\n{traceback.format_exc()}")
        raise ValueError(f"Transaction failed: {e}")
