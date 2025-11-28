# gasfee/api_views.py
import uuid
import json
import time
import logging
import requests
import traceback


from decimal import Decimal, ROUND_HALF_UP, InvalidOperation, getcontext
from django.conf import settings
from django.db import transaction
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from decimal import InvalidOperation

from web3 import Web3, HTTPProvider


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, status as drf_status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser

from wallet.models import Wallet, WalletTransaction, Notification

from .services import lookup_rate, get_receiving_details
from .price_service import get_crypto_prices_in_usd, get_usd_ngn_rate_with_margin
from .utils import send_bsc
from .evm_sender import send_evm
from .near_utils import send_near
from .sol_utils import send_solana
from .ton_utils import send_ton
from .models import (
    Crypto, CryptoPurchase, AssetSellOrder, PaymentProof, Asset, ExchangeRateMargin
)
from .serializers import (
    AssetSellOrderSerializer, PaymentProofSerializer,
)

logger = logging.getLogger(__name__)





class AssetListAPI(APIView):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request):
        cryptos = Crypto.objects.all()
        ids = [c.coingecko_id for c in cryptos]

        # Unified bulk price fetch (rate-limited + cached)
        prices = get_crypto_prices_in_usd(ids)

        # Unified FX rate fetch (with margin awareness)
        usd_ngn_rate = get_usd_ngn_rate_with_margin("buy")
        
        output = []
        for c in cryptos:
            stablecoins = {"usdt", "usdc"}

            if c.symbol.lower() in stablecoins:
                usd_price = Decimal("1")
            else:
                usd_price = prices.get(c.coingecko_id, Decimal("0"))


            output.append({
                "id": c.id,
                "name": c.name,
                "symbol": c.symbol,
                "price": float(usd_price),
                "price_ngn": float((usd_price * usd_ngn_rate).quantize(Decimal("0.01"))),
                "logo_url": request.build_absolute_uri(c.logo.url) if c.logo else None,
            })

        return Response({
            "exchange_rate": float(usd_ngn_rate),
            "cryptos": output
        })



# ensure enough precision
getcontext().prec = 28

def _decimal_to_str(d: Decimal) -> str:
    return format(d, 'f')

def _validate_wallet_address(symbol: str, address: str) -> bool:
    """
    Minimal wallet address validation before debiting.
    - For EVM chains use Web3.is_address
    - For Solana, NEAR, TON we do a basic length check (best-effort).
    This is intentionally conservative: callers should still rely on sender RPC errors.
    """
    if not address:
        return False

    sym = symbol.upper()
    try:
        if sym in {"ETH", "ARB", "BNB", "BASE-ETH", "BASE-ARB", "BASE-OPT", "OP"}:
            return Web3.is_address(address)
        if sym == "SOL":
            return 40 <= len(address) <= 88  # reasonable range for base58
        if sym == "NEAR":
            return 2 <= len(address) <= 64
        if sym == "TON":
            return 20 <= len(address) <= 100
        # Fallback: non-empty
        return True
    except Exception:
        return False


def _perform_chain_send(sender_fn, crypto_symbol, wallet_address, crypto_amount, order_id, max_attempts=1) -> tuple[bool, str]:
    """
    Executes the actual on-chain send operation with retries.
    Returns (success: bool, result: tx_hash or error message)
    """
    last_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            # sender_fn is a callable that takes (recipient, amount, order_id)
            tx_hash = sender_fn(wallet_address, crypto_amount, order_id)
            return True, tx_hash
        except Exception as e:
            last_error = str(e)
            logger.warning(
                "Attempt %d/%d failed for %s send: %s",
                attempt, max_attempts, crypto_symbol, last_error
            )

    # all attempts failed
    return False, last_error or "Unknown error"


# small wrappers
def amount_to_wei(amount) -> int:
    from web3 import Web3
    try:
        return int(Web3.to_wei(Decimal(amount), "ether"))
    except Exception:
        return int(float(amount) * (10 ** 18))

SENDERS = {
    # EVM chains
    "ETH": lambda to, amt, oid: send_evm("ETH", to, amt),
    "ARB": lambda to, amt, oid: send_evm("ARB", to, amt),
    "BASE": lambda to, amt, oid: send_evm("BASE", to, amt),
    "OP": lambda to, amt, oid: send_evm("OP", to, amt),
    "POL": lambda to, amt, oid: send_evm("POL", to, amt),
    "AVAX": lambda to, amt, oid: send_evm("AVAX", to, amt),
    "LINEA": lambda to, amt, oid: send_evm("LINEA", to, amt),

    # Non-EVM chains
    "BSC": send_bsc,
    "BNB": send_bsc,
    "SOL": send_solana,
    "NEAR": send_near,
    "TON": send_ton,
}





class BuyCryptoAPI(APIView):
    """
    GET → fetch quoted price for a crypto (price_usd, usd_ngn_rate, price_ngn)
    POST → execute buy:
       payload:
         - amount: number (in currency)
         - currency: "NGN" | "USDT" | "<CRYPTO_SYMBOL>"
         - wallet_address: destination address (string)
         - request_id: optional idempotency key (recommended)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, crypto_id):
        """
        Quote endpoint — returns price snapshot and computed NGN price (strings).
        """
        try:
            crypto = get_object_or_404(Crypto, id=crypto_id)
            coingecko_id = (crypto.coingecko_id or "").lower()
            stablecoins = {"usdt", "usdc", "tether", "usd-coin"}

            # price USD
            if crypto.symbol.lower() in stablecoins:
                crypto_price_usd = Decimal("1")
            else:
                prices = get_crypto_prices_in_usd([coingecko_id])
                crypto_price_usd = Decimal(str(prices.get(coingecko_id) or get_safe_fallback_price(coingecko_id)))

            # usd-ngn with buy margin
            usd_ngn_rate = get_usd_ngn_rate_with_margin("buy")
            if not usd_ngn_rate or Decimal(str(usd_ngn_rate)) <= 0:
                usd_ngn_rate = Decimal("755")

            price_ngn = (crypto_price_usd * Decimal(str(usd_ngn_rate))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            return Response({
                "crypto": crypto.symbol,
                "network": crypto.network,
                "price_usd": _decimal_to_str(crypto_price_usd),
                "usd_ngn_rate": _decimal_to_str(Decimal(str(usd_ngn_rate))),
                "price_ngn": _decimal_to_str(price_ngn),
            }, status=drf_status.HTTP_200_OK)

        except Exception as exc:
            logger.exception("Error fetching buy rate for %s: %s", crypto_id, exc)
            return Response({"error": "failed_to_fetch_rate"}, status=drf_status.HTTP_503_SERVICE_UNAVAILABLE)


    def post(self, request, crypto_id):
        # ---- 0) Parse request_id early ----
        request_id = request.data.get("request_id") or request.data.get("idempotency_key") or str(uuid.uuid4())

        # ---- 1) Basic validation ----
        try:
            crypto = get_object_or_404(Crypto, id=crypto_id)
        except Exception:
            return Response({"error": "invalid_crypto"}, status=drf_status.HTTP_404_NOT_FOUND)

        # ---- 2) Idempotency: return existing order if same request_id ----
        existing_order = CryptoPurchase.objects.filter(request_id=request_id, user=request.user).first()
        if existing_order:
            logger.info("Idempotent request detected: %s for user %s", request_id, request.user.id)
            return Response({
                "transaction_id": existing_order.id,
                "status": existing_order.status,
                "crypto": existing_order.crypto.symbol,
                "crypto_amount": _decimal_to_str(existing_order.crypto_amount),
                "total_ngn": _decimal_to_str(existing_order.total_price),
                "tx_hash": existing_order.tx_hash,
            }, status=drf_status.HTTP_200_OK)

        # ---- 3) Extract other request params ----
        raw_amount = request.data.get("amount")
        currency = (request.data.get("currency") or "NGN").upper()
        wallet_address = (request.data.get("wallet_address") or "").strip()


        if raw_amount is None:
            return Response({"error": "amount_required"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # parse decimal safely
        try:
            amount = Decimal(str(raw_amount))
            if amount <= 0:
                raise InvalidOperation("non-positive")
        except Exception:
            return Response({"error": "invalid_amount"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # basic address validation before debiting
        if not _validate_wallet_address(crypto.symbol, wallet_address):
            return Response({"error": "invalid_wallet_address"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # ---- 2) idempotency: return existing order if same request_id ----
        existing_order = CryptoPurchase.objects.filter(request_id=request_id, user=request.user).first()
        if existing_order:
            logger.info("Idempotent request detected: %s for user %s", request_id, request.user.id)
            return Response({
                "transaction_id": existing_order.id,
                "status": existing_order.status,
                "crypto": existing_order.crypto.symbol,
                "crypto_amount": _decimal_to_str(existing_order.crypto_amount),
                "total_ngn": _decimal_to_str(existing_order.total_price),
                "tx_hash": existing_order.tx_hash,
            }, status=drf_status.HTTP_200_OK)

        # ---- 3) Compute pricing ----
        coingecko_id = (crypto.coingecko_id or "").lower()
        stablecoins = {"usdt", "usdc", "tether", "usd-coin"}

        if crypto.symbol.lower() in stablecoins:
            crypto_price = Decimal("1")
        else:
            prices = get_crypto_prices_in_usd([coingecko_id])
            crypto_price = Decimal(str(prices.get(coingecko_id) or get_safe_fallback_price(coingecko_id)))

        usd_ngn_rate = get_usd_ngn_rate_with_margin("buy")
        usd_ngn_rate = Decimal(str(usd_ngn_rate or DEFAULT_USD_NGN_FALLBACK))

        # compute total in NGN and crypto_amount depending on input currency
        try:
            if currency == "NGN":
                total_ngn = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                crypto_amount = (amount / usd_ngn_rate / crypto_price).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
            elif currency in {"USDT", "USDC"}:
                total_ngn = (amount * usd_ngn_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                crypto_amount = (amount / crypto_price).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
            elif currency == crypto.symbol.upper():
                crypto_amount = amount.quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
                total_ngn = (crypto_amount * crypto_price * usd_ngn_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            else:
                return Response({"error": "unsupported_currency"}, status=drf_status.HTTP_400_BAD_REQUEST)
        except (InvalidOperation, ZeroDivisionError) as exc:
            logger.exception("Pricing calculation failed: %s", exc)
            return Response({"error": "calculation_error"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # enforce minimum/maximum amounts (basic fraud protection)
        MIN_BUY_NGN = Decimal(getattr(settings, "MIN_BUY_NGN", 200))  # example: ₦200 default
        MAX_BUY_NGN = Decimal(getattr(settings, "MAX_BUY_NGN", 10_000_000))  # example
        if total_ngn < MIN_BUY_NGN:
            return Response({"error": "amount_too_small"}, status=drf_status.HTTP_400_BAD_REQUEST)
        if total_ngn > MAX_BUY_NGN:
            return Response({"error": "amount_too_large"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # ---- 4) Atomic debit & create pending records ----
        try:
            with transaction.atomic():
                # lock wallet row
                wallet = Wallet.objects.select_for_update().get(user=request.user)

                if wallet.balance < total_ngn:
                    return Response({"error": "insufficient_funds"}, status=drf_status.HTTP_402_PAYMENT_REQUIRED)

                balance_before = wallet.balance
                # move funds to locked_balance (so other processes can't use them)
                wallet.balance -= total_ngn
                wallet.locked_balance += total_ngn
                wallet.save(update_fields=["balance", "locked_balance"])

                # create crypto purchase order
                order = CryptoPurchase.objects.create(
                    user=request.user,
                    crypto=crypto,
                    input_amount=amount,
                    input_currency=currency,
                    crypto_amount=crypto_amount,
                    total_price=total_ngn,
                    wallet_address=wallet_address,
                    status="pending",
                    request_id=request_id,
                )

                # create WalletTransaction (pending debit)
                WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="crypto",
                    amount=total_ngn,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id=request_id,
                    reference=str(order.id),
                    status="pending",
                    metadata={
                        "crypto": crypto.symbol,
                        "crypto_amount": _decimal_to_str(crypto_amount),
                        "price_usd": _decimal_to_str(crypto_price),
                        "usd_ngn_rate": _decimal_to_str(usd_ngn_rate),
                    },
                )

        except Exception as exc:
            logger.exception("Atomic debit + order creation failed: %s", exc)
            return Response({"error": "transaction_failed"}, status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)

        # ---- 5) Perform chain send (outside DB atomic) ----
        sender_fn = SENDERS.get(crypto.network.upper())
        if not sender_fn:
            # unsupported network
            logger.error(f"Unsupported network for onchain send: {crypto.network}")
            # refund locked funds
            try:
                with transaction.atomic():
                    wallet = Wallet.objects.select_for_update().get(user=request.user)
                    # refund locked -> balance
                    wallet.locked_balance -= total_ngn
                    wallet.balance += total_ngn
                    wallet.save(update_fields=["balance", "locked_balance"])

                    WalletTransaction.objects.filter(request_id=request_id).update(
                        status="failed",
                        balance_after=wallet.balance
                    )
                    order.status = "failed"
                    order.save(update_fields=["status"])
            except Exception:
                logger.exception("Refund after unsupported token failed")
            return Response({"error": "unsupported_token"}, status=drf_status.HTTP_400_BAD_REQUEST)

        success, result = _perform_chain_send(sender_fn, crypto.symbol, wallet_address, crypto_amount, order.id, max_attempts=2)
        if not success:
            # chain send failed - refund
            err_msg = result
            logger.error("Chain send failed for order %s: %s", order.id, err_msg)

            try:
                with transaction.atomic():
                    wallet = Wallet.objects.select_for_update().get(user=request.user)
                    wallet.locked_balance -= total_ngn
                    wallet.balance += total_ngn
                    wallet.save(update_fields=["balance", "locked_balance"])

                    WalletTransaction.objects.filter(request_id=request_id).update(
                        status="failed",
                        balance_after=wallet.balance,
                        metadata={"error": err_msg}
                    )

                    order.status = "failed"
                    order.save(update_fields=["status"])
            except Exception:
                logger.exception("Refund after chain failure failed for order %s", order.id)

            # Map common errors to user-friendly messages
            msg = "Transaction failed. Please try again."
            if "Insufficient" in err_msg:
                msg = "Insufficient funds in sender wallet."
            elif "Invalid" in err_msg or "address" in err_msg.lower():
                msg = "Wallet address invalid."
            elif "network" in err_msg.lower():
                msg = "Network problem — try again soon."

            return Response({"error": msg, "detail": str(err_msg)}, status=drf_status.HTTP_400_BAD_REQUEST)

        # ---- 6) success path — mark order + tx success and release locked funds appropriately ----
        tx_hash = result
        try:
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(user=request.user)
                # Remove locked funds permanently (they were spent on chain)
                wallet.locked_balance -= total_ngn
                # balance already reduced earlier; no change to balance
                wallet.save(update_fields=["locked_balance"])

                order.status = "completed"
                order.tx_hash = tx_hash
                order.save(update_fields=["status", "tx_hash"])

                WalletTransaction.objects.filter(request_id=request_id).update(
                    status="success",
                    reference=tx_hash,
                    balance_after=wallet.balance
                )
        except Exception as exc:
            # This is bad (DB update failure after on-chain success), we must log and surface
            logger.exception("Failed to finalize order %s after chain success: %s", order.id, exc)
            return Response({"error": "post_processing_failed", "tx_hash": tx_hash}, status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Return success
        return Response({
            "success": True,
            "crypto": crypto.symbol,
            "crypto_amount": _decimal_to_str(crypto_amount),
            "total_ngn": _decimal_to_str(total_ngn),
            "wallet_address": wallet_address,
            "tx_hash": tx_hash,
            "transaction_id": order.id,
        }, status=drf_status.HTTP_201_CREATED)

def refund_user(purchase):
    """Refund NGN balance when blockchain send failed."""
    if purchase.status == "completed":
        return False   # cannot refund successful orders

    try:
        wallet = Wallet.objects.select_for_update().get(user=purchase.user)
        balance_before = wallet.balance

        wallet.balance += purchase.total_price
        wallet.save(update_fields=["balance"])

        purchase.status = "failed"
        purchase.save(update_fields=["status"])

        # Update linked wallet transaction
        tx = WalletTransaction.objects.filter(request_id=purchase.request_id).first()
        if tx:
            tx.status = "failed"
            tx.balance_after = wallet.balance
            tx.save(update_fields=["status", "balance_after"])

        return True
    except:
        return False


         
# ---------- Helpers ----------
def _normalize_name(raw: str) -> str:
    # normalizes env var name -> display name
    return raw.replace("_RECEIVE_DETAILS", "").replace("_", " ").title()

def get_exchange_details_map():
    """
    Auto-detect all settings that end with _RECEIVE_DETAILS and build a map.
    Example: BINANCE_RECEIVE_DETAILS -> 'Binance': {uid: ..., email: ...}
    """
    exchanges = {}
    for attr in dir(settings):
        if not attr.endswith("_RECEIVE_DETAILS"):
            continue
        try:
            details = getattr(settings, attr, None) or {}
            # try to ensure dict (if loaded via json in settings it's already a dict)
            if isinstance(details, str):
                details = json.loads(details)
        except Exception:
            details = {}
        # normalize key
        key = _normalize_name(attr)
        exchanges[key] = details or {}
    return exchanges

# ---------- Exchange endpoints ----------
class ExchangeListAPI(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        exchanges = list(get_exchange_details_map().keys())
        return Response({"exchanges": exchanges}, status=drf_status.HTTP_200_OK)

class ExchangeInfoAPI(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        exchange = request.query_params.get("exchange")
        if not exchange:
            return Response({"error": "Exchange parameter is required"}, status=drf_status.HTTP_400_BAD_REQUEST)

        # normalize incoming exchange names (allow case-insensitive)
        exchanges = get_exchange_details_map()
        # attempt exact match, then case-insensitive match
        details = exchanges.get(exchange)
        if not details:
            # case-insensitive search
            match = next((v for k, v in exchanges.items() if k.lower() == exchange.lower()), None)
            details = match
            exchange = next((k for k in exchanges if k.lower() == exchange.lower()), exchange)

        if not details:
            return Response({"error": "Exchange not found"}, status=drf_status.HTTP_404_NOT_FOUND)

        return Response({"exchange": exchange, "contact_info": details}, status=drf_status.HTTP_200_OK)

class ExchangeRateAPI(APIView):
    """
    Returns the NGN rate for 1 unit of an asset.
    Stablecoins (USDT/USDC) are always treated as exactly $1.00.
    This makes Step-1 and Step-2 match perfectly.
    """

    def get(self, request, asset):
        asset = asset.upper()

        # 1. Validate asset exists
        asset_obj = get_object_or_404(Asset, symbol__iexact=asset)

        # 2. Fetch USD→NGN SELL rate with margin
        usd_to_ngn = get_usd_ngn_rate_with_margin(margin_type="sell")

        symbol_lower = asset_obj.symbol.lower()
        stablecoins = {"usdt", "usdc"}

        # 3. Stablecoins → always 1 USD
        if symbol_lower in stablecoins:
            asset_to_ngn = usd_to_ngn

        else:
            # 4. Non-stables: fetch real USD price
            try:
                prices = get_crypto_prices_in_usd([asset_obj.coingecko_id])
                price_usd = prices.get(asset_obj.coingecko_id)

                if not price_usd or price_usd <= 0:
                    price_usd = cache.get(f"cg_usd_backup_{asset_obj.coingecko_id}") or Decimal("0.25")
                    logger.warning(
                        "[CG] Using backup USD price for %s: %s USD", asset_obj.symbol, price_usd
                    )

            except Exception as e:
                logger.warning("USD price fetch failed: %s", e)
                price_usd = cache.get(f"cg_usd_backup_{asset_obj.coingecko_id}") or Decimal("0.25")

            asset_to_ngn = (Decimal(price_usd) * usd_to_ngn).quantize(Decimal("0.01"))

        logger.info(f"[SELL RATE API] 1 {asset_obj.symbol} = ₦{asset_to_ngn}")

        return Response(
            {
                "success": True,
                "asset": asset_obj.symbol,
                "rate_ngn": str(asset_to_ngn),
                "margin_type": "sell",
            },
            status=drf_status.HTTP_200_OK,
        )


class SellAssetListAPI(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        assets = Asset.objects.values("id", "name", "symbol")
        return Response({"assets": list(assets)}, status=drf_status.HTTP_200_OK)

# ---------- Sell endpoints ----------
def compute_ngn_amount_dynamic(asset_symbol: str, amount_asset: Decimal, margin_type="sell") -> tuple[Decimal, Decimal]:
    """
    Compute NGN amount dynamically:
      1. Fetch USD price of asset from CoinGecko / Binance (with backup)
      2. Fetch USD→NGN rate with margin (with backup)
      3. Multiply to get NGN amount
    Returns tuple: (amount_ngn, usd_to_ngn_rate)
    """
    try:
        asset_obj = Asset.objects.get(symbol__iexact=asset_symbol)
        coingecko_id = asset_obj.coingecko_id
    except Asset.DoesNotExist:
        raise ValueError(f"Asset not found: {asset_symbol}")

    # Step 1 — get crypto price in USD
    stablecoins = {"usdt", "usdc"}

    if asset_symbol.lower() in stablecoins:
        # Stablecoins MUST be treated as $1.00 to match frontend
        price_usd = Decimal("1")
    else:
        try:
            prices = get_crypto_prices_in_usd([coingecko_id])
            price_usd = prices.get(coingecko_id)

            if not price_usd or price_usd == 0:
                price_usd = cache.get(f"cg_usd_backup_{coingecko_id}") or Decimal("0.25")
                logger.warning("[CG] Falling back to backup price for %s: %s USD", asset_symbol, price_usd)

        except Exception as e:
            logger.warning("Crypto price fetch failed: %s", e)
            price_usd = cache.get(f"cg_usd_backup_{coingecko_id}") or Decimal("0.25")

    # Step 2 — get USD→NGN rate with margin
    try:
        usd_to_ngn = get_usd_ngn_rate_with_margin(margin_type=margin_type)
        if not usd_to_ngn or usd_to_ngn == 0:
            # fallback to backup if fresh fetch failed
            usd_to_ngn = cache.get("usd_ngn_rate_backup") or Decimal("755")  # safer fallback
            logger.warning("[FX] Falling back to backup USD→NGN rate: %s", usd_to_ngn)
    except Exception as e:
        logger.warning("USD→NGN fetch failed: %s", e)
        usd_to_ngn = cache.get("usd_ngn_rate_backup") or Decimal("755")

    # Step 3 — compute NGN amount
    amount_ngn = (amount_asset * price_usd * usd_to_ngn).quantize(Decimal("0.01"))
    return amount_ngn, usd_to_ngn


class StartSellOrderAPI(APIView):
    permission_classes = []

    def post(self, request):
        asset_symbol = str(request.data.get("asset") or "").strip()
        source_name = str(request.data.get("source") or "").strip()
        amount_str = request.data.get("amount_asset")

        # --- Basic validation ---
        if not asset_symbol or not source_name or amount_str is None:
            return Response(
                {"error": "asset, source and amount_asset are required."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount_asset = Decimal(str(amount_str))
            if amount_asset <= 0:
                raise ValueError("amount_asset must be greater than 0.")
        except (InvalidOperation, ValueError):
            return Response(
                {"error": f"Invalid amount_asset: {amount_str}"},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        # --- Validate asset ---
        try:
            asset = Asset.objects.get(symbol__iexact=asset_symbol)
        except Asset.DoesNotExist:
            return Response(
                {"error": f"Asset not found: {asset_symbol}"},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

        # --- Validate exchange/source ---
        exchanges = get_exchange_details_map()
        exchange_key = next(
            (k for k in exchanges if k.lower() == source_name.lower()), None
        )
        if not exchange_key:
            return Response(
                {"error": f"Exchange/source not supported: {source_name}"},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )
        exchange_details = exchanges.get(exchange_key, {})

        # --- Compute NGN dynamically ---
        try:
            amount_ngn, usd_to_ngn_rate = compute_ngn_amount_dynamic(asset_symbol, amount_asset, margin_type="sell")
        except Exception as e:
            logger.error("Error computing NGN amount: %s", e)
            return Response(
                {"error": "Could not compute NGN equivalent"},
                status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            "[SELL ORDER] User %s selling %s %s → NGN₦%s (USD→NGN=%s)",
            getattr(request.user, "id", "anonymous"),
            amount_asset,
            asset.symbol,
            amount_ngn,
            usd_to_ngn_rate,
        )

        # --- Create sell order ---
        try:
            with transaction.atomic():
                order = AssetSellOrder.objects.create(
                    user=request.user,
                    asset=asset,
                    source=exchange_key,
                    amount_asset=amount_asset,
                    rate_ngn=usd_to_ngn_rate,
                    amount_ngn=amount_ngn,
                    status="pending_payment",
                    details={"exchange_contact": exchange_details},
                )

            expires_in = 30 * 60  # 30 min
            serializer = AssetSellOrderSerializer(order)

            return Response(
                {
                    "success": True,
                    "order": serializer.data,
                    "exchange_details": exchange_details,
                    "expires_in": expires_in,
                },
                status=drf_status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.exception("Error creating sell order: %s", e)
            return Response(
                {"success": False, "message": "Could not create sell order"},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

class UploadSellOrderProofAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)

        if order.status not in ["pending", "pending_payment"]:
            return Response(
                {"success": False, "message": "This order cannot accept proof uploads at this stage."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        proof = request.FILES.get("proof")
        if not proof:
            return Response({"success": False, "message": "No file uploaded."}, status=400)

        order.payment_proof = proof
        order.status = "proof_submitted"
        order.save()

        return Response(
            {"success": True, "message": "Payment proof uploaded successfully."},
            status=status.HTTP_200_OK,
        )

class SellOrderUpdateAPI(APIView):
    permission_classes = []

    def patch(self, request, order_id):
        order = AssetSellOrder.objects.filter(order_id=order_id, user=request.user).first()
        if not order:
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)

        if order.status != "pending_payment":
            return Response(
                {"error": "Order cannot be updated after proof submission."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AssetSellOrderSerializer(order, data=request.data, partial=True)
        if serializer.is_valid():
            with transaction.atomic():
                order = serializer.save()

                # 🔹 Recalculate NGN values if amount_asset or asset changed
                if "amount_asset" in serializer.validated_data or "asset" in serializer.validated_data:
                    try:
                        coingecko_id = order.asset.coingecko_id
                        price_usd = get_crypto_prices_in_usd([coingecko_id])[coingecko_id]
                        new_rate = get_usd_ngn_rate_with_margin(margin_type="sell")
                        order.rate_ngn = new_rate
                        order.amount_ngn = (order.amount_asset * price_usd * new_rate).quantize(Decimal("0.01"))
                        order.save(update_fields=["rate_ngn", "amount_ngn"])
                    except Exception as e:
                        logger.warning("Failed to recalc NGN for updated order %s: %s", order.order_id, e)

            return Response(
                {"success": True, "order": AssetSellOrderSerializer(order).data},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PendingSellOrdersAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = AssetSellOrder.objects.filter(user=request.user, status__in=["pending", "awaiting_admin"]).order_by("-created_at")
        serializer = AssetSellOrderSerializer(orders, many=True)
        return Response({"orders": serializer.data}, status=drf_status.HTTP_200_OK)

class SellOrderStatusAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        order = AssetSellOrder.objects.filter(order_id=order_id, user=request.user).first()
        if not order:
            return Response({"error": "Order not found"}, status=404)

        serializer = AssetSellOrderSerializer(order)
        # include exchange details from settings if not present
        exchanges = get_exchange_details_map()
        exchange_details = exchanges.get(order.source) or exchanges.get(order.source.title()) or {}
        resp = {"success": True, "order": serializer.data, "exchange_details": exchange_details}
        return Response(resp, status=drf_status.HTTP_200_OK)

class CancelSellOrderAPI(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, order_id):
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)

        if order.status in ["completed", "failed", "cancelled", "expired"]:
            return Response(
                {"success": False, "message": "Order cannot be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = "cancelled"
        order.save(update_fields=["status"])

        return Response(
            {"success": True, "message": "Order cancelled"},
            status=status.HTTP_200_OK,
        )
        
class AdminSellOrdersAPI(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        """List all sell orders (latest first)."""
        orders = AssetSellOrder.objects.all().order_by("-created_at")
        data = AssetSellOrderSerializer(orders, many=True).data
        return Response({"orders": data}, status=status.HTTP_200_OK)

class AdminUpdateSellOrderAPI(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, order_id):
        order = get_object_or_404(AssetSellOrder, order_id=order_id)
        new_status = request.data.get("status")

        if new_status not in ["completed", "cancelled", "reversed"]:
            return Response({"success": False, "message": "Invalid status."}, status=400)

        # ✅ Approve
        if new_status == "completed" and order.status == "proof_submitted":
            try:
                with transaction.atomic():
                    wallet = Wallet.objects.select_for_update().get(user=order.user)
                    balance_before = wallet.balance
                    wallet.balance += order.amount_ngn
                    wallet.save(update_fields=["balance"])

                    WalletTransaction.objects.create(
                        user=order.user,
                        wallet=wallet,
                        tx_type="credit",
                        category="sell_order",
                        amount=order.amount_ngn,
                        balance_before=balance_before,
                        balance_after=wallet.balance,
                        request_id=str(order.order_id),
                        status="success",
                        reference=f"SELL-{order.order_id}",
                    )

                    order.status = "completed"
                    order.save(update_fields=["status", "updated_at"])

                    Notification.objects.create(
                        user=order.user,
                        message=f"Sell order {order.order_id} approved and wallet credited.",
                        is_read=False,
                    )

                return Response(
                    {"success": True, "message": "Order approved and wallet credited."},
                    status=status.HTTP_200_OK,
                )

            except Exception as e:
                logger.error(f"Wallet credit failed for order {order.order_id}: {e}", exc_info=True)
                return Response({"success": False, "message": "Error crediting wallet."}, status=500)

        # ❌ Reject
        elif new_status == "cancelled" and order.status == "proof_submitted":
            order.status = "cancelled"
            order.save(update_fields=["status", "updated_at"])

            Notification.objects.create(
                user=order.user,
                message=f"Sell order {order.order_id} was rejected by admin.",
                is_read=False,
            )

            return Response({"success": True, "message": "Order cancelled."}, status=200)

        # 🔁 Reverse (undo credit)
        elif new_status == "reversed" and order.status == "completed":
            try:
                with transaction.atomic():
                    wallet = Wallet.objects.select_for_update().get(user=order.user)

                    if wallet.balance < order.amount_ngn:
                        return Response(
                            {"success": False, "message": "Insufficient wallet balance to reverse."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )

                    balance_before = wallet.balance
                    wallet.balance -= order.amount_ngn
                    wallet.save(update_fields=["balance"])

                    WalletTransaction.objects.create(
                        user=order.user,
                        wallet=wallet,
                        tx_type="debit",
                        category="sell_order_reversal",
                        amount=order.amount_ngn,
                        balance_before=balance_before,
                        balance_after=wallet.balance,
                        request_id=f"REV-{order.order_id}",
                        status="success",
                        reference=f"REV-SELL-{order.order_id}",
                    )

                    order.status = "reversed"
                    order.save(update_fields=["status", "updated_at"])

                    Notification.objects.create(
                        user=order.user,
                        message=f"Sell order {order.order_id} has been reversed and funds debited.",
                        is_read=False,
                    )

                return Response(
                    {"success": True, "message": "Order reversed and funds debited."},
                    status=status.HTTP_200_OK,
                )

            except Exception as e:
                logger.error(f"Failed to reverse wallet for order {order.order_id}: {e}", exc_info=True)
                return Response(
                    {"success": False, "message": "Error reversing wallet."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # 🚫 Invalid state transition
        return Response(
            {"success": False, "message": "Invalid transition for this order."},
            status=400,
        )