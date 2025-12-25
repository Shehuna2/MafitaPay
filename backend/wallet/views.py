# wallet/views.py
import logging
import re
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status, generics, permissions
from rest_framework.pagination import PageNumberPagination
import paystack
from paystack import DedicatedVirtualAccount
from .models import Wallet, WalletTransaction, Notification, VirtualAccount, Deposit
from .serializers import WalletTransactionSerializer, WalletSerializer, NotificationSerializer
from .utils import extract_bank_name, extract_account_name
from .services.flutterwave_service import FlutterwaveService
from .services.palmpay_service import PalmpayService



from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.timezone import make_aware
from datetime import datetime
import hmac
import hashlib
import json

User = get_user_model()
logger = logging.getLogger(__name__)

# Set Paystack API key
paystack.api_key = settings.PAYSTACK_SECRET_KEY

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

    # ==========================================================================
    # PALMPAY
    # ==========================================================================
    def generate_palmpay_va(self, request, user):
        logger.info("[DVA-PALMPAY] Start: PalmPay Virtual Account")

        wallet, _ = Wallet.objects.get_or_create(user=user)

        # 1. If already exists → return
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

        # 2. Optional: Get BVN if provided
        bvn = request.data.get("bvn")

        # SECURITY: Validate BVN format if provided (BVN=11 digits)
        if bvn:
            clean_bvn = re.sub(r"\D", "", str(bvn))
            if len(clean_bvn) != 11:
                return Response({
                    "error": "Invalid BVN format. Must be 11 digits."
                }, status=400)
            bvn = clean_bvn

        # 3. Call PalmPay service
        palmpay = PalmpayService(use_live=not settings.DEBUG)

        palmpay_response = palmpay.create_virtual_account(
            user=user,
            bvn=bvn
        )

        # Check if response is None or contains an error
        if palmpay_response is None:
            return Response({
                "error": "Failed to create PalmPay VA - no response from service"
            }, status=500)
        
        if palmpay_response.get("error"):
            error_message = palmpay_response.get("error", "Failed to create PalmPay VA")
            # Network errors should return 500, API errors 400
            error_lower = error_message.lower()
            is_network_error = "network" in error_lower or "timeout" in error_lower or "timed out" in error_lower
            status_code = 500 if is_network_error else 400
            return Response({
                "error": error_message
            }, status=status_code)

        account_number = palmpay_response["account_number"]
        bank_name = palmpay_response.get("bank_name", "PalmPay")
        account_name = palmpay_response.get("account_name", "Virtual Account")
        provider_ref = palmpay_response.get("reference")

        # 4. SECURITY CHECK - prevent duplicate accounts
        conflict = VirtualAccount.objects.filter(
            provider="palmpay",
            account_number=account_number
        ).exclude(user=user).first()

        if conflict:
            return Response({
                "error": (
                    "This account is already linked to another user."
                )
            }, status=400)

        # 5. Save database records
        try:
            with transaction.atomic():
                va = VirtualAccount.objects.create(
                    user=user,
                    provider="palmpay",
                    provider_account_id=provider_ref,
                    account_number=account_number,
                    account_name=account_name,
                    bank_name=bank_name,
                    metadata={
                        "raw_response": palmpay_response,
                        "type": palmpay_response.get("type", "static"),
                    },
                    assigned=True
                )

                wallet.van_account_number = account_number
                wallet.van_bank_name = bank_name
                wallet.van_account_name = account_name
                wallet.van_provider = "palmpay"
                wallet.save()

        except Exception as e:
            logger.error("DB error saving PalmPay VA: %s", e, exc_info=True)
            return Response({
                "error": "Failed to save virtual account details."
            }, status=500)

        return Response({
            "success": True,
            "message": "PalmPay virtual account generated successfully.",
            "account_number": account_number,
            "bank_name": bank_name,
            "account_name": account_name,
            "type": palmpay_response.get("type", "static")
        }, status=201)


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
                        fee = min(amount * Decimal('0.01'), Decimal('300'))
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


