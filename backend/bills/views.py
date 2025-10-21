import re
import uuid
import logging
import requests
from io import BytesIO
from django.conf import settings

from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse, HttpResponse

from django.db import transaction
from django.utils import timezone
from django.contrib import messages
from django.template.loader import render_to_string
from django.shortcuts import redirect, render, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.paginator import Paginator
from django.contrib.admin.views.decorators import staff_member_required

from accounts.utils import get_user_wallet
from .utils import purchase_airtime, purchase_data, get_data_plans
from .serializers import AirtimePurchaseSerializer, DataPurchaseSerializer, DataPlansSerializer

from rest_framework.views import APIView
from rest_framework import status
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from wallet.models import WalletTransaction


logger = logging.getLogger(__name__)


PHONE_REGEX = re.compile(r'^0[7-9][0-1]\d{8}$')

class BuyAirtimeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get("phone")
        amount = float(request.data.get("amount", 0))
        network = request.data.get("network")

        if not phone or not amount or not network:
            return Response({"message": "Missing required fields"}, status=400)

        if not PHONE_REGEX.match(phone):
            return Response({"message": "Invalid phone number format"}, status=400)

        req_id = str(uuid.uuid4())

        try:
            with transaction.atomic():
                wallet = get_user_wallet(request.user)

                if wallet.balance < amount:
                    return Response({"message": "Insufficient balance"}, status=400)

                balance_before = wallet.balance
                wallet.balance -= Decimal(amount)
                wallet.save()

                # 🔹 Create transaction record (pending)
                tx = WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="airtime",
                    amount=Decimal(amount),
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id=req_id,
                    status="pending",
                )

                payload = {
                    "request_id": req_id,
                    "serviceID": network,
                    "amount": str(amount),
                    "phone": phone,
                }

                response = requests.post(
                    f"{settings.VTPASS_SANDBOX_URL}pay",
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "api-key": settings.VTPASS_API_KEY,
                        "secret-key": settings.VTPASS_SECRET_KEY,
                    },
                    timeout=30,
                )

                response.raise_for_status()
                data = response.json()
                tx.metadata = data
                logger.info(f"VTpass airtime response: {data}")

                if data.get("code") != "000":
                    tx.status = "failed"
                    tx.save()
                    detail = data.get("response_description") or "Transaction failed"
                    extra = (
                        data.get("content", {})
                            .get("transactions", {})
                            .get("status")
                    )
                    return Response(
                        {"message": f"Airtime purchase failed: {detail}", "raw": data},
                        status=400
                    )

                # 🔹 Mark transaction as success
                tx.status = "success"
                tx.reference = (
                    data.get("content", {})
                        .get("transactions", {})
                        .get("transactionId")
                    or data.get("requestId")
                    or req_id
                )
                tx.save()

            return Response({"message": "Airtime purchase successful"})
        except Exception as e:
            logger.error(f"Airtime error: {str(e)}", exc_info=True)
            return Response({"message": f"Airtime purchase failed: {str(e)}"}, status=400)

class BuyDataView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get("phone")
        variation_code = request.data.get("variation_code")
        network = request.data.get("network")
        amount = request.data.get("amount")

        if not phone or not variation_code or not network or not amount:
            return Response({"message": "Missing required fields"}, status=400)

        if not PHONE_REGEX.match(phone):
            return Response({"message": "Invalid phone number format"}, status=400)

        req_id = str(uuid.uuid4())

        try:
            with transaction.atomic():
                wallet = get_user_wallet(request.user)
                amount = float(amount)

                if wallet.balance < amount:
                    return Response({"message": "Insufficient balance"}, status=400)

                balance_before = wallet.balance
                wallet.balance -= Decimal(amount)
                wallet.save()

                # 🔹 Create transaction record (pending)
                tx = WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="data",
                    amount=Decimal(amount),
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id=req_id,
                    status="pending",
                )

                payload = {
                    "request_id": req_id,
                    "serviceID": f"{network}-data",
                    "variation_code": variation_code,
                    "amount": str(amount),
                    "phone": phone,
                }

                response = requests.post(
                    f"{settings.VTPASS_SANDBOX_URL}pay",
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "api-key": settings.VTPASS_API_KEY,
                        "secret-key": settings.VTPASS_SECRET_KEY,
                    },
                    timeout=30,
                )

                response.raise_for_status()
                data = response.json()
                tx.metadata = data
                logger.info(f"VTpass data response: {data}")

                if data.get("code") != "000":
                    tx.status = "failed"
                    tx.save()
                    detail = data.get("response_description") or "Transaction failed"
                    extra = (
                        data.get("content", {})
                            .get("transactions", {})
                            .get("status")
                    )
                    return Response(
                        {"message": f"Data purchase failed: {detail}", "raw": data},
                        status=400
                    )

                # 🔹 Mark transaction as success
                tx.status = "success"
                tx.reference = (
                    data.get("content", {})
                        .get("transactions", {})
                        .get("transactionId")
                    or data.get("requestId")
                    or req_id
                )
                tx.save()

            return Response({"message": "Data purchase successful"})
        except Exception as e:
            logger.error(f"Data error: {str(e)}", exc_info=True)
            return Response({"message": f"Data purchase failed: {str(e)}"}, status=400)

class DataPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        network = request.query_params.get("network", "").lower()
        if network not in ["mtn", "glo", "airtel", "9mobile"]:
            return Response(
                {"success": False, "message": "Invalid network"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            plans = get_data_plans(network)
            return Response({"success": True, "plans": plans}, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"success": False, "message": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error fetching data plans: {e}", exc_info=True)
            return Response(
                {"success": False, "message": "An unexpected error occurred"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )