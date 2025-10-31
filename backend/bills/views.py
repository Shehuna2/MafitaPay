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
from .utils import (
    purchase_airtime, purchase_data, get_data_plans, purchase_cable_tv, 
    purchase_electricity, purchase_education, get_bill_variations, EDUCATION_SERVICE_ID_MAP, 
    CABLE_TV_SERVICE_ID_MAP, ELECTRICITY_SERVICE_ID_MAP
)


logger = logging.getLogger(__name__)
PHONE_REGEX = re.compile(r'^0[7-9][01]\d{8}$')

# New Views for Bills

class BuyCableTVView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        decoder_number = request.data.get("decoder_number")
        variation_code = request.data.get("variation_code", "")
        network = request.data.get("network")  # dstv, gotv, startimes
        phone = request.data.get("phone", "")
        amount = request.data.get("amount")
        subscription_type = request.data.get("subscription_type", "change")  # change | renew

        # === Validation ===
        if not all([decoder_number, network]):
            return Response({"message": "Missing required fields"}, status=400)

        if not re.match(r'^\d{10}$', decoder_number):
            return Response({"message": "Decoder number must be 10 digits"}, status=400)

        if network.lower() not in CABLE_TV_SERVICE_ID_MAP:
            return Response({"message": "Invalid TV network"}, status=400)

        if subscription_type not in ["change", "renew"]:
            return Response({"message": "subscription_type must be 'change' or 'renew'"}, status=400)

        try:
            amount = float(amount)
            if amount <= 0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response({"message": "Valid amount is required"}, status=400)

        if subscription_type == "change" and not variation_code:
            return Response({"message": "variation_code required for 'change'"}, status=400)

        # === Wallet & Transaction ===
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
                    category="cable_tv",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id="pending",
                    status="pending",
                )

                # === Call VTpass ===
                result = purchase_cable_tv(
                    decoder_number=decoder_number,
                    network=network,
                    variation_code=variation_code if subscription_type == "change" else None,
                    amount=amount,                     # ← Always required
                    phone=phone,
                    subscription_type=subscription_type,
                )

                # === Success ===
                tx.request_id = result["request_id"]
                tx.reference = result["transaction_id"]
                tx.metadata = result["raw"]
                tx.status = "success"
                tx.save()

            return Response({"message": "Cable TV subscription purchased successfully"})

        except ValueError as e:
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": str(e)}, status=400)

        except Exception as e:
            logger.error(f"Cable TV error: {e}", exc_info=True)
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": "Purchase failed. Try again."}, status=500)


class BuyElectricityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        meter_number = request.data.get("meter_number")
        disco = request.data.get("disco")  # e.g., "ikeja"
        amount = request.data.get("amount")
        phone = request.data.get("phone", "")

        if not all([meter_number, disco, amount]):
            return Response({"message": "Missing required fields"}, status=400)

        # Validate meter (11 digits)
        if not re.match(r'^\d{11}$', meter_number):
            return Response({"message": "Invalid meter number"}, status=400)

        if disco.lower() not in ELECTRICITY_SERVICE_ID_MAP:
            return Response({"message": "Invalid DISCO"}, status=400)

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
                    category="electricity",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id="pending",
                    status="pending",
                )

                result = purchase_electricity(meter_number, disco, amount, phone)

                tx.request_id = result["request_id"]
                tx.reference = result["transaction_id"]
                tx.metadata = result["raw"]
                tx.status = "success"
                tx.save()

            return Response({"message": "Electricity bill paid successfully"})

        except ValueError as e:
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Electricity error: {e}", exc_info=True)
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": "Payment failed. Try again."}, status=500)


class BuyEducationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        pin = request.data.get("pin")
        exam_type = request.data.get("exam_type")  # waec, neco, jamb
        amount = request.data.get("amount")
        phone = request.data.get("phone", "")

        if not all([pin, exam_type, amount]):
            return Response({"message": "Missing required fields"}, status=400)

        if exam_type.lower() not in EDUCATION_SERVICE_ID_MAP:
            return Response({"message": "Invalid exam type"}, status=400)

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
                    category="education",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    request_id="pending",
                    status="pending",
                )

                result = purchase_education(pin, exam_type, amount, phone)

                tx.request_id = result["request_id"]
                tx.reference = result["transaction_id"]
                tx.metadata = result["raw"]
                tx.status = "success"
                tx.save()

            return Response({"message": "Education scratch card purchased successfully"})

        except ValueError as e:
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Education error: {e}", exc_info=True)
            if 'tx' in locals():
                tx.status = "failed"
                tx.save()
            return Response({"message": "Purchase failed. Try again."}, status=500)


# views.py
class BillVariationsView(APIView):
    permission_classes = [IsAuthenticated]

    # Map user input → VTpass serviceID
    SERVICE_ID_MAP = {
        # Cable TV
        "dstv": "dstv",
        "gotv": "gotv",
        "startimes": "startimes",
        # Electricity (use full serviceID or key)
        "ikeja": "ikdc-prepaid",
        "abuja": "aedc-prepaid",
        "ibadan": "ibd-prepaid",
        "enugu": "enugu-prepaid",
        "kaduna": "kaduna-prepaid",
        "kano": "kano-prepaid",
        "jos": "jos-prepaid",
        "portharcourt": "phcn-prepaid",
        # Education
        "waec": "waec",
        "neco": "neco",
        "jamb": "jamb",
    }

    def get(self, request):
        service_type = request.query_params.get("service_type", "").lower().strip()
        if not service_type:
            return Response({"message": "service_type is required"}, status=400)

        service_id = self.SERVICE_ID_MAP.get(service_type)
        if not service_id:
            return Response({"message": f"Invalid service_type: {service_type}"}, status=400)

        try:
            variations = get_bill_variations(service_id)
            return Response({"success": True, "variations": variations})
        except ValueError as e:
            logger.error(f"Variations error for {service_id}: {e}")
            return Response({"success": False, "message": str(e)}, status=503)
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return Response({"success": False, "message": "Server error"}, status=500)

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