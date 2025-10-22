# gasfee/api_views.py
import uuid
import logging
import requests

from decimal import Decimal
from django.db import transaction
from django.core.cache import cache
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser

from wallet.models import Wallet, WalletTransaction

from .services import lookup_rate, get_receiving_details
from .utils import get_crypto_price, get_exchange_rate, send_bsc, send_evm
from .near_utils import send_near
from .sol_utils import send_solana
from .ton_utils import send_ton
from .models import (
    Crypto, CryptoPurchase, AssetSellOrder, ExchangeInfo,  ExchangeRate, PaymentProof
)
from .serializers import (
    AssetSellOrderSerializer, PaymentProofSerializer, ExchangeInfoSerializer, 
    ExchangeRateSerializer,
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
    permission_classes = [permissions.IsAuthenticated]

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

        # ✅ Pricing
        exchange_rate = cache.get("exchange_rate_usd_ngn") or get_exchange_rate()
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
                    request_id=req_id,   # ✅ NEW
                    status="pending",
                )

                # 🔹 Create WalletTransaction (pending)
                tx = WalletTransaction.objects.create(
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

            # 🔹 On-chain send
            sender = SENDERS.get(crypto.symbol.upper())
            if not sender:
                order.status = "failed"
                order.save()
                tx.status = "failed"
                tx.save()
                return Response({"success": False, "error": "Unsupported token"}, status=400)

            if crypto.symbol.upper() == "NEAR":
                result = sender(wallet_address, float(crypto_received))
            else:
                result = sender(wallet_address, float(crypto_received), order.id)

            tx_hash = result if isinstance(result, str) else result[0]

            # ✅ Mark both as success
            order.tx_hash = tx_hash
            order.status = "completed"
            order.save(update_fields=["tx_hash", "status"])

            tx.status = "success"
            tx.reference = tx_hash
            tx.save(update_fields=["status", "reference"])

            return Response(
                {
                    "success": True,
                    "crypto": crypto.symbol,
                    "crypto_amount": str(crypto_received),
                    "total_ngn": str(total_ngn),
                    "wallet_address": wallet_address,
                    "tx_hash": tx_hash,
                },
                status=200,
            )

        except Exception as e:
            err_str = str(e)
            if "InsufficientFunds" in err_str:
                msg = "Insufficient funds. Please top up your wallet."
            elif "InvalidAddress" in err_str:
                msg = "The wallet address appears invalid. Please check and try again."
            elif "network" in err_str.lower():
                msg = "Network issue — please retry in a few seconds."
            else:
                msg = "Transaction failed. Please try again later."

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

class ExchangeInfoAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        exchange = request.query_params.get("exchange")
        if not exchange:
            return Response({"error": "Exchange parameter is required"}, status=400)
        
        try:
            exchange_info = ExchangeInfo.objects.get(exchange=exchange)
            serializer = ExchangeInfoSerializer(exchange_info)
            return Response({"exchanges": [serializer.data]}, status=200)
        except ExchangeInfo.DoesNotExist:
            return Response({"error": "Exchange not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=500)
            
class ExchangeListAPI(APIView):
    permission_classes = [AllowAny]  # users don’t need to log in just to see exchange list

    def get(self, request):
        exchanges = ExchangeInfo.objects.all()
        serializer = ExchangeInfoSerializer(exchanges, many=True)
        return Response({"exchanges": serializer.data}, status=status.HTTP_200_OK)

class ExchangeRateAPI(APIView):
    permission_classes = [AllowAny]

    def get(self, request, asset):
        try:
            rate = get_object_or_404(ExchangeRate, asset=asset.lower())
            serializer = ExchangeRateSerializer(rate)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except:
            return Response({"error": "Rate not found"}, status=status.HTTP_404_NOT_FOUND)

class StartSellOrderAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = {
            "asset": request.data.get("asset"),
            "source": request.data.get("source"),
            "amount_asset": request.data.get("amount_asset"),
        }
        serializer = AssetSellOrderSerializer(data=data)
        if serializer.is_valid():
            try:
                with transaction.atomic():
                    amount_asset = Decimal(serializer.validated_data["amount_asset"])

                    # 🔹 fetch live rate
                    rate_obj = get_object_or_404(ExchangeRate, asset=serializer.validated_data["asset"])
                    rate_ngn = rate_obj.rate_ngn
                    amount_ngn = amount_asset * rate_ngn

                    order = serializer.save(
                        user=request.user,
                        rate_ngn=rate_ngn,
                        amount_ngn=amount_ngn,
                        status="pending_payment",
                    )

                return Response(
                    {"success": True, "order": AssetSellOrderSerializer(order).data},
                    status=status.HTTP_201_CREATED,
                )
            except Exception as e:
                logger.error(f"Error creating sell order: {e}", exc_info=True)
                return Response(
                    {"success": False, "message": "Could not create sell order"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class UploadPaymentProofAPI(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        """
        Step 2: Upload payment proof for an existing order.
        """
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)  # ✅ use order_id
        serializer = PaymentProofSerializer(data=request.data)
        if serializer.is_valid():
            PaymentProof.objects.create(
                order=order,
                image=serializer.validated_data["payment_proof"],
            )
            order.status = "proof_submitted"
            order.save(update_fields=["status"])
            return Response(
                {"success": True, "message": "Proof uploaded successfully"},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PendingSellOrdersAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Return user's incomplete sell orders so frontend can let the user resume.
        """
        orders = AssetSellOrder.objects.filter(
            user=request.user,
            status__in=["pending_payment", "proof_submitted"]
        ).order_by("-created_at")
        serializer = AssetSellOrderSerializer(orders, many=True)
        return Response({"orders": serializer.data}, status=status.HTTP_200_OK)
        
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

class SellOrderStatusAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, order_id):
        """
        Step 3: Get full status of a sell order.
        """
        order = get_object_or_404(AssetSellOrder, order_id=order_id, user=request.user)  # ✅ use order_id
        return Response(
            {"success": True, "order": AssetSellOrderSerializer(order).data},
            status=status.HTTP_200_OK,
        )

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
        """Admin approves, cancels, or reverses a sell order."""
        order = get_object_or_404(AssetSellOrder, order_id=order_id)
        new_status = request.data.get("status")

        if new_status not in ["completed", "cancelled", "reversed"]:
            return Response(
                {"success": False, "message": "Invalid status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ Handle approve
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
            except Exception as e:
                logger.error(f"Failed to credit wallet for order {order.order_id}: {e}", exc_info=True)
                return Response(
                    {"success": False, "message": "Error crediting wallet"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(
                {"success": True, "message": "Order approved and wallet credited"},
                status=status.HTTP_200_OK,
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

