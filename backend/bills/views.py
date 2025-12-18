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
from .serializers import DataPurchaseSerializer
from .utils import (
    purchase_airtime, purchase_data, get_all_plans, get_data_plans, purchase_cable_tv, 
    purchase_electricity, purchase_education, EDUCATION_SERVICE_ID_MAP, 
    CABLE_TV_SERVICE_ID_MAP, ELECTRICITY_SERVICE_ID_MAP, get_single_plan 
)
from .vtu_ng import get_variations, vtung_purchase_data


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

        tx = None
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
            if tx:
                tx.status = "failed"
                tx.save()
            return Response({"message": str(e)}, status=400)
        except Exception as e:
            logger.error(f"Airtime error: {e}", exc_info=True)
            if tx:
                tx.status = "failed"
                tx.save()
            return Response({"message": "Purchase failed. Try again."}, status=500)


# ===================================================================
# 1. DATA PLANS (VTU.ng categories + VTpass Regular Only)
# ===================================================================
class DataPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        network = request.query_params.get("network", "").lower()

        if network not in ["mtn", "airtel", "glo", "9mobile"]:
            return Response({"message": "Invalid network"}, status=400)

        from .utils import get_plans_by_network
        plans = get_plans_by_network(network)

        ordered = {
            "SME2": plans["SME2"],
            "SME": plans["SME"],
            "GIFTING": plans["GIFTING"],
            "CORPORATE": plans["CORPORATE"],
            "REGULAR": plans["REGULAR"],
        }

        return Response({
            "success": True,
            "network": network.upper(),
            "plans": ordered,
        })




# ===================================================================
# 2. UNIFIED DATA PURCHASE (VTU.ng first → VTpass fallback)
# ===================================================================
class BuyDataView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DataPurchaseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False,
                "message": serializer.errors
            }, status=400)

        phone = serializer.validated_data["phone"]
        variation_id = serializer.validated_data["variation_id"]
        network = serializer.validated_data["network"]
        amount = Decimal(str(serializer.validated_data["amount"]))

        from .utils import get_single_plan
        plan = get_single_plan(network, variation_id)

        if not plan:
            return Response({
                "success": False,
                "message": "Invalid data plan selected."
            }, status=400)

        provider = plan["provider"]
        tx = None  # Safe guard for exception scope

        try:
            with transaction.atomic():
                wallet = get_user_wallet(request.user)

                if wallet.balance < amount:
                    return Response({
                        "success": False,
                        "message": "Insufficient wallet balance."
                    }, status=400)

                balance_before = wallet.balance
                wallet.balance -= amount
                wallet.save()

                # Create pending TX
                tx = WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="debit",
                    category="data",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    status="pending",
                )

                # ---------- PROVIDER ROUTING ----------
                try:
                    if provider == "vtung":
                        result = vtung_purchase_data(phone, variation_id, network)
                    else:
                        result = purchase_data(phone, float(amount), network, variation_id)
                        result["provider"] = "vtpass"

                except Exception as api_error:
                    # API hard error: request timeout, connection dropped, etc.
                    raise Exception(f"Network error contacting provider: {str(api_error)}")

                # --------- HANDLE PROVIDER RESPONSE ----------
                if not result.get("success"):
                    # FAILED RESPONSE FROM PROVIDER (VTU.ng or VTpass)
                    error_msg = result.get("error") or "Provider returned failure."

                    # Rollback TX to failed
                    tx.status = "failed"
                    tx.metadata = result
                    tx.save()

                    # Refund wallet
                    wallet.balance += amount
                    wallet.save()

                    return Response({
                        "success": False,
                        "message": error_msg,   # USER SEES EXACT REASON
                        "provider": provider
                    }, status=400)

                # -------- SUCCESS --------
                tx.request_id = result.get("request_id")
                tx.reference = result.get("transaction_id")
                tx.metadata = result
                tx.status = "success"
                tx.save()

            return Response({
                "success": True,
                "provider": provider,
                "request_id": tx.request_id,
                "message": "Data purchase successful!"
            })

        except Exception as e:
            logger.error(f"BuyDataView FATAL → {e}", exc_info=True)

            # ensure TX exists
            if tx:
                tx.status = "failed"
                tx.save()

            return Response({
                "success": False,
                "message": "We could not complete your purchase. Please try again.",
                "error_details": str(e)[:200]  # sent to UI
            }, status=500)




# ===================================================================
# 3. AIRTIME TO CASH (2025 Must-Have Feature)
# ===================================================================
class AirtimeToCashView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        phone = request.data.get("phone")
        network = request.data.get("network")
        amount = request.data.get("amount")

        if not all([phone, network, amount]):
            return Response({"success": False, "message": "All fields are required."}, status=400)

        if not PHONE_REGEX.match(phone):
            return Response({"success": False, "message": "Invalid phone number."}, status=400)

        try:
            amount = Decimal(str(amount))
            if amount < 100:
                return Response({"success": False, "message": "Minimum amount is ₦100."}, status=400)
        except:
            return Response({"success": False, "message": "Amount must be numeric."}, status=400)

        try:
            from .vtu_ng import purchase_airtime_to_cash

            with transaction.atomic():
                result = purchase_airtime_to_cash(phone, network, float(amount))

                if not result.get("success"):
                    return Response({
                        "success": False,
                        "message": result.get("message") or "Conversion failed.",
                        "provider_error": result
                    }, status=400)

                credit_amount = Decimal(str(result["credited_amount"]))

                wallet = get_user_wallet(request.user)
                balance_before = wallet.balance
                wallet.balance += credit_amount
                wallet.save()

                WalletTransaction.objects.create(
                    user=request.user,
                    wallet=wallet,
                    tx_type="credit",
                    category="airtime_to_cash",
                    amount=credit_amount,
                    balance_before=balance_before,
                    balance_after=wallet.balance,
                    reference=result.get("reference"),
                    metadata=result,
                    description=f"Airtime → Cash ({network.upper()})"
                )

            return Response({
                "success": True,
                "message": f"₦{credit_amount} successfully added to wallet.",
                "credited_amount": credit_amount
            })

        except Exception as e:
            logger.error(f"AirtimeToCashView ERROR → {e}", exc_info=True)
            return Response({
                "success": False,
                "message": "Something went wrong. Try again.",
                "error_details": str(e)[:200]
            }, status=500)
