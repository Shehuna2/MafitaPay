# wallet/views.py
import logging
import re
import requests
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status as drf_status, generics, permissions
from rest_framework.pagination import PageNumberPagination
from rest_framework import status

from .models import CardDeposit
import paystack
from paystack import DedicatedVirtualAccount
from .models import Wallet, WalletTransaction, Notification, VirtualAccount, Deposit, CardDepositExchangeRate, CardDeposit
from .serializers import (
    WalletTransactionSerializer, WalletSerializer, NotificationSerializer, 
    CardDepositExchangeRateSerializer, CardDepositSerializer, CardDepositInitiateSerializer
)
from .utils import extract_bank_name, extract_account_name
from .services.flutterwave_service import FlutterwaveService
from .services.palmpay_service import PalmpayService
from .permissions import IsMerchantOrSuperUser
from .card_deposit_config import (
    get_supported_card_currencies,
    get_allowed_providers_for_currency,
    is_provider_allowed_for_currency,
)


from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.timezone import make_aware
from datetime import datetime
import hmac
import hashlib
import json
import uuid as uuid_lib

User = get_user_model()
logger = logging.getLogger(__name__)

# Set Paystack API key
paystack.api_key = settings.PAYSTACK_SECRET_KEY

# Constants
SUPPORTED_CARD_CURRENCIES = get_supported_card_currencies()

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

class WalletView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        try:
            wallet = Wallet.objects.get(user=request.user)
            wallet.refresh_from_db()
            serializer = WalletSerializer(wallet, context={"request": request})
            return Response(serializer.data)
        except Wallet.DoesNotExist:
            return Response({
                "balance": 0,
                "locked_balance": 0,
                "van_account_number": None,
                "van_bank_name": None,
                "van_provider": None,
            })


class GenerateDVAAPIView(APIView):
    """Generate a Dedicated Virtual Account (DVA)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        provider = request.data.get("provider", "paystack").lower()

        logger.info(f"[DVA] Incoming request → provider={provider}, user={user.email}")
        logger.info(f"[DVA] Request body: {request.data}")

        try:
            # ----------------------------------------------------------
            # 1. 9PSB FLOW  (unchanged)
            # ----------------------------------------------------------
            if provider == "9psb":
                return self.generate_9psb_va(user)

            # ----------------------------------------------------------
            # 2. FLUTTERWAVE FLOW (FULLY PATCHED)
            # ----------------------------------------------------------
            elif provider == "flutterwave":
                return self.generate_flutterwave_va(request, user)

            # ----------------------------------------------------------
            # 3. PALMPAY FLOW
            # ----------------------------------------------------------
            elif provider == "palmpay":
                return self.generate_palmpay_va(request, user)

            # ----------------------------------------------------------
            # 4. PAYSTACK FLOW (unchanged)
            # ----------------------------------------------------------
            return self.generate_paystack_va(request, user)

        except Exception as e:
            logger.error(f"❌ Error generating DVA for {user.email}: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to generate virtual account: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ==========================================================================
    # 9PSB
    # ==========================================================================
    def handle_9psb(self, request, user):
        from .services.psb_service import NinePSBService

        logger.info(f"[DVA-9PSB] Processing for {user.email}")
        psb = NinePSBService()

        existing_va = VirtualAccount.objects.filter(
            user=user, provider="9psb", assigned=True
        ).first()

        if existing_va:
            logger.info("[DVA-9PSB] Existing VA found — returning existing account")
            return Response({
                "success": True,
                "message": "9PSB virtual account already exists.",
                "account_number": existing_va.account_number,
                "bank_name": existing_va.bank_name,
                "account_name": existing_va.account_name,
            }, status=status.HTTP_200_OK)

        response = psb.create_virtual_account(user)
        if not response:
            logger.warning("[DVA-9PSB] 9PSB API returned no response")
            return Response(
                {"success": False, "error": "Failed to generate 9PSB virtual account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        va = VirtualAccount.objects.create(
            user=user,
            provider="9psb",
            provider_account_id=response.get("provider_id"),
            account_number=response.get("account_number"),
            bank_name=response.get("bank_name"),
            account_name=response.get("account_name"),
            metadata={"raw_response": response},
            assigned=True,
        )

        wallet, _ = Wallet.objects.get_or_create(user=user)
        wallet.van_account_number = va.account_number
        wallet.van_bank_name = va.bank_name
        wallet.van_provider = "9psb"
        wallet.save()

        return Response({
            "success": True,
            "message": "9PSB virtual account generated successfully.",
            "account_number": va.account_number,
            "bank_name": va.bank_name,
            "account_name": va.account_name,
        }, status=status.HTTP_201_CREATED)

    # ================================================================
    # 🔥 PATCHED: FLUTTERWAVE STATIC DVA FLOW (STATIC)
    # ================================================================
    def generate_flutterwave_va(self, request, user):
        logger.info("[DVA-FW] Start: Flutterwave Static VA")

        wallet, _ = Wallet.objects.get_or_create(user=user)

        # 1. If already exists → return
        existing_va = VirtualAccount.objects.filter(
            user=user, provider="flutterwave", assigned=True
        ).first()

        if existing_va:
            return Response({
                "success": True,
                "message": "Flutterwave virtual account already exists.",
                "account_number": existing_va.account_number,
                "bank_name": existing_va.bank_name,
                "account_name": existing_va.account_name,
                "type": existing_va.metadata.get("type", "static"),
            })

        # 2. Validate input
        bvn_or_nin = request.data.get("bvn_or_nin")
        preferred_bank = request.data.get("bank", "044")  # Default Sterling

        if not bvn_or_nin:
            return Response({
                "error": "BVN or NIN is required for Flutterwave static VA."
            }, status=400)

        # SECURITY: Validate BVN/NIN format (BVN=11 digits, NIN=12 digits)
        clean_id = re.sub(r"\D", "", str(bvn_or_nin))
        if len(clean_id) not in (11, 12):
            return Response({
                "error": "Invalid BVN/NIN format. Must be 11 digits (BVN) or 12 digits (NIN)."
            }, status=400)

        # 3. Call Flutterwave
        fw = FlutterwaveService(use_live=not settings.DEBUG)

        fw_response = fw.create_static_virtual_account(
            user=user,
            preferred_bank=preferred_bank,
            bvn_or_nin=bvn_or_nin
        )

        if not fw_response or fw_response.get("error"):
            return Response({
                "error": fw_response.get("error", "Failed to create VA")
            }, status=400)

        account_number = fw_response["account_number"]
        
        # Extract bank_name and account_name from multiple possible nested paths
        bank_name = extract_bank_name(fw_response, default="Unknown Bank")
        account_name = extract_account_name(fw_response, default="Virtual Account")
        
        # Extract provider reference (simple case, no deep nesting needed for this field)
        provider_ref = fw_response.get("provider_reference") or fw_response.get("reference")

        # 4. SECURITY CHECK
        conflict = VirtualAccount.objects.filter(
            provider="flutterwave",
            account_number=account_number
        ).exclude(user=user).first()

        if conflict:
            return Response({
                "error": (
                    "This BVN/NIN or email is already linked to another virtual account."
                )
            }, status=400)

        # 5. Save database records
        try:
            with transaction.atomic():
                va = VirtualAccount.objects.create(
                    user=user,
                    provider="flutterwave",
                    provider_account_id=provider_ref,
                    account_number=account_number,
                    account_name=account_name,
                    bank_name=bank_name,
                    metadata={
                        "raw_response": fw_response,
                        "type": fw_response.get("type", "static"),
                    },
                    assigned=True
                )

                wallet.van_account_number = account_number
                wallet.van_bank_name = bank_name
                wallet.van_account_name = account_name
                wallet.van_provider = "flutterwave"
                wallet.save()

        except Exception as e:
            logger.error("DB error saving FW VA: %s", e, exc_info=True)
            return Response({
                "error": "Failed to save virtual account details."
            }, status=500)

        return Response({
            "success": True,
            "message": "Flutterwave virtual account generated successfully.",
            "account_number": account_number,
            "bank_name": bank_name,
            "account_name": account_name,
            "type": fw_response.get("type", "static")
        }, status=201)

    # ================================================================
    # Palmpay
    # ================================================================
    def generate_palmpay_va(self, request, user):
        logger.info("[DVA-PALMPAY] Start: PalmPay Virtual Account")

        wallet, _ = Wallet.objects.get_or_create(user=user)

        existing_va = VirtualAccount.objects.filter(
            user=user, provider="palmpay", assigned=True
        ).first()

        if existing_va:
            return Response({
                "success": True,
                "message": "PalmPay virtual account already exists.",
                "account_number": existing_va.account_number,
                "bank_name": existing_va.bank_name,
                "account_name": existing_va.account_name,
                "type": existing_va.metadata.get("type", "static"),
            })

        bvn = request.data.get("bvn")

        if bvn:
            clean_bvn = re.sub(r"\D", "", str(bvn))
            if len(clean_bvn) != 11:
                return Response(
                    {"error": "Invalid BVN format. Must be 11 digits."},
                    status=400,
                )
            bvn = clean_bvn

        palmpay = PalmpayService(use_live=settings.PAYMENTS_LIVE)

        try:
            # ─── IMPORTANT CHANGE ────────────────────────────────
            # Do NOT pass phone_number anymore
            palmpay_response = palmpay.create_virtual_account(
                user=user,
                bvn=bvn,              # only bvn, no phone_number
            )
            # ──────────────────────────────────────────────────────

        except Exception as exc:
            logger.error("PalmPay service failure: %s", exc, exc_info=True)
            return Response(
                {"error": "PalmPay service unavailable. Please try again later."},
                status=502,
            )

        if not palmpay_response:
            return Response(
                {"error": "PalmPay returned empty response."},
                status=502,
            )

        if palmpay_response.get("error"):
            error_msg = palmpay_response["error"]
            # Optional: make user-friendly messages for common PalmPay errors
            if "sign error" in error_msg.lower():
                error_msg = "Signature error - please contact support"
            elif "OPEN_GW" in error_msg:
                error_msg = "PalmPay gateway error - please try again"

            return Response(
                {
                    "error": error_msg,
                    "raw_response": palmpay_response.get("raw", {}),
                },
                status=400,
            )

        account_number = palmpay_response.get("account_number")
        bank_name = palmpay_response.get("bank_name", "PalmPay")
        account_name = palmpay_response.get("account_name")

        if not account_number or not account_name:
            logger.error("Invalid PalmPay response payload: %s", palmpay_response)
            return Response(
                {"error": "Invalid response from PalmPay."},
                status=502,
            )

        conflict = VirtualAccount.objects.filter(
            provider="palmpay",
            account_number=account_number,
        ).exclude(user=user).first()

        if conflict:
            return Response(
                {"error": "This BVN is already linked to another account."},
                status=400,
            )

        try:
            with transaction.atomic():
                va = VirtualAccount.objects.create(
                    user=user,
                    provider="palmpay",
                    provider_account_id=None,
                    account_number=account_number,
                    account_name=account_name,
                    bank_name=bank_name,
                    metadata={
                        "raw_response": palmpay_response.get("raw_response"),
                        "type": "static",
                    },
                    assigned=True,
                )

                wallet.van_account_number = account_number
                wallet.van_bank_name = bank_name
                wallet.van_account_name = account_name
                wallet.van_provider = "palmpay"
                wallet.save()

        except Exception as exc:
            logger.error("DB error saving PalmPay VA: %s", exc, exc_info=True)
            return Response(
                {"error": "Failed to save virtual account details. Please contact support."},
                status=500,
            )

        return Response(
            {
                "success": True,
                "message": "PalmPay virtual account generated successfully.",
                "account_number": account_number,
                "bank_name": bank_name,
                "account_name": account_name,
                "type": "static",
            },
            status=201,
        )

    # ==========================================================================
    # PAYSTACK
    # ==========================================================================
    def handle_paystack(self, request, user):
        existing_va = VirtualAccount.objects.filter(
            user=user, provider="paystack", assigned=True
        ).first()

        if existing_va:
            return Response({
                "success": True,
                "message": "Paystack virtual account already exists.",
                "account_number": existing_va.account_number,
                "bank_name": existing_va.bank_name,
                "account_name": existing_va.account_name,
            }, status=status.HTTP_200_OK)

        profile = getattr(user, "profile", None)
        first_name = getattr(profile, "first_name", None) or user.first_name or "User"
        last_name = getattr(profile, "last_name", None) or user.last_name or "Account"
        phone_number = getattr(profile, "phone_number", None) or "+2340000000000"

        # Create customer in Paystack
        customer_response = paystack.Customer.create(
            email=user.email,
            first_name=first_name,
            last_name=last_name,
            phone=phone_number,
        )

        customer_data = (
            customer_response.json()
            if hasattr(customer_response, "json")
            else getattr(customer_response, "data", customer_response)
        )

        customer_id = (
            customer_data.get("customer_code")
            or customer_data.get("data", {}).get("customer_code")
        )

        if not customer_id:
            return Response(
                {"success": False, "error": "Failed to create Paystack customer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        preferred_bank = request.data.get("preferred_bank", "wema-bank")
        dva_response = DedicatedVirtualAccount.create(
            customer=customer_id,
            preferred_bank=preferred_bank,
        )

        dva_data = (
            dva_response.json()
            if hasattr(dva_response, "json")
            else getattr(dva_response, "data", dva_response)
        )

        dva_payload = dva_data.get("data", dva_data)

        va = VirtualAccount.objects.create(
            user=user,
            provider="paystack",
            provider_account_id=dva_payload.get("id"),
            account_number=dva_payload.get("account_number"),
            bank_name=dva_payload.get("bank", {}).get("name"),
            account_name=dva_payload.get("account_name", user.email),
            metadata={"paystack_response": dva_payload},
            assigned=True,
        )

        return Response({
            "success": True,
            "message": "Paystack virtual account generated successfully.",
            "account_number": va.account_number,
            "bank_name": va.bank_name,
            "account_name": va.account_name,
        }, status=status.HTTP_201_CREATED)

class PalmpayWebhookView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        body = request.data

        palmpay = PalmpayService(use_live=settings.PAYMENTS_LIVE)

        if not palmpay.verify_callback(body):
            return Response("invalid", status=400)

        # ---- BUSINESS LOGIC HERE ----
        # order_id = body["orderId"]
        # status = body["orderStatus"]

        return Response("success", status=200)
    
class RequeryDVAAPIView(APIView):
    """Requery incoming transfers to a Paystack DVA."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            account_number = request.data.get("account_number")
            provider_slug = request.data.get("provider_slug", "titan-paystack")
            date = request.data.get("date")

            if not account_number or not date:
                return Response({"error": "Account number and date are required"}, status=status.HTTP_400_BAD_REQUEST)

            va = get_object_or_404(VirtualAccount, user=request.user, provider="paystack", account_number=account_number)
            wallet = get_object_or_404(Wallet, user=request.user)

            response = DedicatedVirtualAccount.requery(
                account_number=account_number,
                provider_slug=provider_slug,
                date=date
            )
            try:
                if hasattr(response, 'json'):
                    response_data = response.json()
                elif hasattr(response, 'data'):
                    response_data = response.data
                else:
                    logger.error(f"Unexpected requery response structure for user {request.user.id}: {dir(response)}")
                    return Response({"error": "Invalid requery response format"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                logger.debug(f"Requery response data: {response_data}")
            except Exception as e:
                logger.error(f"Error parsing requery response for user {request.user.id}: {str(e)}")
                return Response({"error": "Failed to parse requery response"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            if not isinstance(response_data, dict):
                logger.error(f"Unexpected requery data type for user {request.user.id}: {type(response_data)}")
                return Response({"error": "Invalid requery data format"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            if response_data.get('status'):
                transfers = response_data['data']['transfers']
                credited_amount = Decimal('0')
                for transfer in transfers:
                    if transfer['status'] == 'success' and not Deposit.objects.filter(provider_reference=transfer['reference']).exists():
                        amount = Decimal(str(transfer['amount'] / 100))
                        fee = min(amount * Decimal('0.02'), Decimal('100'))
                        net_amount = amount - fee
                        with transaction.atomic():
                            deposit = Deposit.objects.create(
                                user=request.user,
                                virtual_account=va,
                                amount=amount,
                                provider_reference=transfer['reference'],
                                status="credited",
                                raw=transfer
                            )
                            wallet.deposit(
                                amount=net_amount,
                                reference=transfer['reference'],
                                metadata={
                                    "type": "dva_deposit",
                                    "provider": "paystack",
                                    "provider_reference": transfer['reference'],
                                    "account_number": account_number,
                                    "transfer_code": transfer['transfer_code']
                                }
                            )
                            credited_amount += net_amount
                            logger.info(f"DVA transfer credited: user {request.user.id}, amount={net_amount}, reference={transfer['reference']}")
                return Response({
                    "success": True,
                    "message": f"Credited ₦{credited_amount} from DVA transfers",
                    "transfers_found": len(transfers)
                }, status=status.HTTP_200_OK)
            else:
                error_msg = response_data.get('message', 'Unknown error')
                logger.error(f"DVA requery failed for user {request.user.id}: {error_msg}")
                return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error requerying DVA for user {request.user.id}: {str(e)}", exc_info=True)
            return Response({"error": f"Failed to check transfers: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class WalletTransactionListView(generics.ListAPIView):
    serializer_class = WalletTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        try:
            qs = WalletTransaction.objects.filter(user=self.request.user).order_by("-created_at")
            print(f"Queryset count for user {self.request.user}: {qs.count()}")
            category = self.request.query_params.get("category")
            status = self.request.query_params.get("status")
            tx_type = self.request.query_params.get("tx_type")
            start_date = self.request.query_params.get("start_date")
            end_date = self.request.query_params.get("end_date")
            search = self.request.query_params.get("search")

            if category:
                qs = qs.filter(category__iexact=category)
            if status:
                qs = qs.filter(status__iexact=status)
            if tx_type:
                qs = qs.filter(tx_type__iexact=tx_type)
            if start_date:
                try:
                    start = make_aware(datetime.strptime(start_date, "%Y-%m-%d"))
                    qs = qs.filter(created_at__gte=start)
                except ValueError as e:
                    print(f"Invalid start_date: {e}")
            if end_date:
                try:
                    end = make_aware(datetime.strptime(end_date, "%Y-%m-%d"))
                    qs = qs.filter(created_at__lte=end)
                except ValueError as e:
                    print(f"Invalid end_date: {e}")
            if search:
                qs = qs.filter(
                    Q(reference__icontains=search) |
                    Q(request_id__icontains=search) |
                    Q(metadata__icontains=search)
                )
            print(f"Filtered queryset count: {qs.count()}")
            return qs
        except Exception as e:
            print(f"Error in get_queryset: {str(e)}")
            raise

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Notification.objects.filter(user=self.request.user, is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked as read"})


# ========================================
# Secure Transaction Views (with PIN/Biometric verification)
# ========================================

class SecureWithdrawalView(APIView):
    """
    POST /api/wallet/withdraw/
    Withdraw funds from wallet to bank account with PIN/biometric verification
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        amount = request.data.get('amount')
        bank_code = request.data.get('bank_code')
        account_number = request.data.get('account_number')
        account_name = request.data.get('account_name')
        pin = request.data.get('pin')
        use_biometric = request.data.get('use_biometric', False)

        # Validate required fields
        if not all([amount, bank_code, account_number]):
            return Response(
                {"error": "Amount, bank_code, and account_number are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                return Response(
                    {"error": "Amount must be greater than zero."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, InvalidOperation):
            return Response(
                {"error": "Invalid amount format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get wallet
        try:
            wallet = Wallet.objects.get(user=user)
        except Wallet.DoesNotExist:
            return Response(
                {"error": "Wallet not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check balance
        if wallet.balance < amount:
            return Response(
                {"error": f"Insufficient balance. Available: ₦{wallet.balance}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Security verification - PIN or Biometric
        if use_biometric and user.biometric_enabled:
            # Biometric verification would be handled on frontend via WebAuthn
            # Here we just check if user has biometric enabled
            verification_method = 'biometric'
            logger.info(f"Withdrawal using biometric for user {user.email}")
        else:
            # PIN verification required
            if not user.has_transaction_pin():
                return Response(
                    {"error": "Transaction PIN not set. Please set up your PIN first."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not pin:
                return Response(
                    {"error": "Transaction PIN is required for withdrawal."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if PIN is locked
            if user.is_pin_locked():
                remaining = (user.pin_locked_until - timezone.now()).seconds // 60
                from wallet.models import TransactionSecurityLog
                TransactionSecurityLog.objects.create(
                    user=user,
                    action='transaction_denied',
                    transaction_type='withdrawal',
                    transaction_amount=amount,
                    verification_method='pin',
                    metadata={'reason': 'pin_locked'}
                )
                return Response(
                    {"error": f"PIN is locked. Try again in {remaining} minutes."},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Verify PIN
            try:
                is_valid = user.check_transaction_pin(pin)
                if not is_valid:
                    attempts_left = max(0, 5 - user.pin_attempts)
                    from wallet.models import TransactionSecurityLog
                    TransactionSecurityLog.objects.create(
                        user=user,
                        action='pin_verify_failed',
                        transaction_type='withdrawal',
                        transaction_amount=amount,
                        verification_method='pin',
                        metadata={'attempts': user.pin_attempts, 'attempts_left': attempts_left}
                    )

                    if user.is_pin_locked():
                        return Response(
                            {"error": "Too many failed attempts. PIN is now locked for 30 minutes."},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    return Response({
                        "error": "Invalid PIN.",
                        "attempts_left": attempts_left
                    }, status=status.HTTP_401_UNAUTHORIZED)

                verification_method = 'pin'
            except ValueError as e:
                return Response(
                    {"error": str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Process withdrawal
        try:
            reference = f"WD-{timezone.now().strftime('%Y%m%d%H%M%S')}-{user.id}"
            
            # Withdraw from wallet
            success = wallet.withdraw(
                amount=amount,
                reference=reference,
                metadata={
                    'type': 'bank_withdrawal',
                    'bank_code': bank_code,
                    'account_number': account_number,
                    'account_name': account_name,
                    'verification_method': verification_method
                }
            )

            if not success:
                return Response(
                    {"error": "Withdrawal failed. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Log security event
            from wallet.models import TransactionSecurityLog
            TransactionSecurityLog.objects.create(
                user=user,
                action='transaction_approved',
                transaction_type='withdrawal',
                transaction_amount=amount,
                verification_method=verification_method,
                metadata={
                    'reference': reference,
                    'bank_code': bank_code,
                    'account_number': account_number
                }
            )

            logger.info(f"Withdrawal successful: user={user.email}, amount={amount}, ref={reference}")

            return Response({
                "success": True,
                "message": f"Withdrawal of ₦{amount} initiated successfully.",
                "reference": reference,
                "new_balance": str(wallet.balance)
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Withdrawal error for user {user.email}: {e}", exc_info=True)
            return Response(
                {"error": "Withdrawal failed. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SecurePaymentView(APIView):
    """
    POST /api/wallet/payment/
    Make a payment with PIN/biometric verification
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        amount = request.data.get('amount')
        recipient_email = request.data.get('recipient_email')
        description = request.data.get('description', '')
        pin = request.data.get('pin')
        use_biometric = request.data.get('use_biometric', False)

        # Validate required fields
        if not all([amount, recipient_email]):
            return Response(
                {"error": "Amount and recipient_email are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            amount = Decimal(str(amount))
            if amount <= 0:
                return Response(
                    {"error": "Amount must be greater than zero."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (ValueError, InvalidOperation):
            return Response(
                {"error": "Invalid amount format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get sender wallet
        try:
            sender_wallet = Wallet.objects.get(user=user)
        except Wallet.DoesNotExist:
            return Response(
                {"error": "Wallet not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get recipient
        try:
            recipient = User.objects.get(email=recipient_email.lower().strip())
            recipient_wallet = Wallet.objects.get(user=recipient)
        except User.DoesNotExist:
            return Response(
                {"error": "Recipient not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Wallet.DoesNotExist:
            return Response(
                {"error": "Recipient wallet not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if sending to self
        if user.email == recipient_email.lower().strip():
            return Response(
                {"error": "Cannot send payment to yourself."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check balance
        if sender_wallet.balance < amount:
            return Response(
                {"error": f"Insufficient balance. Available: ₦{sender_wallet.balance}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Security verification - PIN or Biometric
        if use_biometric and user.biometric_enabled:
            verification_method = 'biometric'
            logger.info(f"Payment using biometric for user {user.email}")
        else:
            # PIN verification required
            if not user.has_transaction_pin():
                return Response(
                    {"error": "Transaction PIN not set. Please set up your PIN first."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not pin:
                return Response(
                    {"error": "Transaction PIN is required for payment."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check if PIN is locked
            if user.is_pin_locked():
                remaining = (user.pin_locked_until - timezone.now()).seconds // 60
                from wallet.models import TransactionSecurityLog
                TransactionSecurityLog.objects.create(
                    user=user,
                    action='transaction_denied',
                    transaction_type='payment',
                    transaction_amount=amount,
                    verification_method='pin',
                    metadata={'reason': 'pin_locked', 'recipient': recipient_email}
                )
                return Response(
                    {"error": f"PIN is locked. Try again in {remaining} minutes."},
                    status=status.HTTP_403_FORBIDDEN
                )

            # Verify PIN
            try:
                is_valid = user.check_transaction_pin(pin)
                if not is_valid:
                    attempts_left = max(0, 5 - user.pin_attempts)
                    from wallet.models import TransactionSecurityLog
                    TransactionSecurityLog.objects.create(
                        user=user,
                        action='pin_verify_failed',
                        transaction_type='payment',
                        transaction_amount=amount,
                        verification_method='pin',
                        metadata={
                            'attempts': user.pin_attempts,
                            'attempts_left': attempts_left,
                            'recipient': recipient_email
                        }
                    )

                    if user.is_pin_locked():
                        return Response(
                            {"error": "Too many failed attempts. PIN is now locked for 30 minutes."},
                            status=status.HTTP_403_FORBIDDEN
                        )

                    return Response({
                        "error": "Invalid PIN.",
                        "attempts_left": attempts_left
                    }, status=status.HTTP_401_UNAUTHORIZED)

                verification_method = 'pin'
            except ValueError as e:
                return Response(
                    {"error": str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Process payment
        try:
            reference = f"PAY-{timezone.now().strftime('%Y%m%d%H%M%S')}-{user.id}"

            with transaction.atomic():
                # Debit sender
                sender_success = sender_wallet.withdraw(
                    amount=amount,
                    reference=reference,
                    metadata={
                        'type': 'payment_sent',
                        'recipient': recipient_email,
                        'description': description,
                        'verification_method': verification_method
                    }
                )

                if not sender_success:
                    raise Exception("Failed to debit sender wallet")

                # Credit recipient
                recipient_success = recipient_wallet.deposit(
                    amount=amount,
                    reference=reference,
                    metadata={
                        'type': 'payment_received',
                        'sender': user.email,
                        'description': description
                    }
                )

                if not recipient_success:
                    raise Exception("Failed to credit recipient wallet")

            # Log security event
            from wallet.models import TransactionSecurityLog
            TransactionSecurityLog.objects.create(
                user=user,
                action='transaction_approved',
                transaction_type='payment',
                transaction_amount=amount,
                verification_method=verification_method,
                metadata={
                    'reference': reference,
                    'recipient': recipient_email,
                    'description': description
                }
            )

            logger.info(f"Payment successful: sender={user.email}, recipient={recipient_email}, amount={amount}, ref={reference}")

            return Response({
                "success": True,
                "message": f"Payment of ₦{amount} to {recipient_email} completed successfully.",
                "reference": reference,
                "new_balance": str(sender_wallet.balance)
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Payment error for user {user.email}: {e}", exc_info=True)
            return Response(
                {"error": "Payment failed. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# ============================================================================
# CARD DEPOSIT ENDPOINTS
# ============================================================================

class CardDepositExchangeRateView(APIView):
    """Get current exchange rates and calculate fees for card deposits"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get all available exchange rates"""
        rates = CardDepositExchangeRate.objects.all()
        serializer = CardDepositExchangeRateSerializer(rates, many=True)
        return Response({
            "success": True,
            "rates": serializer.data
        })

    def post(self, request):
        """Calculate NGN amount for a given foreign currency amount"""
        currency = request.data.get('currency', '').upper()
        amount_str = request.data.get('amount')
        
        # Validate inputs
        if not currency or currency not in SUPPORTED_CARD_CURRENCIES:
            return Response(
                {"error": f"Invalid currency. Must be one of: {', '.join(SUPPORTED_CARD_CURRENCIES)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            amount = Decimal(str(amount_str))
            if amount <= 0:
                raise ValueError("Amount must be positive")
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {"error": "Invalid amount"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get exchange rate
        try:
            exchange_rate = CardDepositExchangeRate.objects.get(currency=currency)
        except CardDepositExchangeRate.DoesNotExist:
            return Response(
                {"error": f"Exchange rate for {currency} not configured"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Calculate amounts
        calculation = exchange_rate.calculate_ngn_amount(amount)
        
        return Response({
            "success": True,
            "currency": currency,
            "amount": str(amount),
            "exchange_rate": str(calculation['exchange_rate']),
            "gross_ngn": str(calculation['gross_ngn']),
            "flutterwave_fee": str(calculation['flutterwave_fee']),
            "platform_margin": str(calculation['platform_margin']),
            "net_amount": str(calculation['net_amount']),
            "breakdown": {
                "base_conversion": f"{amount} {currency} × {calculation['exchange_rate']} = ₦{calculation['gross_ngn']}",
                "flutterwave_fee": f"₦{calculation['flutterwave_fee']} ({exchange_rate.flutterwave_fee_percent}%)",
                "platform_margin": f"₦{calculation['platform_margin']} ({exchange_rate.platform_margin_percent}%)",
                "you_receive": f"₦{calculation['net_amount']}"
            }
        })


class CardDepositInitiateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CardDepositInitiateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        provider = data.get("provider", "flutterwave")
        currency = data.get("currency")

        if not is_provider_allowed_for_currency(currency, provider):
            allowed = get_allowed_providers_for_currency(currency)
            return Response(
                {
                    "error": (
                        f"Provider '{provider}' is not supported for {currency}. "
                        f"Allowed providers: {', '.join(allowed)}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        email = user.email

        if not email:
            return Response(
                {"error": "User email is required for card payments"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            rate = CardDepositExchangeRate.objects.get(currency=data["currency"])
        except CardDepositExchangeRate.DoesNotExist:
            return Response(
                {"error": f"Exchange rate for {data['currency']} not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        calculation = rate.calculate_ngn_amount(data["amount"])

        tx_ref = f"CARD{user.id}{uuid_lib.uuid4().hex[:12].upper()}"
        if not re.match(r"^[A-Z0-9]+$", tx_ref):
            return Response(
                {"error": "Failed to generate transaction reference"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # redirect_url = f"{settings.FRONTEND_URL}/wallet/card-deposit/callback"
        redirect_url = f"{settings.FRONTEND_URL}/card-deposit-callback"


        card_deposit = CardDeposit.objects.create(
            user=user,
            provider=provider,
            currency=data["currency"],
            amount=data["amount"],
            exchange_rate=calculation["exchange_rate"],
            gross_ngn=calculation["gross_ngn"],
            flutterwave_fee=calculation["flutterwave_fee"],
            platform_margin=calculation["platform_margin"],
            ngn_amount=calculation["net_amount"],
            flutterwave_tx_ref=tx_ref,
            status="pending",
            use_live_mode=data["use_live"],
        )

        
        from .card_deposit_config import FLUTTERWAVE_CARD_CURRENCIES
        if provider == "flutterwave" and data["currency"] not in FLUTTERWAVE_CARD_CURRENCIES:
            return Response(
                {
                    "error": f"Flutterwave does not support card deposits in {data['currency']}.",
                    "allowed_currencies": sorted(FLUTTERWAVE_CARD_CURRENCIES),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )


        if provider == "flutterwave":
            result = self._initiate_flutterwave_payment(
                tx_ref=tx_ref,
                user=user,
                email=email,
                card_deposit=card_deposit,
                data=data,
                calculation=calculation,
                redirect_url=redirect_url,
            )
        else:
            result = self._initiate_fincra_payment(
                tx_ref=tx_ref,
                user=user,
                email=email,
                card_deposit=card_deposit,
                data=data,
                calculation=calculation,
                redirect_url=redirect_url,
            )

        if result.get("status") != "success":
            card_deposit.status = "failed"
            card_deposit.raw_response = result
            card_deposit.save(update_fields=["status", "raw_response"])
            return Response(
                {"error": result.get("message", "Payment initiation failed")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        card_deposit.raw_response = result.get("data", {})
        card_deposit.status = "processing"
        card_deposit.save(update_fields=["raw_response", "status"])

        return Response(
            {
                "success": True,
                "message": "Payment initiated. Redirect user to the payment link.",
                "provider": provider,
                "tx_ref": tx_ref,
                "authorization_url": result["link"],
                "deposit_id": card_deposit.id,
            },
            status=status.HTTP_201_CREATED,
        )

    def _initiate_flutterwave_payment(self, *, tx_ref, user, email, card_deposit, data, calculation, redirect_url):
        from .card_deposit_config import FLUTTERWAVE_CARD_CURRENCIES
        use_live = data["use_live"]
        cfg = "LIVE" if use_live else "TEST"
        secret_key = getattr(settings, f"FLW_{cfg}_SECRET_KEY", None)
        base_url = getattr(settings, f"FLW_{cfg}_V3_BASE_URL", "https://api.flutterwave.com/v3").rstrip("/")

        if not secret_key:
            return {"status": "error", "message": "Flutterwave payment service misconfigured"}

        charge_amount = str(data["amount"])       # e.g. "50.00"
        charge_currency = data["currency"]

        if charge_currency not in FLUTTERWAVE_CARD_CURRENCIES:
            return {"status": "error", "message": f"Unsupported Flutterwave currency: {charge_currency}"}

        payload = {
            "tx_ref": tx_ref,
            "amount": charge_amount,
            "currency": charge_currency,
            "redirect_url": redirect_url,
            "customer": {"email": email, "name": user.get_full_name() or email},
            "meta": {
                "deposit_id": str(card_deposit.id),
                "foreign_amount": str(data["amount"]),
                "foreign_currency": data["currency"],
                "provider": "flutterwave",
                # Helpful for reconciliation / support
                "expected_ngn_credit": str(calculation["net_amount"]),
                "rate": str(calculation["exchange_rate"]),
            },
            "customizations": {
                "title": "Wallet Deposit",
                "description": f"Deposit {charge_amount} {charge_currency} to your wallet",
            },
            "payment_options": "card",
        }

        headers = {
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
        }

        endpoint = f"{base_url}/payments"

        try:
            resp = requests.post(endpoint, json=payload, headers=headers, timeout=60)
            resp.raise_for_status()
            fw_result = resp.json()
        except Exception as e:
            logger.error("Flutterwave payment initiation failed", exc_info=True)
            return {"status": "error", "message": str(e)}

        if fw_result.get("status") != "success":
            return {
                "status": "error",
                "message": fw_result.get("message", "Payment initiation failed"),
                "data": fw_result,
            }

        return {
            "status": "success",
            "data": fw_result,
            "link": fw_result["data"]["link"],
        }

    def _build_fincra_full_name(self, user) -> str:
        full_name = (user.get_full_name() or "").strip()
        if len(full_name.split()) >= 2:
            return full_name
        if getattr(user, "first_name", "").strip() and getattr(user, "last_name", "").strip():
            return f"{user.first_name.strip()} {user.last_name.strip()}"
        return f"MafitaPay Customer {user.id}"


    def _initiate_fincra_payment(self, *, tx_ref, user, email, card_deposit, data, calculation, redirect_url):
        from .services.fincra_card_service import FincraCardService

        try:
            service = FincraCardService(use_live=data["use_live"])
        except Exception:
            logger.exception("Fincra payment service misconfigured")
            return {"status": "error", "message": "Fincra payment service misconfigured"}

        fincra_name = self._build_fincra_full_name(user)

        return service.initiate_checkout(
            tx_ref=tx_ref,
            amount=str(data["amount"]),
            currency=data["currency"],
            redirect_url=redirect_url,
            email=email,
            name=fincra_name,  # <-- FIX
            metadata={
                "deposit_id": str(card_deposit.id),
                "foreign_amount": str(data["amount"]),
                "foreign_currency": data["currency"],
                "provider": "fincra",
                "expected_ngn_credit": str(calculation["net_amount"]),
                "rate": str(calculation["exchange_rate"]),
            },
        )


class CardDepositStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tx_ref = request.query_params.get("tx_ref") or request.query_params.get("reference")
        if not tx_ref:
            return Response({"error": "tx_ref is required"}, status=drf_status.HTTP_400_BAD_REQUEST)

        deposit = CardDeposit.objects.filter(
            user=request.user,
            flutterwave_tx_ref=tx_ref,
        ).first()

        if not deposit:
            return Response({"error": "deposit not found"}, status=drf_status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "success": True,
                "tx_ref": tx_ref,
                "status": deposit.status,  # pending/processing/successful/failed
                "provider": deposit.provider,
                "amount": str(deposit.amount),
                "currency": deposit.currency,
                "ngn_amount": str(deposit.ngn_amount),
                "updated_at": deposit.updated_at,
            },
            status=drf_status.HTTP_200_OK,
        )


class CardDepositVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tx_ref = (
            request.data.get("tx_ref")
            or request.data.get("reference")
            or request.data.get("transactionReference")
        )
        if not tx_ref:
            return Response(
                {"error": "reference or tx_ref is required"},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        card_deposit = CardDeposit.objects.filter(
            user=request.user,
            flutterwave_tx_ref=tx_ref,
        ).first()

        if not card_deposit:
            return Response({"error": "deposit not found"}, status=drf_status.HTTP_404_NOT_FOUND)

        provider_result = self._verify_provider(card_deposit, tx_ref)
        if provider_result.get("status") == "error":
            return Response(
                {
                    "success": False,
                    "tx_ref": tx_ref,
                    "status": card_deposit.status,
                    "provider": card_deposit.provider,
                    "message": provider_result.get("message", "Verification failed"),
                },
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        remote_status = provider_result.get("payment_status")
        provider_tx_id = provider_result.get("provider_tx_id")
        provider_payload = provider_result.get("raw")

        with transaction.atomic():
            locked_deposit = CardDeposit.objects.select_for_update().filter(
                user=request.user,
                flutterwave_tx_ref=tx_ref,
            ).first()

            if not locked_deposit:
                return Response({"error": "deposit not found"}, status=drf_status.HTTP_404_NOT_FOUND)

            if provider_tx_id:
                locked_deposit.flutterwave_tx_id = str(provider_tx_id)

            if provider_payload is not None:
                locked_deposit.raw_response = provider_payload

            if remote_status in {"successful", "success", "paid", "completed"}:
                locked_deposit.status = "successful"
            elif remote_status in {"failed", "cancelled", "canceled"}:
                if locked_deposit.status != "successful":
                    locked_deposit.status = "failed"
            else:
                if locked_deposit.status in {"pending", "processing"}:
                    locked_deposit.status = "processing"

            locked_deposit.save(update_fields=["status", "flutterwave_tx_id", "raw_response", "updated_at"])

            credited = False
            if locked_deposit.status == "successful":
                existing_txn = WalletTransaction.objects.filter(
                    user=locked_deposit.user,
                    reference=tx_ref,
                    status="success",
                ).first()

                if not existing_txn:
                    wallet, _ = Wallet.objects.select_for_update().get_or_create(user=locked_deposit.user)
                    credited = wallet.deposit(
                        amount=locked_deposit.ngn_amount,
                        reference=tx_ref,
                        metadata={
                            "type": "card_deposit",
                            "provider": locked_deposit.provider,
                            "currency": locked_deposit.currency,
                            "foreign_amount": str(locked_deposit.amount),
                            "exchange_rate": str(locked_deposit.exchange_rate),
                            "provider_tx_id": locked_deposit.flutterwave_tx_id,
                        },
                    )
                    if credited:
                        Notification.objects.create(
                            user=locked_deposit.user,
                            message=(
                                f"Card deposit of {locked_deposit.amount} {locked_deposit.currency} "
                                f"(₦{locked_deposit.ngn_amount}) completed successfully"
                            ),
                        )

            return Response(
                {
                    "success": True,
                    "tx_ref": tx_ref,
                    "status": locked_deposit.status,
                    "provider": locked_deposit.provider,
                    "provider_tx_id": locked_deposit.flutterwave_tx_id,
                    "wallet_credited": credited,
                },
                status=drf_status.HTTP_200_OK,
            )

    def _verify_provider(self, card_deposit, tx_ref):
        provider = (card_deposit.provider or "").lower()

        if provider == "fincra":
            from .services.fincra_card_service import FincraCardService

            service = FincraCardService(use_live=card_deposit.use_live_mode)
            result = service.verify_by_reference(tx_ref)
            if result.get("status") != "success":
                return result

            payload = result.get("data") or {}
            data = payload.get("data") if isinstance(payload, dict) else payload
            if not isinstance(data, dict):
                data = {}

            payment_status = (
                data.get("status")
                or data.get("paymentStatus")
                or payload.get("status")
                or ""
            ).lower()
            provider_tx_id = data.get("id") or data.get("transactionId") or data.get("paymentId")

            return {
                "status": "success",
                "payment_status": payment_status,
                "provider_tx_id": provider_tx_id,
                "raw": payload,
            }

        from .services.flutterwave_card_service import FlutterwaveCardService

        service = FlutterwaveCardService(use_live=card_deposit.use_live_mode)
        result = service.verify_by_reference(tx_ref)
        if result.get("status") != "success":
            return result

        data = result.get("data") or {}
        payment_status = (data.get("status") or "").lower()
        provider_tx_id = data.get("id") or data.get("txid")

        return {
            "status": "success",
            "payment_status": payment_status,
            "provider_tx_id": provider_tx_id,
            "raw": data,
        }


class CardDepositListView(generics.ListAPIView):
    """List user's card deposit transactions"""
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return CardDeposit.objects.filter(user=self.request.user).order_by('-created_at')

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        
        if page is not None:
            serializer = CardDepositSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = CardDepositSerializer(queryset, many=True)
        return Response({
            "success": True,
            "deposits": serializer.data
        })


class CardDepositWebhookDebugView(APIView):
    """
    Admin-only endpoint for debugging and manually re-processing card deposit webhooks
    GET: Show webhook processing history and status for a tx_ref
    POST: Manually re-process a webhook by tx_ref
    """
    permission_classes = [permissions.IsAdminUser]
    
    def get(self, request):
        """Get webhook processing history and status"""
        tx_ref = request.query_params.get('tx_ref')
        
        if not tx_ref:
            return Response(
                {"error": "tx_ref parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get CardDeposit record
        try:
            card_deposit = CardDeposit.objects.get(flutterwave_tx_ref=tx_ref)
            deposit_data = CardDepositSerializer(card_deposit).data
        except CardDeposit.DoesNotExist:
            deposit_data = None
        
        # Get retry queue entries
        from .models import WebhookRetryQueue
        retry_entries = WebhookRetryQueue.objects.filter(
            webhook_type='card_deposit',
            tx_ref=tx_ref
        ).order_by('-created_at')
        
        retry_data = []
        for entry in retry_entries:
            retry_data.append({
                'id': str(entry.id),
                'status': entry.status,
                'retry_count': entry.retry_count,
                'max_retries': entry.max_retries,
                'is_permanent_failure': entry.is_permanent_failure,
                'error_message': entry.error_message,
                'error_type': entry.error_type,
                'next_retry_at': entry.next_retry_at,
                'created_at': entry.created_at,
                'last_retry_at': entry.last_retry_at,
                'succeeded_at': entry.succeeded_at,
            })
        
        # Get wallet transaction if successful
        wallet_transaction = None
        if card_deposit and card_deposit.status == 'successful':
            from .models import WalletTransaction
            wt = WalletTransaction.objects.filter(
                user=card_deposit.user,
                reference=tx_ref
            ).first()
            if wt:
                wallet_transaction = WalletTransactionSerializer(wt).data
        
        return Response({
            "success": True,
            "tx_ref": tx_ref,
            "card_deposit": deposit_data,
            "retry_history": retry_data,
            "wallet_transaction": wallet_transaction,
        })
    
    def post(self, request):
        """Manually re-process a webhook"""
        tx_ref = request.data.get('tx_ref')
        
        if not tx_ref:
            return Response(
                {"error": "tx_ref is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get CardDeposit record
        try:
            card_deposit = CardDeposit.objects.select_for_update().get(
                flutterwave_tx_ref=tx_ref
            )
        except CardDeposit.DoesNotExist:
            return Response(
                {"error": f"CardDeposit not found for tx_ref: {tx_ref}"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if already successful
        if card_deposit.status == 'successful':
            # Verify wallet was actually credited
            from .models import WalletTransaction
            wt = WalletTransaction.objects.filter(
                user=card_deposit.user,
                reference=tx_ref,
                status='success'
            ).first()
            
            if wt:
                return Response({
                    "success": True,
                    "message": "Transaction already processed successfully",
                    "already_processed": True,
                    "card_deposit": CardDepositSerializer(card_deposit).data,
                    "wallet_transaction": WalletTransactionSerializer(wt).data,
                })
        
        # Attempt to credit wallet
        logger.info(
            "[WEBHOOK_DEBUG] Manual re-processing → tx_ref=%s, admin=%s",
            tx_ref, request.user.email
        )
        
        user = card_deposit.user
        try:
            wallet = Wallet.objects.select_for_update().get(user=user)
        except Wallet.DoesNotExist:
            return Response(
                {"error": f"Wallet not found for user {user.email}"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check if already credited (idempotency check)
        from .models import WalletTransaction
        existing_txn = WalletTransaction.objects.filter(
            user=user,
            reference=tx_ref
        ).first()
        
        if existing_txn:
            return Response({
                "success": True,
                "message": "Wallet already credited for this transaction",
                "already_processed": True,
                "wallet_transaction": WalletTransactionSerializer(existing_txn).data,
            })
        
        # Credit wallet
        logger.info(
            "[WEBHOOK_DEBUG] Crediting wallet → user=%s, amount=₦%s, balance=₦%s",
            user.email, card_deposit.ngn_amount, wallet.balance
        )
        
        success = wallet.deposit(
            amount=card_deposit.ngn_amount,
            reference=tx_ref,
            metadata={
                'type': 'card_deposit',
                'currency': card_deposit.currency,
                'foreign_amount': str(card_deposit.amount),
                'exchange_rate': str(card_deposit.exchange_rate),
                'flutterwave_tx_id': card_deposit.flutterwave_tx_id,
                'manual_reprocess': True,
                'admin_user': request.user.email,
            }
        )
        
        if success:
            # Update card deposit status
            card_deposit.status = 'successful'
            card_deposit.save()
            
            # Mark retry queue as successful
            from .models import WebhookRetryQueue
            retry_entry = WebhookRetryQueue.objects.filter(
                webhook_type='card_deposit',
                tx_ref=tx_ref
            ).first()
            if retry_entry:
                retry_entry.mark_success()
            
            wallet.refresh_from_db()
            logger.info(
                "[WEBHOOK_DEBUG] ✓ Manual re-processing successful → "
                "tx_ref=%s, user=%s, new_balance=₦%s",
                tx_ref, user.email, wallet.balance
            )
            
            # Create notification
            from .models import Notification
            Notification.objects.create(
                user=user,
                message=f"Card deposit of {card_deposit.amount} {card_deposit.currency} "
                        f"(₦{card_deposit.ngn_amount}) completed successfully"
            )
            
            return Response({
                "success": True,
                "message": "Webhook re-processed successfully",
                "card_deposit": CardDepositSerializer(card_deposit).data,
                "new_balance": str(wallet.balance),
            })
        else:
            logger.error(
                "[WEBHOOK_DEBUG] ✗ Manual re-processing failed → "
                "tx_ref=%s, user=%s, wallet.deposit() returned False",
                tx_ref, user.email
            )
            return Response(
                {"error": "Failed to credit wallet. Check logs for details."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class WebhookRetryProcessView(APIView):
    """
    Admin-only endpoint to process pending webhook retries
    Processes webhooks that are due for retry based on next_retry_at
    """
    permission_classes = [permissions.IsAdminUser]
    
    def post(self, request):
        """Process pending webhook retries"""
        from .models import WebhookRetryQueue
        
        # Get pending retries that are due
        now = timezone.now()
        pending_retries = WebhookRetryQueue.objects.filter(
            status='pending',
            is_permanent_failure=False,
            next_retry_at__lte=now
        ).order_by('next_retry_at')[:10]  # Process max 10 at a time
        
        results = []
        for retry_entry in pending_retries:
            logger.info(
                "[WEBHOOK_RETRY] Processing retry → type=%s, tx_ref=%s, attempt=%d/%d",
                retry_entry.webhook_type, retry_entry.tx_ref,
                retry_entry.retry_count + 1, retry_entry.max_retries
            )
            
            # Mark as processing
            retry_entry.status = 'processing'
            retry_entry.save()
            
            try:
                if retry_entry.webhook_type == 'card_deposit':
                    # Re-process card deposit webhook
                    result = self._retry_card_deposit_webhook(retry_entry)
                    results.append({
                        'tx_ref': retry_entry.tx_ref,
                        'result': result
                    })
                else:
                    logger.warning(
                        "[WEBHOOK_RETRY] Unsupported webhook type: %s",
                        retry_entry.webhook_type
                    )
                    retry_entry.mark_permanent_failure(
                        f"Unsupported webhook type: {retry_entry.webhook_type}",
                        'UnsupportedWebhookType'
                    )
                    results.append({
                        'tx_ref': retry_entry.tx_ref,
                        'result': 'unsupported_type'
                    })
            except Exception as e:
                logger.exception(
                    "[WEBHOOK_RETRY] Error processing retry → tx_ref=%s",
                    retry_entry.tx_ref
                )
                retry_entry.mark_transient_failure(str(e), type(e).__name__)
                results.append({
                    'tx_ref': retry_entry.tx_ref,
                    'result': 'error',
                    'error': str(e)
                })
        
        return Response({
            "success": True,
            "processed_count": len(results),
            "results": results
        })
    
    def _retry_card_deposit_webhook(self, retry_entry):
        """Retry processing a card deposit webhook"""
        from .models import CardDeposit, Wallet
        
        tx_ref = retry_entry.tx_ref
        
        # Get CardDeposit
        try:
            card_deposit = CardDeposit.objects.select_for_update().get(
                flutterwave_tx_ref=tx_ref
            )
        except CardDeposit.DoesNotExist:
            retry_entry.mark_permanent_failure(
                'CardDeposit not found',
                'CardDepositNotFound'
            )
            return 'card_deposit_not_found'
        
        # Check if already successful
        if card_deposit.status == 'successful':
            retry_entry.mark_success()
            return 'already_successful'
        
        # Get wallet
        user = card_deposit.user
        try:
            wallet = Wallet.objects.select_for_update().get(user=user)
        except Wallet.DoesNotExist:
            retry_entry.mark_transient_failure(
                f'Wallet not found for user {user.email}',
                'WalletNotFound'
            )
            return 'wallet_not_found'
        
        # Attempt to credit
        success = wallet.deposit(
            amount=card_deposit.ngn_amount,
            reference=tx_ref,
            metadata={
                'type': 'card_deposit',
                'currency': card_deposit.currency,
                'foreign_amount': str(card_deposit.amount),
                'exchange_rate': str(card_deposit.exchange_rate),
                'flutterwave_tx_id': card_deposit.flutterwave_tx_id,
                'retry_attempt': retry_entry.retry_count + 1,
            }
        )
        
        if success:
            card_deposit.status = 'successful'
            card_deposit.save()
            retry_entry.mark_success()
            
            # Create notification
            from .models import Notification
            Notification.objects.create(
                user=user,
                message=f"Card deposit of {card_deposit.amount} {card_deposit.currency} "
                        f"(₦{card_deposit.ngn_amount}) completed successfully"
            )
            
            return 'success'
        else:
            retry_entry.mark_transient_failure(
                'wallet.deposit() returned False',
                'WalletDepositFailed'
            )
            return 'wallet_deposit_failed'
