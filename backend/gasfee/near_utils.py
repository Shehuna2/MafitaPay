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

# -------------------------
# Safe runner for coroutines
# -------------------------
def _run_coro_in_new_loop(coro):
    """
    Execute coro in a fresh event loop on a background thread and
    return the result. This avoids touching the process-global loop.
    """
    result = {"value": None, "exc": None}
    def _target():
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result["value"] = loop.run_until_complete(coro)
        except Exception as e:
            result["exc"] = e
        finally:
            try:
                loop.close()
            except Exception:
                pass

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    t.join()
    if result["exc"]:
        raise result["exc"]
    return result["value"]

def run_async(coro):
    """
    Run coro safely from synchronous code.

    Strategy:
      - If there's no running event loop in this thread -> use asyncio.run(coro)
      - If there *is* a running loop (e.g. inside ASGI), run the coro in a fresh loop
        on a background thread to avoid interfering with the running loop.
    """
    try:
        # Python 3.7+
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # no loop running in this thread
        return asyncio.run(coro)
    else:
        # running loop exists in *this* thread (or current thread). Avoid using it;
        # run the coroutine in a fresh loop on a worker thread.
        return _run_coro_in_new_loop(coro)


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
    """Validate a NEAR account ID. Accepts implicit hex 64-char or human readable accounts."""
    if not account_id or not isinstance(account_id, str):
        return False
    account_id = account_id.strip()
    if len(account_id) < 2 or len(account_id) > 64:
        return False
    # Implicit 64-char hex
    if len(account_id) == 64 and re.fullmatch(r'[0-9a-fA-F]{64}', account_id):
        return True
    # human readable: allow common characters (dot, dash, underscore)
    if not re.fullmatch(r'[0-9a-zA-Z._\-]+', account_id):
        return False
    # optionally enforce a suffix (optional): many accounts have .near, .testnet, .tg etc.
    # we allow both plain human ids and those with known suffixes.
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
