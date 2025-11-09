import logging

from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Case, When, F, Value
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated, BasePermission
from django.contrib.auth.models import AnonymousUser

from .models import Deposit_P2P_Offer, Withdraw_P2P_Offer, DepositOrder, WithdrawOrder, Wallet
from .serializers import (
    DepositOfferSerializer, CreateDepositOfferSerializer, DepositOrderSerializer, 
    WithdrawOfferSerializer, CreateWithdrawOfferSerializer, WithdrawOrderSerializer,
)

logger = logging.getLogger(__name__)

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10  # Number of offers per page
    page_size_query_param = 'page_size'
    max_page_size = 100

# Custom permission class for merchant-only actions
class IsMerchant(BasePermission):
    def has_permission(self, request, view):
        # Allow GET (list) for all authenticated users, POST (create) only for merchants
        if request.method == "GET":
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_authenticated and request.user.is_merchant

class DepositOfferListCreateAPIView(generics.ListCreateAPIView):
    """List all available offers or create a new one (merchant only for creation)."""
    queryset = (
        Deposit_P2P_Offer.objects.filter(is_available=True)
        .select_related("merchant", "merchant__profile")
        .order_by("-created_at")
    )
    permission_classes = [IsAuthenticated, IsMerchant]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        return (
            CreateDepositOfferSerializer
            if self.request.method == "POST"
            else DepositOfferSerializer
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        sort_by = self.request.query_params.get("sort_by")
        min_success_rate = self.request.query_params.get("min_success_rate")
        min_trades = self.request.query_params.get("min_trades")

        if min_success_rate:
            try:
                min_success_rate = float(min_success_rate)
                queryset = queryset.filter(merchant__profile__successful_trades__gte=1)
                queryset = queryset.annotate(
                    success_rate=Case(
                        When(merchant__profile__total_trades__gt=0,
                             then=F('merchant__profile__successful_trades') * 100.0 / F('merchant__profile__total_trades')),
                        default=Value(0.0)
                    )
                ).filter(success_rate__gte=min_success_rate)
            except ValueError:
                pass
        if min_trades:
            try:
                min_trades = int(min_trades)
                queryset = queryset.filter(merchant__profile__total_trades__gte=min_trades)
            except ValueError:
                pass

        if sort_by == "success_rate":
            queryset = queryset.annotate(
                success_rate=Case(
                    When(merchant__profile__total_trades__gt=0,
                         then=F('merchant__profile__successful_trades') * 100.0 / F('merchant__profile__total_trades')),
                    default=Value(0.0)
                )
            ).order_by("-success_rate")
        elif sort_by == "total_trades":
            queryset = queryset.order_by("-merchant__profile__total_trades")

        return queryset

    def perform_create(self, serializer):
        merchant = self.request.user
        amount_available = Decimal(str(serializer.validated_data["amount_available"]))
        min_amount = Decimal(str(serializer.validated_data["min_amount"]))
        max_amount = Decimal(str(serializer.validated_data["max_amount"]))

        # Everything that touches the DB and needs locking must be inside atomic()
        with transaction.atomic():
            # Now safe: select_for_update inside transaction
            wallet = Wallet.objects.select_for_update().get(user=merchant)

            available_balance = wallet.available_balance()
            if amount_available > available_balance:
                logger.error(f"Insufficient balance for offer: merchant {merchant.id}, required={amount_available}, available={available_balance}")
                raise serializers.ValidationError({"error": "Insufficient available balance to lock this offer amount."})
            if max_amount > available_balance:
                logger.error(f"Max amount exceeds balance: merchant {merchant.id}, max_amount={max_amount}, available={available_balance}")
                raise serializers.ValidationError({"error": "Max amount exceeds available balance."})
            if min_amount > max_amount or min_amount > amount_available:
                logger.error(f"Invalid min/max amounts: min_amount={min_amount}, max_amount={max_amount}, amount_available={amount_available}")
                raise serializers.ValidationError({"error": "Min amount must be less than or equal to max amount and amount available."})

            if not wallet.lock_funds(amount_available):
                logger.error(f"Failed to lock funds for merchant {merchant.id}: amount={amount_available}")
                raise serializers.ValidationError({"error": "Unable to lock funds. Please try again."})

            # Save the offer inside the same transaction
            serializer.save(merchant=merchant)
            logger.info(f"Offer created by merchant {merchant.id}: amount_available={amount_available}")

class CreateDepositOrderAPIView(APIView):
    """Buyer creates a P2P deposit order."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, offer_id):
        user = request.user
        sell_offer = get_object_or_404(Deposit_P2P_Offer, id=offer_id, is_available=True)

        if sell_offer.merchant == user:
            return Response(
                {"error": "You cannot place an order on your own offer."},
                status=400
            )

        try:
            amount = Decimal(str(request.data.get("amount_requested", "0")))
        except (InvalidOperation, TypeError):
            return Response({"error": "Invalid amount format"}, status=400)

        if amount <= 0:
            return Response({"error": "Amount must be greater than zero"}, status=400)

        if amount < sell_offer.min_amount or amount > sell_offer.max_amount:
            return Response(
                {
                    "error": f"Amount must be between ₦{sell_offer.min_amount} and ₦{sell_offer.max_amount}"
                },
                status=400,
            )

        with transaction.atomic():
            sell_offer = Deposit_P2P_Offer.objects.select_for_update().get(id=sell_offer.id)
            if sell_offer.amount_available < amount:
                return Response({"error": "Offer does not have enough available balance"}, status=400)

            sell_offer.amount_available -= amount
            if sell_offer.amount_available <= 0:
                sell_offer.is_available = False
            sell_offer.save(update_fields=["amount_available", "is_available"])

            order = DepositOrder.objects.create(
                buyer=user,
                sell_offer=sell_offer,
                amount_requested=amount,
                status="pending",
            )

        serializer = DepositOrderSerializer(order)
        return Response(
            {"success": True, "order_id": order.id, "order": serializer.data},
            status=201,
        )

class DepositOrderDetailAPIView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DepositOrderSerializer

    def get_object(self):
        order = get_object_or_404(DepositOrder, id=self.kwargs["id"])
        if order.buyer != self.request.user and order.sell_offer.merchant != self.request.user:
            raise PermissionDenied("You do not have permission to view this order.")
        return order

class MarkDepositOrderPaidAPIView(APIView):
    """Buyer marks order as paid & awaits merchant confirmation."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(DepositOrder, id=order_id)
        buyer = request.user

        if order.buyer != buyer:
            return Response({"error": "Not authorized"}, status=403)

        if order.status != "pending":
            return Response({"error": "Only pending orders can be marked as paid"}, status=400)

        order.status = "paid"
        order.save(update_fields=["status"])
        return Response({"success": True, "status": order.status, "order_id": order.id})

class MyDepositOrdersAPIView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DepositOrderSerializer

    def get_queryset(self):
        queryset = (
            DepositOrder.objects.filter(buyer=self.request.user)
            .select_related("sell_offer", "sell_offer__merchant")
            .order_by("-created_at")
        )
        order_id = self.request.query_params.get("order_id")
        if order_id:
            return queryset.filter(id=order_id)
        return queryset

class MerchantDepositOrdersAPIView(generics.ListAPIView):
    """Merchant sees all orders placed on their offers."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DepositOrderSerializer

    def get_queryset(self):
        return (
            DepositOrder.objects.filter(sell_offer__merchant=self.request.user)
            .select_related("sell_offer", "buyer")
            .order_by("-created_at")
        )

class ConfirmDepositOrderAPIView(APIView):
    """Merchant confirms buyer’s payment → funds are released from merchant's locked balance to buyer’s wallet."""
    permission_classes = [IsAuthenticated]

    def post(self, request, order_id):
        try:
            order = get_object_or_404(DepositOrder, id=order_id)
            merchant = request.user

            # Validate access
            if order.sell_offer.merchant != merchant:
                logger.warning(f"Unauthorized attempt to confirm order {order_id} by user {merchant.id}")
                return Response({"error": "You are not authorized to confirm this order."}, status=status.HTTP_403_FORBIDDEN)

            if order.status != "paid":
                logger.warning(f"Invalid order status for confirmation: order {order_id}, status {order.status}")
                return Response({"error": "Only paid orders can be confirmed."}, status=status.HTTP_400_BAD_REQUEST)

            # Validate wallets
            if not hasattr(order.buyer, 'wallet') or not hasattr(merchant, 'wallet'):
                logger.error(f"Wallet missing for buyer {order.buyer.id} or merchant {merchant.id} in order {order_id}")
                return Response({"error": "Wallet not found for user or merchant"}, status=status.HTTP_400_BAD_REQUEST)

            buyer_wallet = get_object_or_404(Wallet, user=order.buyer)
            merchant_wallet = get_object_or_404(Wallet, user=merchant)

            with transaction.atomic():
                amount = Decimal(str(order.amount_requested))  # Ensure Decimal
                if amount <= 0:
                    logger.error(f"Invalid amount for order {order_id}: {amount}")
                    return Response({"error": "Invalid order amount"}, status=status.HTTP_400_BAD_REQUEST)

                logger.debug(f"Confirming order {order_id}: amount={amount}, merchant_wallet_locked_balance={merchant_wallet.locked_balance}, buyer_id={order.buyer.id}")

                # Check and release merchant's locked funds
                if not merchant_wallet.release_funds(amount):
                    logger.error(f"Insufficient locked funds for merchant {merchant.id}: required={amount}, available={merchant_wallet.locked_balance}")
                    return Response({"error": f"Insufficient locked funds to release. Required: ₦{amount}, Available: ₦{merchant_wallet.locked_balance}"}, status=status.HTTP_400_BAD_REQUEST)

                # Credit buyer's wallet
                credited = buyer_wallet.deposit(
                    amount,
                    reference=f"p2p-deposit-{order.id}",
                    metadata={
                        "type": "p2p_deposit",
                        "merchant_id": merchant.id,
                        "offer_id": order.sell_offer.id,
                        "order_id": order.id,
                    },
                )

                if not credited:
                    logger.error(f"Failed to credit buyer wallet {order.buyer.id} for order {order_id}")
                    merchant_wallet.lock_funds(amount)  # Rollback
                    return Response({"error": "Failed to credit buyer wallet."}, status=status.HTTP_400_BAD_REQUEST)

                # Update order status
                order.status = "completed"
                order.save(update_fields=["status"])

                # Update merchant trade stats
                merchant_profile = merchant.profile
                merchant_profile.total_trades += 1
                merchant_profile.successful_trades += 1
                merchant_profile.save(update_fields=["total_trades", "successful_trades"])

            logger.info(f"Order {order_id} confirmed successfully: buyer {order.buyer.id}, merchant {merchant.id}")
            return Response({
                "success": True,
                "message": "Funds released successfully. Buyer wallet credited, merchant locked funds deducted.",
                "order_id": order.id,
                "status": order.status,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Unexpected error in ConfirmDepositOrderAPIView for order {order_id}: {str(e)}", exc_info=True)
            return Response({"error": "Internal server error, please try again later"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CancelDepositOrderAPIView(APIView):
    """Buyer or merchant can cancel pending order."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(DepositOrder, id=order_id)
        user = request.user

        if order.status != "pending":
            return Response({"error": "Only pending orders can be cancelled"}, status=400)

        if user != order.buyer and user != order.sell_offer.merchant:
            return Response({"error": "Not authorized"}, status=403)

        with transaction.atomic():
            amount = Decimal(order.amount_requested)

            # Refund locked funds to merchant's balance
            merchant_wallet = Wallet.objects.select_for_update().get(user=order.sell_offer.merchant)
            if not merchant_wallet.refund_funds(amount):  # Moves from locked_balance to balance
                return Response({"error": "Failed to refund locked funds."}, status=500)

            order.status = "cancelled"
            order.save(update_fields=["status"])
            order.sell_offer.amount_available += amount
            order.sell_offer.is_available = True
            order.sell_offer.save()

        return Response({"success": True, "status": order.status, "order_id": order.id})




class WithdrawOfferListCreateAPIView(generics.ListCreateAPIView):
    """List all available withdraw offers or create a new one (merchant only for creation)."""
    queryset = (
        Withdraw_P2P_Offer.objects.filter(is_active=True)
        .select_related("merchant", "merchant__profile")
        .order_by("-created_at")
    )
    permission_classes = [IsAuthenticated, IsMerchant]
    pagination_class = StandardResultsSetPagination

    def get_serializer_class(self):
        return CreateWithdrawOfferSerializer if self.request.method == "POST" else WithdrawOfferSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        sort_by = self.request.query_params.get("sort_by")
        min_success_rate = self.request.query_params.get("min_success_rate")
        min_trades = self.request.query_params.get("min_trades")

        if min_success_rate:
            try:
                min_success_rate = float(min_success_rate)
                queryset = queryset.filter(merchant__profile__successful_trades__gte=1)
                queryset = queryset.annotate(
                    success_rate=Case(
                        When(merchant__profile__total_trades__gt=0,
                             then=F('merchant__profile__successful_trades') * 100.0 / F('merchant__profile__total_trades')),
                        default=Value(0.0)
                    )
                ).filter(success_rate__gte=min_success_rate)
            except ValueError:
                pass
        if min_trades:
            try:
                min_trades = int(min_trades)
                queryset = queryset.filter(merchant__profile__total_trades__gte=min_trades)
            except ValueError:
                pass

        if sort_by == "success_rate":
            queryset = queryset.annotate(
                success_rate=Case(
                    When(merchant__profile__total_trades__gt=0,
                         then=F('merchant__profile__successful_trades') * 100.0 / F('merchant__profile__total_trades')),
                    default=Value(0.0)
                )
            ).order_by("-success_rate")
        elif sort_by == "total_trades":
            queryset = queryset.order_by("-merchant__profile__total_trades")

        return queryset

    def perform_create(self, serializer):
        merchant = self.request.user
        # No fund locking for withdraw offers
        serializer.save(merchant=merchant)

class CreateWithdrawOrderAPIView(APIView):
    """Seller creates a P2P withdraw order."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, offer_id):
        user = request.user
        buy_offer = get_object_or_404(Withdraw_P2P_Offer, id=offer_id, is_active=True)

        if buy_offer.merchant == user:
            return Response(
                {"error": "You cannot place an order on your own offer."},
                status=400
            )

        try:
            amount = Decimal(str(request.data.get("amount_requested", "0")))
        except (InvalidOperation, TypeError):
            return Response({"error": "Invalid amount format"}, status=400)

        if amount <= 0:
            return Response({"error": "Amount must be greater than zero"}, status=400)

        if amount < buy_offer.min_amount or amount > buy_offer.max_amount:
            return Response(
                {
                    "error": f"Amount must be between {buy_offer.min_amount} and {buy_offer.max_amount}"
                },
                status=400,
            )

        with transaction.atomic():
            buy_offer = Withdraw_P2P_Offer.objects.select_for_update().get(id=buy_offer.id)
            if buy_offer.amount_available < amount:
                return Response({"error": "Offer does not have enough available balance"}, status=400)

            buy_offer.amount_available -= amount
            if buy_offer.amount_available <= 0:
                buy_offer.is_active = False
            buy_offer.save(update_fields=["amount_available", "is_active"])

            order = WithdrawOrder.objects.create(
                buyer_offer=buy_offer,
                seller=user,
                amount_requested=amount,
                status="pending",
            )

        serializer = WithdrawOrderSerializer(order)
        return Response(
            {"success": True, "order_id": order.id, "order": serializer.data},
            status=201,
        )

class WithdrawOrderDetailAPIView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WithdrawOrderSerializer

    def get_object(self):
        order = get_object_or_404(WithdrawOrder, id=self.kwargs["id"])
        user = self.request.user
        if isinstance(user, AnonymousUser) or (order.seller.id != user.id and order.buyer_offer.merchant.id != user.id):
            raise PermissionDenied("You do not have permission to view this order.")
        return order

class MarkWithdrawOrderPaidAPIView(APIView):
    """Merchant marks order as paid (initiates bank transfer) & awaits user confirmation."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(WithdrawOrder, id=order_id)
        merchant = request.user

        if order.buyer_offer.merchant != merchant:
            return Response({"error": "Not authorized"}, status=403)

        if order.status != "pending":
            return Response({"error": "Only pending orders can be marked as paid"}, status=400)

        order.status = "paid"
        order.save(update_fields=["status"])
        return Response({"success": True, "status": order.status, "order_id": order.id})

class ConfirmWithdrawOrderAPIView(APIView):
    """User confirms merchant’s payment → funds are released from user's locked balance to merchant’s wallet."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(WithdrawOrder, id=order_id)
        user = request.user

        if order.seller != user:
            return Response({"error": "You are not authorized to confirm this order."}, status=403)

        if order.status not in ["paid"]:
            return Response({"error": "Only paid orders can be confirmed."}, status=400)

        with transaction.atomic():
            amount = Decimal(order.amount_requested)
            seller_wallet = Wallet.objects.select_for_update().get(user=order.seller)
            merchant_wallet = Wallet.objects.select_for_update().get(user=order.buyer_offer.merchant)

            if not seller_wallet.release_funds(amount):  # Release escrow
                return Response({"error": "Insufficient locked funds for user."}, status=500)

            credited = merchant_wallet.deposit(
                amount,
                reference=f"p2p-withdraw-{order.id}",
                metadata={
                    "type": "p2p_withdraw",
                    "user_id": user.id,
                    "offer_id": order.buyer_offer.id,
                    "order_id": order.id,
                },
            )

            if not credited:
                seller_wallet.lock_funds(amount)  # Rollback
                return Response({"error": "Failed to credit merchant wallet."}, status=500)

            order.status = "completed"
            order.save(update_fields=["status"])

            # Update merchant trade stats (as buyer)
            merchant_profile = order.buyer_offer.merchant.profile
            merchant_profile.total_trades += 1
            merchant_profile.successful_trades += 1
            merchant_profile.save(update_fields=["total_trades", "successful_trades"])

        return Response({
            "success": True,
            "message": "Funds released successfully. Merchant wallet credited, user locked funds deducted.",
            "order_id": order.id,
            "status": order.status,
        }, status=200)

class CancelWithdrawOrderAPIView(APIView):
    """User or merchant can cancel pending order."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, order_id):
        order = get_object_or_404(WithdrawOrder, id=order_id)
        user = request.user

        if order.status != "pending":
            return Response({"error": "Only pending orders can be cancelled"}, status=400)

        if user != order.seller and user != order.buyer_offer.merchant:
            return Response({"error": "Not authorized"}, status=403)

        with transaction.atomic():
            amount = Decimal(order.amount_requested)
            seller_wallet = Wallet.objects.select_for_update().get(user=order.seller)
            if not seller_wallet.release_funds(amount):  # Refund escrow
                return Response({"error": "Failed to refund locked funds."}, status=500)

            order.status = "cancelled"
            order.save(update_fields=["status"])
            order.buyer_offer.amount_available += amount
            order.buyer_offer.is_active = True
            order.buyer_offer.save()

        return Response({"success": True, "status": order.status, "order_id": order.id})

class MyWithdrawOrdersAPIView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WithdrawOrderSerializer

    def get_queryset(self):
        return (
            WithdrawOrder.objects.filter(seller=self.request.user)
            .select_related("buyer_offer", "buyer_offer__merchant")
            .order_by("-created_at")
        )

class MerchantWithdrawOrdersAPIView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WithdrawOrderSerializer

    def get_queryset(self):
        return (
            WithdrawOrder.objects.filter(buyer_offer__merchant=self.request.user)
            .select_related("buyer_offer", "seller")
            .order_by("-created_at")
        )