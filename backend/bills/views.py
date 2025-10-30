# views.py
import re
import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from accounts.utils import get_user_wallet
from wallet.models import WalletTransaction
from .utils import purchase_airtime, purchase_data, get_data_plans

logger = logging.getLogger(__name__)
PHONE_REGEX = re.compile(r'^0[7-9][01]\d{8}$')


class BuyAirtimeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get("phone")
        amount = request.data.get("amount")
        network = request.data.get("network")

        if not all([phone, amount, network]):
            return Response({"message": "Missing required fields"}, status=400)

        if not PHONE_REGEX.match(phone):
            return Response({"message": "Invalid phone number"}, status=400)

        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return Response({"message": "Invalid amount"}, status=400)

        try:
            with transaction.atomic():
                wallet = get_user_wallet(request.user)
                if wallet.balance < amount:
                    return Response({"message": "Insufficient balance"}, status=400)

                balance_before = wallet.balance
                wallet.balance -= Decimal(amount)
                wallet.save()

                # Generate VTpass-compliant request_id
                request_id = None  # Let utils generate it

                # Create pending transaction
                tx = WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="airtime",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id="pending",  # Will update after
                    status="pending",
                )

                # Call VTpass
                result = purchase_airtime(phone, amount, network, request_id)

                # Update transaction
                tx.request_id = result["request_id"]
                tx.reference = result["transaction_id"]
                tx.metadata = result["raw"]
                tx.status = "success"
                tx.save()

            return Response({"message": "Airtime purchased successfully"})

        except ValueError as e:
            tx.status = "failed"
            tx.save()
            return Response({"message": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Airtime error: {e}", exc_info=True)
            return Response({"message": "Purchase failed. Try again."}, status=500)


class BuyDataView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get("phone")
        variation_code = request.data.get("variation_code")
        network = request.data.get("network")
        amount = request.data.get("amount")

        if not all([phone, variation_code, network, amount]):
            return Response({"message": "Missing required fields"}, status=400)

        if not PHONE_REGEX.match(phone):
            return Response({"message": "Invalid phone number"}, status=400)

        try:
            amount = float(amount)
        except (ValueError, TypeError):
            return Response({"message": "Invalid amount"}, status=400)

        try:
            with transaction.atomic():
                wallet = get_user_wallet(request.user)
                if wallet.balance < amount:
                    return Response({"message": "Insufficient balance"}, status=400)

                balance_before = wallet.balance
                wallet.balance -= Decimal(amount)
                wallet.save()

                tx = WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="data",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id="pending",
                    status="pending",
                )

                result = purchase_data(phone, amount, network, variation_code)

                tx.request_id = result["request_id"]
                tx.reference = result["transaction_id"]
                tx.metadata = result["raw"]
                tx.status = "success"
                tx.save()

            return Response({"message": "Data purchased successfully"})

        except ValueError as e:
            tx.status = "failed"
            tx.save()
            return Response({"message": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Data error: {e}", exc_info=True)
            return Response({"message": "Purchase failed. Try again."}, status=500)


class DataPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        network = request.query_params.get("network", "").lower()
        if network not in ["mtn", "glo", "airtel", "9mobile"]:
            return Response({"message": "Invalid network"}, status=400)

        try:
            plans = get_data_plans(network)
            return Response({"success": True, "plans": plans})
        except ValueError as e:
            return Response({"success": False, "message": str(e)}, status=503)
        except Exception as e:
            logger.error(f"Error fetching plans: {e}", exc_info=True)
            return Response({"success": False, "message": "Server error"}, status=500)