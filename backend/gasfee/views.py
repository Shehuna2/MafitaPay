# gasfee/api_views.py
import uuid
import json
import logging
import requests
import traceback


from decimal import Decimal
from django.conf import settings
from django.db import transaction
from django.core.cache import cache
from django.shortcuts import get_object_or_404
from decimal import InvalidOperation


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, status as drf_status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser

from wallet.models import Wallet, WalletTransaction, Notification

from .services import lookup_rate, get_receiving_details
from .price_service import get_crypto_prices_in_usd, get_usd_ngn_rate_with_margin

# from .utils import get_crypto_price, get_bulk_crypto_prices, get_exchange_rate, send_bsc, send_evm
from .utils import send_bsc, send_evm
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

# small wrappers
def amount_to_wei(amount) -> int:
    from web3 import Web3
    try:
        return int(Web3.to_wei(Decimal(amount), "ether"))
    except Exception:
        return int(float(amount) * (10 ** 18))

def send_eth(recipient, amount, order_id=None):
    return send_evm("ETH", recipient, amount_to_wei(amount), order_id)

def send_arbitrum(recipient, amount, order_id=None):
    return send_evm("ARB", recipient, amount_to_wei(amount), order_id)

def send_base(recipient, amount, order_id=None):
    return send_evm("BASE", recipient, amount_to_wei(amount), order_id)

def send_optimism(recipient, amount, order_id=None):
    return send_evm("OP", recipient, amount_to_wei(amount), order_id)

SENDERS = {
    "BNB": send_bsc,
    "SOL": send_solana,
    "TON": send_ton,
    "NEAR": send_near,
    "ETH": send_eth,
    "ARB": send_arbitrum,
    "BASE-ETH": send_base,
    "BASE-ARB": send_arbitrum,
    "BASE-OPT": send_optimism,
}


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



class BuyCryptoAPI(APIView):
    permission_classes = []

    # ======================
    # GET RATE (patched)
    # ======================
    def get(self, request, crypto_id):
        try:
            crypto = get_object_or_404(Crypto, id=crypto_id)
            coingecko_id = crypto.coingecko_id

            # ------------------------------
            # Step 1 — fetch crypto price USD
            # ------------------------------
            try:
                prices = get_crypto_prices_in_usd([coingecko_id])
                crypto_price_usd = prices.get(coingecko_id)
                if not crypto_price_usd or crypto_price_usd <= 0:
                    # Fallback to last good cached price or safe default
                    crypto_price_usd = cache.get(f"cg_usd_backup_{coingecko_id}") or Decimal("0.25")
            except Exception as e:
                logger.warning(f"[BUY] Crypto price fetch failed: {e}")
                crypto_price_usd = cache.get(f"cg_usd_backup_{coingecko_id}") or Decimal("0.25")

            # ------------------------------
            # Step 2 — fetch USD→NGN rate (BUY margin)
            # ------------------------------
            try:
                usd_ngn_rate = get_usd_ngn_rate_with_margin("buy")
                if not usd_ngn_rate or usd_ngn_rate <= 0:
                    usd_ngn_rate = cache.get("usd_ngn_rate_backup") or Decimal("755")
            except Exception as e:
                logger.warning(f"[BUY] USD→NGN fetch failed: {e}")
                usd_ngn_rate = cache.get("usd_ngn_rate_backup") or Decimal("755")

            # ------------------------------
            # Step 3 — compute NGN price
            # ------------------------------
            price_ngn = (crypto_price_usd * usd_ngn_rate).quantize(Decimal("0.01"))

            return Response({
                "crypto": crypto.symbol,
                "network": crypto.network,
                "price_usd": float(crypto_price_usd),
                "usd_ngn_rate": float(usd_ngn_rate),
                "price_ngn": float(price_ngn),
            })

        except Exception as e:
            logger.error(f"Error fetching buy rate for {crypto_id}: {str(e)}")
            return Response({"error": str(e)}, status=500)


    def post(self, request, crypto_id):
        crypto = get_object_or_404(Crypto, id=crypto_id)

        # Validate amount
        try:
            amount = Decimal(request.data.get("amount", "0"))
            if amount <= 0:
                return Response({"success": False, "error": "Invalid amount"}, status=400)
        except:
            return Response({"success": False, "error": "Invalid amount format"}, status=400)

        currency = request.data.get("currency", "NGN").upper()
        wallet_address = request.data.get("wallet_address", "").strip()

        # Compute rates (CORRECTED to margin-aware)
        crypto_price = get_crypto_prices_in_usd([crypto.coingecko_id])[crypto.coingecko_id]
        exchange_rate = get_usd_ngn_rate_with_margin("buy")  # <-- updated

        # Convert
        if currency == "NGN":
            total_ngn = amount
            crypto_amount = (amount / exchange_rate) / crypto_price

        elif currency == "USDT":
            total_ngn = amount * exchange_rate
            crypto_amount = amount / crypto_price

        elif currency == crypto.symbol.upper():
            crypto_amount = amount
            total_ngn = amount * crypto_price * exchange_rate

        else:
            return Response({"success": False, "error": "Unsupported currency"}, status=400)

        req_id = str(uuid.uuid4())

        # =======================================
        #  ATOMIC USER DEBIT + ORDER CREATION
        # =======================================
        try:
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(user=request.user)

                if wallet.balance < total_ngn:
                    return Response(
                        {"success": False, "error": "Insufficient balance"},
                        status=400,
                    )

                balance_before = wallet.balance
                wallet.balance -= total_ngn
                wallet.save(update_fields=["balance"])

                order = CryptoPurchase.objects.create(
                    user=request.user,
                    crypto=crypto,
                    input_amount=amount,
                    input_currency=currency,
                    crypto_amount=crypto_amount,
                    total_price=total_ngn,
                    wallet_address=wallet_address,
                    request_id=req_id,
                    status="pending",
                )

                WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="crypto",
                    amount=total_ngn,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id=req_id,
                    status="pending",
                )

        except Exception as e:
            logger.error(f"Atomic block failed: {e}")
            return Response({"error": "Could not process transaction"}, status=500)

        # =======================================
        #       CHAIN SEND (OUTSIDE ATOMIC)
        # =======================================
        sender = SENDERS.get(crypto.symbol.upper())
        if not sender:
            refund_user(order)
            return Response({"success": False, "error": "Unsupported token"}, status=400)

        try:
            # NEAR special case
            if crypto.symbol.upper() == "NEAR":
                tx_hash = sender(wallet_address, float(crypto_amount))
            else:
                tx_hash = sender(wallet_address, float(crypto_amount), order.id)

            # Mark success
            order.tx_hash = tx_hash
            order.status = "completed"
            order.save(update_fields=["tx_hash", "status"])

            WalletTransaction.objects.filter(request_id=req_id).update(
                status="success", reference=tx_hash
            )

            return Response({
                "success": True,
                "crypto": crypto.symbol,
                "crypto_amount": str(crypto_amount),
                "total_ngn": str(total_ngn),
                "wallet_address": wallet_address,
                "tx_hash": tx_hash,
            })

        except Exception as e:
            logger.error(f"Blockchain send failed: {e}")

            # refund ALWAYS on failures
            refund_user(order)

            msg = "Transaction failed. Please try again."
            if "InsufficientFunds" in str(e):
                msg = "Insufficient funds in sender wallet."
            elif "InvalidAddress" in str(e):
                msg = "Wallet address is invalid."
            elif "network" in str(e).lower():
                msg = "Network issue — try again soon."

            return Response({"error": msg}, status=400)


        try:
            # NEAR special case
            if crypto.symbol.upper() == "NEAR":
                tx_hash = sender(wallet_address, float(crypto_amount))
            else:
                tx_hash = sender(wallet_address, float(crypto_amount), order.id)

            # Mark success
            order.tx_hash = tx_hash
            order.status = "completed"
            order.save(update_fields=["tx_hash", "status"])

            WalletTransaction.objects.filter(request_id=req_id).update(
                status="success", reference=tx_hash
            )

            return Response({
                "success": True,
                "crypto": crypto.symbol,
                "crypto_amount": str(crypto_amount),
                "total_ngn": str(total_ngn),
                "wallet_address": wallet_address,
                "tx_hash": tx_hash,
            })

        except Exception as e:
            logger.error(f"Blockchain send failed: {e}")

            # refund ALWAYS on failures
            refund_user(order)

            msg = "Transaction failed. Please try again."
            if "InsufficientFunds" in str(e):
                msg = "Insufficient funds in sender wallet."
            elif "InvalidAddress" in str(e):
                msg = "Wallet address is invalid."
            elif "network" in str(e).lower():
                msg = "Network issue — try again soon."

            return Response({"error": msg}, status=400)


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
    Returns the current NGN rate for a given asset (used in sell flow).
    Unified: uses ExchangeRateMargin for 'sell' rates, not the old ExchangeRate table.
    """

    def get(self, request, asset):
        asset = asset.upper()

        # Validate asset existence
        asset_obj = get_object_or_404(Asset, symbol__iexact=asset)

        # ✅ Get base USD→NGN rate with 'sell' margin applied
        usd_to_ngn = get_usd_ngn_rate_with_margin(margin_type="sell")

        # ✅ For simplicity, treat every asset as 1:1 to USD (USDT, USDC, etc.)
        #    If you add special tokens later (e.g. PI or SIDRA), handle conversion here.
        if asset_obj.symbol.lower() in ["usdt", "usdc"]:
            asset_to_ngn = usd_to_ngn
        else:
            # fallback same rate, but you can customize this per asset later
            asset_to_ngn = usd_to_ngn

        logger.info(f"[SELL RATE] 1 {asset_obj.symbol} = ₦{asset_to_ngn}")

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
    try:
        prices = get_crypto_prices_in_usd([coingecko_id])
        price_usd = prices.get(coingecko_id)
        if not price_usd or price_usd == 0:
            # fallback to backup cache if fresh fetch failed
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