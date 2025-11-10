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


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, status as drf_status
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser

from wallet.models import Wallet, WalletTransaction

from .services import lookup_rate, get_receiving_details
from .utils import get_crypto_price, get_exchange_rate, send_bsc, send_evm
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

# 🔹 Chain senders
SENDERS = {
    "BNB": send_bsc,
    "SOL": send_solana,
    "TON": send_ton,
    "NEAR": send_near,
    "ETH": send_evm,
    "BASE-ETH": send_evm,
    "BASE-ARB": send_evm,
    "BASE-OPT": send_evm,
}

class AssetListAPI(APIView):
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request):
        cryptos = Crypto.objects.all()
        coingecko_ids = [c.coingecko_id for c in cryptos]

        # ✅ Exchange rate
        exchange_rate = cache.get("exchange_rate_usd_ngn")
        if exchange_rate is None:
            exchange_rate = get_exchange_rate()
            cache.set("exchange_rate_usd_ngn", exchange_rate, 300)

        # ✅ Crypto prices
        cache_key = f"crypto_prices_{'_'.join(sorted(coingecko_ids))}"
        prices = cache.get(cache_key)
        if prices is None:
            try:
                resp = requests.get(
                    "https://api.coingecko.com/api/v3/simple/price",
                    params={"ids": ",".join(coingecko_ids), "vs_currencies": "usd"},
                    timeout=5,
                )
                resp.raise_for_status()
                prices = resp.json()
                cache.set(cache_key, prices, 300)
            except Exception as e:
                logger.error(f"Failed to fetch crypto prices: {e}")
                prices = {}

        crypto_list = []
        for c in cryptos:
            price = prices.get(c.coingecko_id, {}).get("usd", 0.0)
            crypto_list.append({
                "id": c.id,
                "name": c.name,
                "symbol": c.symbol,
                "price": float(price),
                "logo_url": request.build_absolute_uri(c.logo.url) if c.logo else None,
            })

        return Response({
            "exchange_rate": float(exchange_rate),
            "cryptos": crypto_list
        })

class BuyCryptoAPI(APIView):
    """
    GET  → Fetch live buy rate (includes profit margin)
    POST → Execute crypto purchase
    """
    permission_classes = [permissions.IsAuthenticated]

    # ✅ 1. GET: Rate preview
    def get(self, request, crypto_id):
        try:
            crypto = get_object_or_404(Crypto, id=crypto_id)
            coingecko_id = crypto.coingecko_id

            # live crypto price (USD)
            crypto_price_usd = get_crypto_price(coingecko_id, network=crypto.network)

            # USD→NGN rate + BUY margin
            usd_ngn_rate = get_exchange_rate(margin_type="buy")

            price_ngn = crypto_price_usd * usd_ngn_rate

            return Response({
                "crypto": crypto.symbol,
                "network": crypto.network,
                "price_usd": round(crypto_price_usd, 2),
                "usd_ngn_rate": round(usd_ngn_rate, 2),
                "price_ngn": round(price_ngn, 2),
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Error fetching buy rate for {crypto_id}: {str(e)}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # ✅ 2. POST: Execute purchase
    def post(self, request, crypto_id):
        crypto = get_object_or_404(Crypto, id=crypto_id)

        try:
            amount = Decimal(request.data.get("amount", "0"))
            if amount <= 0:
                return Response({"success": False, "error": "Invalid amount"}, status=400)
        except Exception:
            return Response({"success": False, "error": "Invalid amount format"}, status=400)

        currency = request.data.get("currency", "NGN").upper()
        wallet_address = request.data.get("wallet_address", "").strip()

        # ✅ Use unified margin-based rate
        exchange_rate = cache.get("exchange_rate_usd_ngn") or get_exchange_rate(margin_type="buy")
        crypto_price = get_crypto_price(crypto.coingecko_id, crypto.network)

        if currency == "NGN":
            total_ngn = amount
            crypto_received = amount / exchange_rate / crypto_price
        elif currency == "USDT":
            total_ngn = amount * exchange_rate
            crypto_received = amount / crypto_price
        elif currency == crypto.symbol.upper():
            crypto_received = amount
            total_ngn = amount * crypto_price * exchange_rate
        else:
            return Response({"success": False, "error": "Unsupported currency"}, status=400)

        req_id = str(uuid.uuid4())

        try:
            with transaction.atomic():
                wallet = Wallet.objects.select_for_update().get(user=request.user)

                if wallet.balance < total_ngn:
                    return Response(
                        {"success": False, "error": "Insufficient balance"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                balance_before = wallet.balance
                wallet.balance -= total_ngn
                wallet.save()

                order = CryptoPurchase.objects.create(
                    user=request.user,
                    crypto=crypto,
                    input_amount=amount,
                    input_currency=currency,
                    crypto_amount=crypto_received,
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
                    amount=Decimal(total_ngn),
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id=req_id,
                    status="pending",
                )

            sender = SENDERS.get(crypto.symbol.upper())
            if not sender:
                order.status = "failed"
                order.save()
                return Response({"success": False, "error": "Unsupported token"}, status=400)

            result = (
                sender(wallet_address, float(crypto_received))
                if crypto.symbol.upper() == "NEAR"
                else sender(wallet_address, float(crypto_received), order.id)
            )

            tx_hash = result if isinstance(result, str) else result[0]

            order.tx_hash = tx_hash
            order.status = "completed"
            order.save(update_fields=["tx_hash", "status"])

            WalletTransaction.objects.filter(request_id=req_id).update(
                status="success", reference=tx_hash
            )

            return Response({
                "success": True,
                "crypto": crypto.symbol,
                "crypto_amount": str(crypto_received),
                "total_ngn": str(total_ngn),
                "wallet_address": wallet_address,
                "tx_hash": tx_hash,
            }, status=200)

        except Exception as e:
            logger.error(f"Buy transaction error: {str(e)}")
            msg = "Transaction failed. Please try again later."
            if "InsufficientFunds" in str(e):
                msg = "Insufficient funds. Please top up your wallet."
            elif "InvalidAddress" in str(e):
                msg = "The wallet address appears invalid."
            elif "network" in str(e).lower():
                msg = "Network issue — please retry in a few seconds."
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)

def refund_user(purchase):
    """Refunds a user if an order fails, and updates WalletTransaction."""
    if purchase.status == "failed":
        return False

    try:
        wallet = Wallet.objects.get(user=purchase.user)
        balance_before = wallet.balance
        wallet.balance += purchase.total_price
        wallet.save(update_fields=["balance"])

        purchase.status = "failed"
        purchase.save(update_fields=["status"])

        # 🔹 Update linked WalletTransaction
        tx = WalletTransaction.objects.filter(request_id=purchase.request_id).first()
        if tx:
            tx.status = "failed"
            tx.balance_after = wallet.balance
            tx.save(update_fields=["status", "balance_after"])

        return True
    except Wallet.DoesNotExist:
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
        usd_to_ngn = get_exchange_rate(margin_type="sell")

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
class StartSellOrderAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = {
            "asset": request.data.get("asset"),
            "source": request.data.get("source"),
            "amount_asset": request.data.get("amount_asset"),
        }
        print("Incoming source:", request.data.get("source"))

        # --- Basic validation ---
        if not data["asset"] or not data["source"] or not data["amount_asset"]:
            return Response(
                {"error": "asset, source and amount_asset are required."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount_asset = Decimal(str(data["amount_asset"]))
            if amount_asset <= 0:
                return Response(
                    {"error": "amount_asset must be greater than 0."},
                    status=drf_status.HTTP_400_BAD_REQUEST,
                )
        except Exception:
            return Response(
                {"error": "Invalid amount_asset."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        # --- Validate asset ---
        try:
            asset = Asset.objects.get(symbol__iexact=data["asset"])
        except Asset.DoesNotExist:
            return Response(
                {"error": "Asset not found."},
                status=drf_status.HTTP_404_NOT_FOUND,
            )

        # --- Validate source/exchange ---
        exchanges = get_exchange_details_map()
        exchange_key = next(
            (k for k in exchanges if k.lower() == str(data["source"]).lower()), None
        )
        if not exchange_key:
            return Response(
                {"error": "Exchange/source not supported."},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )
        exchange_details = exchanges[exchange_key] or {}

        try:
            rate_ngn = get_exchange_rate(margin_type="sell")
        except ExchangeRateMargin.DoesNotExist:
            logger.warning("ExchangeRateMargin missing for asset %s", asset)
            # fallback if rate not found — use live USD→NGN
            usd_to_ngn = get_exchange_rate(margin_type="sell")
            rate_ngn = Decimal(usd_to_ngn)

        # --- Compute amount in NGN ---
        amount_ngn = (amount_asset * rate_ngn).quantize(Decimal("0.01"))
        logger.info(f"[SELL ORDER] User {request.user.id} selling {amount_asset} {asset.symbol} at rate ₦{rate_ngn} = ₦{amount_ngn}")
        
        
        # --- Create sell order ---
        try:
            with transaction.atomic():
                order = AssetSellOrder.objects.create(
                    user=request.user,
                    asset=asset,
                    source=exchange_key,
                    amount_asset=amount_asset,
                    rate_ngn=rate_ngn,
                    amount_ngn=amount_ngn,
                    status="pending",
                    details={"exchange_contact": exchange_details},
                )

            expires_in = 30 * 60  # 30 min

            serializer = AssetSellOrderSerializer(order)
            resp = {
                "success": True,
                "order": serializer.data,
                "exchange_details": exchange_details,
                "expires_in": expires_in,
            }
            return Response(resp, status=drf_status.HTTP_201_CREATED)
        except Exception as e:
            logger.exception("Error creating sell order: %s", e)
            return Response(
                {"success": False, "message": "Could not create sell order"},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )


class UploadPaymentProofAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)

        # allow upload only while order is pending
        if order.status not in ["pending"]:
            return Response({"error": "Order cannot accept proof in current status."}, status=drf_status.HTTP_400_BAD_REQUEST)

        # validate file existence
        file = request.FILES.get("payment_proof") or request.data.get("payment_proof")
        if not file:
            return Response({"payment_proof": ["Please upload payment proof"]}, status=drf_status.HTTP_400_BAD_REQUEST)

        # validate size <= 5MB
        max_size = 5 * 1024 * 1024
        if hasattr(file, "size") and file.size > max_size:
            return Response({"payment_proof": ["Image size should not exceed 5MB."]}, status=drf_status.HTTP_400_BAD_REQUEST)

        try:
            # create or update proof (OneToOne relationship in your model)
            PaymentProof.objects.update_or_create(order=order, defaults={"image": file})
            order.status = "awaiting_admin"
            order.save(update_fields=["status"])
            return Response({"success": True, "message": "Proof uploaded successfully"}, status=drf_status.HTTP_200_OK)
        except Exception as e:
            logger.exception("Error uploading proof: %s", e)
            return Response({"error": "Failed to upload proof"}, status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)
        
class SellOrderUpdateAPI(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, order_id):
        """
        Allow user to update fields (asset, source, amount_asset)
        before submitting proof.
        """
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)

        if order.status != "pending_payment":
            return Response(
                {"error": "Order cannot be updated after proof submission."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AssetSellOrderSerializer(order, data=request.data, partial=True)
        if serializer.is_valid():
            with transaction.atomic():
                order = serializer.save()

                # 🔹 Recalculate NGN values if amount_asset changed
                if "amount_asset" in serializer.validated_data or "asset" in serializer.validated_data:
                    from bills.models import ExchangeRate
                    rate_obj = get_object_or_404(ExchangeRate, asset=order.asset)
                    order.rate_ngn = rate_obj.rate_ngn
                    order.amount_ngn = order.amount_asset * rate_obj.rate_ngn
                    order.save(update_fields=["rate_ngn", "amount_ngn"])

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
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)
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
            return Response(
                {"success": False, "message": "Invalid status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create notification
        def create_notification(message):
            Notification.objects.create(
                user=order.user,
                message=message,
                is_read=False
            )

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
                    create_notification(f"Sell order {order.order_id} approved and wallet credited.")
                return Response(
                    {"success": True, "message": "Order approved and wallet credited"},
                    status=status.HTTP_200_OK,
                )
            except Exception as e:
                logger.error(f"Failed to credit wallet for order {order.order_id}: {e}", exc_info=True)
                return Response(
                    {"success": False, "message": "Error crediting wallet"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        # ✅ Handle cancel
        elif new_status == "cancelled" and order.status in ["pending_payment", "proof_submitted"]:
            order.status = "cancelled"
            order.save(update_fields=["status", "updated_at"])
            return Response(
                {"success": True, "message": "Order cancelled"},
                status=status.HTTP_200_OK,
            )

        # ✅ Handle reverse (undo credit)
        elif new_status == "reversed" and order.status == "completed":
            try:
                with transaction.atomic():
                    wallet = Wallet.objects.select_for_update().get(user=order.user)

                    if wallet.balance < order.amount_ngn:
                        return Response(
                            {"success": False, "message": "Insufficient wallet balance to reverse"},
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
            except Exception as e:
                logger.error(f"Failed to reverse wallet for order {order.order_id}: {e}", exc_info=True)
                return Response(
                    {"success": False, "message": "Error reversing wallet"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            return Response(
                {"success": True, "message": "Order reversed and funds debited"},
                status=status.HTTP_200_OK,
            )

        return Response(
            {"success": False, "message": "Invalid transition for this order"},
            status=status.HTTP_400_BAD_REQUEST,
        )

