# wallet/views.py
import logging
from decimal import Decimal
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.conf import settings
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
            # 3. PAYSTACK FLOW (unchanged)
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
        from wallet.services.flutterwave_service import FlutterwaveService
        from django.db import transaction

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
        import re
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

