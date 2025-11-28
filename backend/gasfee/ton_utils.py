import os
import json
import time
import base64
import logging
import traceback
from decimal import Decimal, getcontext
from dataclasses import dataclass

import requests
from django.conf import settings
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from tonsdk.contract.wallet import Wallets, WalletVersionEnum
from tonsdk.utils import to_nano, Address

# High precision for TON
getcontext().prec = 50

logger = logging.getLogger(__name__)


# -------------------------------------------------------------------------
# 🎯 MONEY CLASS — consistent safe TON amounts
# -------------------------------------------------------------------------

@dataclass(frozen=True)
class TonAmount:
    value: Decimal

    @classmethod
    def from_float(cls, x: float) -> "TonAmount":
        return cls(Decimal(str(x)))

    @classmethod
    def from_str(cls, x: str) -> "TonAmount":
        return cls(Decimal(x))

    @classmethod
    def nano(cls, nano: int) -> "TonAmount":
        return cls(Decimal(nano) / Decimal("1e9"))

    def to_nano(self) -> int:
        return int((self.value * Decimal("1e9")).quantize(Decimal("1")))

    def __add__(self, other):
        return TonAmount(self.value + other.value)

    def __sub__(self, other):
        return TonAmount(self.value - other.value)

    def __mul__(self, other):
        return TonAmount(self.value * Decimal(str(other)))

    def __float__(self):
        return float(self.value)

    def __str__(self):
        return f"{self.value.normalize()} TON"


# -------------------------------------------------------------------------
# 🛰 API CLIENT — primary + fallback
# -------------------------------------------------------------------------

class TonAPI:
    def __init__(self, primary, secondary, api_key=None):
        self.primary = primary
        self.secondary = secondary
        self.api_key = api_key

    def call(self, payload):
        headers = {"X-API-Key": self.api_key} if self.api_key else {}

        # First: primary endpoint
        try:
            r = requests.post(self.primary, json=payload, headers=headers)
            r.raise_for_status()
            return r.json()
        except Exception:
            logger.warning("Primary TON API failed, retrying via fallback...")

        # Second: fallback endpoint
        try:
            r = requests.post(self.secondary, json=payload, headers=headers)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.error(f"TON API total failure: {payload} {e}")
            raise ValueError("Both TON endpoints failed")


# -------------------------------------------------------------------------
# 🧩 TON WALLET
# -------------------------------------------------------------------------

class TonWallet:
    def __init__(self, mnemonic, api: TonAPI):
        if len(mnemonic) != 24:
            raise ValueError("TON_MNEMONIC must be exactly 24 words")

        _, self.pub, self.priv, self.wallet = Wallets.from_mnemonics(
            mnemonics=mnemonic,
            version=WalletVersionEnum.v3r2,
            workchain=0
        )
        self.address = self.wallet.address.to_string(True, True, True)
        self.api = api


    # ---------------- BALANCE ---------------- #

    def balance(self) -> TonAmount:
        payload = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "getAddressBalance",
            "params": {"address": self.address}
        }
        res = self.api.call(payload)

        nano = int(res["result"])
        return TonAmount.nano(nano)


    # ---------------- SEQNO ---------------- #

    def seqno(self) -> int:
        payload = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "runGetMethod",
            "params": {"address": self.address, "method": "seqno", "stack": []}
        }
        res = self.api.call(payload)

        try:
            return int(res["result"]["stack"][0][1], 16)
        except:
            return 0


    # ---------------- ADDRESS STATE ---------------- #

    def is_deployed(self, address: str) -> bool:
        payload = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "getAddressInformation",
            "params": {"address": address}
        }
        res = self.api.call(payload)

        return res.get("result", {}).get("state") == "active"


    # ---------------- FEE ESTIMATE ---------------- #

    def estimate_fee(self) -> TonAmount:
        """
        Reads last 5 fees and returns 1.5x average.
        Always returns TonAmount.
        """
        payload = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "getTransactions",
            "params": {"address": self.address, "limit": 5}
        }
        try:
            res = self.api.call(payload)
            fees = []
            for tx in res.get("result", []):
                if "fee" in tx:
                    nano = Decimal(str(tx["fee"]))
                    fees.append(nano / Decimal("1e9"))

            if fees:
                avg = sum(fees) / Decimal(len(fees))
                return TonAmount(avg * Decimal("1.5"))
        except:
            pass

        return TonAmount(Decimal("0.01"))


    # ---------------- SEND ---------------- #

    def send(self, destination: str, amount: TonAmount, order_id=None) -> tuple[str, float]:
        logger.info(f"Sending {amount} → {destination}")

        # --- Check receiver deployment state --- #
        receiver_active = self.is_deployed(destination)
        deploy_cost = TonAmount(Decimal("0.05"))
        fee = self.estimate_fee()

        needed_total = amount + fee + (deploy_cost + fee if not receiver_active else TonAmount(Decimal("0")))

        bal = self.balance()

        if bal.value < needed_total.value:
            raise ValueError(f"Insufficient balance: {bal} needed {needed_total}")

        seq = self.seqno()

        # ---------------------- WALLET DEPLOY ---------------------- #
        if not receiver_active:
            deploy_msg = self.wallet.create_transfer_message(
                to_addr=Address(destination),
                amount=deploy_cost.to_nano(),
                seqno=seq
            )
            deploy_boc = base64.b64encode(deploy_msg["message"].to_boc(False)).decode()
            self.api.call({"id": 1, "jsonrpc": "2.0", "method": "sendBoc", "params": {"boc": deploy_boc}})

            time.sleep(10)
            while not self.is_deployed(destination):
                time.sleep(3)

            seq = self.seqno()

        # ---------------------- SEND PAYMENT ---------------------- #

        msg = self.wallet.create_transfer_message(
            to_addr=Address(destination),
            amount=amount.to_nano(),
            seqno=seq
        )
        boc = base64.b64encode(msg["message"].to_boc(False)).decode()

        result = self.api.call({"id": 1, "jsonrpc": "2.0", "method": "sendBoc", "params": {"boc": boc}})

        if not result.get("ok", True):
            raise ValueError(f"TON transfer failed: {result}")

        # Confirm seqno increment
        for _ in range(settings.TON_SEQNO_MAX_ATTEMPTS):
            time.sleep(settings.TON_SEQNO_CHECK_INTERVAL)
            if self.seqno() > seq:
                tx_hash = self.find_tx_hash(destination, amount)
                return tx_hash, float(deploy_cost.value if not receiver_active else 0)

        raise ValueError("TON tx not confirmed (seqno did not update)")


    # ---------------- TX HASH ---------------- #

    def find_tx_hash(self, destination, amount: TonAmount) -> str:
        payload = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "getTransactions",
            "params": {"address": self.address, "limit": 20}
        }
        res = self.api.call(payload)

        nano_target = amount.to_nano()

        for tx in res.get("result", []):
            for msg in tx.get("out_msgs", []):
                if msg.get("destination") == destination:
                    if abs(int(msg["value"]) - nano_target) < 10_000_000:
                        return tx["transaction_id"]["hash"]

        return "pending"

# -----------------------------------------------------------
# 🧩 Backward Compatible Wrapper (keeps old imports working)
# -----------------------------------------------------------

# Create singleton TON wallet instance
api = TonAPI(
    primary="https://toncenter.com/api/v2/jsonRPC",
    secondary="https://tonapi.io/api/v2/jsonRPC",
    api_key=os.getenv("TON_API_KEY")
)
WALLET = TonWallet(mnemonic=os.getenv("TON_MNEMONIC").split(), api=api)


def send_ton(receiver_address: str, amount_ton: float, order_id=None):
    """
    Backward-compatible adapter for old code.
    Converts float → TonAmount and calls the new service.
    """
    amount = TonAmount.from_float(amount_ton)
    return WALLET.send(receiver_address, amount, order_id)

def get_wallet_balance() -> float:
    """
    Backward-compatible adapter for old code.
    Calls the new service and returns the wallet balance.
    """
    return WALLET.balance().to_float()