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
# from accounts.utils import get_paystack_user_details

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
            serializer = WalletSerializer(wallet)
            return Response(serializer.data)
        except Wallet.DoesNotExist:
            return Response({
                "balance": 0,
                "locked_balance": 0,
                "van_account_number": None,
                "van_bank_name": None,
                "van_provider": None,
            })

# wallet/views.py


class GenerateDVAAPIView(APIView):
    """Generate a Dedicated Virtual Account (DVA) for the user with Paystack."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        try:
            # 🔹 1. Check for existing Paystack DVA
            existing_va = VirtualAccount.objects.filter(
                user=user, provider="paystack", assigned=True
            ).first()

            if existing_va:
                logger.info(f"✅ DVA already exists for user {user.id}: {existing_va.account_number}")
                return Response({
                    "success": True,
                    "message": "Virtual account already assigned.",
                    "account_number": existing_va.account_number,
                    "bank_name": existing_va.bank_name,
                    "account_name": existing_va.account_name,
                }, status=status.HTTP_200_OK)

            # 🔹 2. Safely extract user profile details
            profile = getattr(user, "profile", None)
            first_name = getattr(profile, "first_name", None) or user.first_name or "User"
            last_name = getattr(profile, "last_name", None) or user.last_name or "Account"
            phone_number = getattr(profile, "phone_number", None) or "+2340000000000"

            logger.info(f"🧩 Creating Paystack customer for {user.email}")

            # 🔹 3. Create or fetch Paystack Customer
            customer_response = paystack.Customer.create(
                email=user.email,
                first_name=first_name,
                last_name=last_name,
                phone=phone_number
            )

            # Handle possible response shapes
            if hasattr(customer_response, "json"):
                customer_data = customer_response.json()
            elif hasattr(customer_response, "data"):
                customer_data = customer_response.data
            else:
                customer_data = customer_response

            logger.debug(f"📦 Paystack customer response: {customer_data}")

            # 🔹 4. Extract Customer Code
            customer_id = (
                customer_data.get("customer_code")
                or customer_data.get("data", {}).get("customer_code")
            )

            if not customer_id:
                error_msg = customer_data.get("message", "Failed to create customer.")
                logger.error(f"❌ Customer creation failed for {user.id}: {error_msg}")
                return Response({"error": error_msg}, status=status.HTTP_400_BAD_REQUEST)

            # 🔹 5. Create Dedicated Virtual Account
            preferred_bank = request.data.get("preferred_bank", "wema-bank")
            logger.info(f"🏦 Creating Paystack DVA for {user.id} on {preferred_bank}")

            # ⚠️ NOTE: Do NOT include unsupported params like first_name here.
            dva_response = DedicatedVirtualAccount.create(
                customer=customer_id,
                preferred_bank=preferred_bank,
            )

            # Handle possible response formats
            if hasattr(dva_response, "json"):
                dva_data = dva_response.json()
            elif hasattr(dva_response, "data"):
                dva_data = dva_response.data
            else:
                dva_data = dva_response

            logger.debug(f"📦 Paystack DVA response: {dva_data}")

            # 🔹 6. Validate DVA response
            if not isinstance(dva_data, dict):
                logger.error(f"Unexpected DVA response type: {type(dva_data)}")
                return Response({"error": "Invalid DVA response format"}, status=500)

            dva_payload = dva_data.get("data", dva_data)

            if not dva_data.get("status", True) and "data" not in dva_data:
                error_msg = dva_data.get("message", "Unknown DVA creation error.")
                logger.error(f"❌ DVA creation failed: {error_msg}")
                return Response({"error": error_msg}, status=400)

            # 🔹 7. Save Virtual Account to DB
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

            logger.info(f"✅ DVA created for user {user.id}: {va.account_number} ({va.bank_name})")

            # 🔹 8. Return success response
            return Response({
                "success": True,
                "message": "Virtual account generated successfully.",
                "account_number": va.account_number,
                "bank_name": va.bank_name,
                "account_name": va.account_name,
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"❌ Error generating DVA for user {user.id}: {str(e)}", exc_info=True)
            return Response(
                {"error": f"Failed to generate virtual account: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



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

class PaystackDVAWebhookAPIView(APIView):
    """Handle Paystack DVA webhook events."""
    permission_classes = []

    def post(self, request):
        try:
            # Verify webhook signature
            signature = request.headers.get('x-paystack-signature')
            if signature:
                body = json.dumps(request.data)
                computed_signature = hmac.new(
                    settings.PAYSTACK_SECRET_KEY.encode(),
                    body.encode(),
                    hashlib.sha512
                ).hexdigest()
                if not hmac.compare_digest(signature, computed_signature):
                    logger.error("Invalid webhook signature")
                    return Response({"error": "Invalid signature"}, status=status.HTTP_400_BAD_REQUEST)

            event = request.data.get('event')
            data = request.data.get('data')
            if event == 'transfer.success':
                transfer = data[0]
                reference = transfer['reference']
                amount = Decimal(str(transfer['amount'] / 100))
                account_number = transfer['recipient']['details']['account_number']
                va = get_object_or_404(VirtualAccount, provider="paystack", account_number=account_number)
                user = va.user
                wallet = get_object_or_404(Wallet, user=user)

                if not Deposit.objects.filter(provider_reference=reference).exists():
                    fee = min(amount * Decimal('0.01'), Decimal('300'))
                    net_amount = amount - fee
                    with transaction.atomic():
                        deposit = Deposit.objects.create(
                            user=user,
                            virtual_account=va,
                            amount=amount,
                            provider_reference=reference,
                            status="credited",
                            raw=transfer
                        )
                        wallet.deposit(
                            amount=net_amount,
                            reference=reference,
                            metadata={
                                "type": "dva_deposit",
                                "provider": "paystack",
                                "provider_reference": reference,
                                "account_number": account_number,
                                "transfer_code": transfer['transfer_code']
                            }
                        )
                        logger.info(f"Webhook DVA transfer credited: user {user.id}, amount={net_amount}, reference={reference}")
                else:
                    logger.warning(f"Duplicate webhook for reference {reference}")
            return Response({"status": "success"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error handling DVA webhook: {str(e)}", exc_info=True)
            return Response({"error": f"Webhook processing failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

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