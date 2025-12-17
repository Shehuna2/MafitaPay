# File: wallet/views/webhooks.py
import json
import base64
import hmac
import hashlib
import logging
from decimal import Decimal
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import VirtualAccount, Wallet, Deposit
from accounts.models import User

from .services.flutterwave_service import FlutterwaveService

logger = logging.getLogger(__name__)

# --------------------------------------------------------------
# Helper: Make any object JSON-serializable (convert set → list)
# --------------------------------------------------------------
def clean_for_json(obj):
    """Recursively convert sets, non-serializable objects to JSON-safe types."""
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean_for_json(i) for i in obj]
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    # Fallback: convert anything else to string
    return str(obj)


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def flutterwave_webhook(request):
    """
    Flutterwave v4 Webhook Handler — secure + idempotent + fixed transaction ID.
    """
    try:
        raw = request.body or b""
        signature = request.headers.get("verif-hash")  # REQUIRED HEADER

        if not signature:
            logger.warning("Missing Flutterwave verif-hash header")
            return Response({"error": "missing signature"}, status=400)

        # Use live credentials when not in DEBUG mode
        fw_service = FlutterwaveService(use_live=not settings.DEBUG)

        # Verify authenticity
        if not fw_service.verify_webhook_signature(raw, signature):
            logger.error("Invalid Flutterwave webhook signature")
            return Response({"error": "invalid signature"}, status=401)

        payload = json.loads(raw.decode("utf-8") or "{}")
        event = payload.get("event") or payload.get("event_type") or payload.get("type")
        data = payload.get("data", {}) or payload

        logger.info("FLW webhook event: %s", event)
        logger.debug("FLW webhook full payload: %s", json.dumps(payload, default=str)[:500])

        # Allowed events
        if event not in (
            "charge.completed",
            "transfer.completed",
            "transfer.successful",
            "virtualaccount.payment.completed",
        ):
            return Response({"status": "ignored"}, status=200)

        status_text = (data.get("status") or "").lower()
        if status_text not in ("success", "successful", "succeeded"):
            return Response({"status": "ignored"}, status=200)

        amount = Decimal(str(data.get("amount", "0")))
        if amount <= 0:
            return Response({"status": "ignored"}, status=200)

        # FIX: Transaction ID fallback
        provider_ref = (
            str(data.get("id"))
            or str(data.get("flw_ref"))
            or str(data.get("reference"))
        )
        if not provider_ref or provider_ref == "None":
            logger.error("Missing Flutterwave reference in payload: %s", data)
            return Response({"status": "ignored"}, status=200)

        # Resolve VA account number - Flutterwave v4 uses various field structures
        account_number = (
            data.get("account_number")
            or data.get("destination_account")
            or data.get("receiver_account")
            or data.get("credited_account")
        )

        # Check for nested account information in payment details
        if not account_number and data.get("payment_details"):
            payment_details = data.get("payment_details", {})
            account_number = (
                payment_details.get("account_number")
                or payment_details.get("destination_account")
            )

        # Check meta field
        if not account_number and data.get("meta"):
            meta = data.get("meta", {})
            account_number = meta.get("account_number") or meta.get("beneficiary_account_number")

        # Extract bank transfer info - Flutterwave v4 structure
        # Check multiple possible locations for originator info
        bt = {}
        if data.get("payment_method"):
            bt = data.get("payment_method", {}).get("bank_transfer", {})
        
        # Fallback: check if transfer details are directly in data
        if not bt and data.get("transfer_details"):
            bt = data.get("transfer_details", {})
        
        # Another common structure in FW v4
        if not bt:
            bt = {
                "originator_name": data.get("sender_name") or data.get("customer_name") or data.get("originator_name"),
                "originator_bank_name": data.get("sender_bank") or data.get("originator_bank"),
                "originator_account_number": data.get("sender_account") or data.get("originator_account"),
            }

        # Fallback: Try to find VA by reference
        if not account_number and data.get("reference"):
            va_fallback = VirtualAccount.objects.filter(
                provider_account_id=data.get("reference"),
                provider="flutterwave",
            ).first()
            if va_fallback:
                account_number = va_fallback.account_number
                logger.info("Found VA by reference fallback: %s", account_number)

        if not account_number:
            logger.warning("No account number found in FLW webhook. Data keys: %s", list(data.keys()))
            return Response({"status": "ignored"}, status=200)

        va = VirtualAccount.objects.filter(
            account_number=account_number,
            provider="flutterwave",
        ).select_related("user").first()

        if not va:
            logger.warning("No VA found for account_number=%s, provider=flutterwave", account_number)
            return Response({"status": "ignored"}, status=200)

        user = va.user
        if not user:
            logger.error("VirtualAccount %s has no user!", va.id)
            return Response({"status": "ignored"}, status=200)

        wallet, _ = Wallet.objects.get_or_create(user=user)

        # IDEMPOTENT HANDLING
        with transaction.atomic():
            existing = Deposit.objects.select_for_update().filter(
                provider_reference=provider_ref
            ).first()

            metadata = clean_for_json({
                "provider": "flutterwave",
                "event": event,
                "account_number": account_number,
                "sender_name": bt.get("originator_name"),
                "sender_bank": bt.get("originator_bank_name"),
                "sender_account_number": bt.get("originator_account_number"),
                "flutterwave_id": provider_ref,
            })

            if existing:
                logger.info("Duplicate deposit detected for ref=%s, status=%s", provider_ref, existing.status)
                if existing.status != "credited":
                    logger.info("Attempting to credit existing non-credited deposit for user=%s, amount=₦%s", user.email, amount)
                    if wallet.deposit(amount, f"flw_{provider_ref}", metadata):
                        existing.status = "credited"
                        existing.save(update_fields=["status"])
                        logger.info("Successfully recovered and credited deposit for user=%s", user.email)
                        return Response({"status": "recovered"}, status=200)
                    else:
                        logger.error("Failed to credit recovered deposit for user=%s, ref=%s", user.email, provider_ref)
                        return Response({"status": "deposit_failed"}, status=500)
                return Response({"status": "already_processed"}, status=200)

            # New deposit
            logger.info("Processing new deposit: user=%s, amount=₦%s, ref=%s", user.email, amount, provider_ref)
            if not wallet.deposit(amount, f"flw_{provider_ref}", metadata):
                logger.error("Wallet deposit failed for user=%s, amount=₦%s, ref=%s", user.email, amount, provider_ref)
                return Response({"status": "deposit_failed"}, status=500)

            Deposit.objects.create(
                user=user,
                virtual_account=va,
                amount=amount,
                provider_reference=provider_ref,
                status="credited",
                raw=payload
            )

        logger.info("Flutterwave deposit success → ₦%s | user=%s | ref=%s", amount, user.email, provider_ref)
        return Response({"status": "success"}, status=200)

    except Exception:
        logger.exception("FATAL ERROR in Flutterwave webhook")
        return Response({"error": "server error"}, status=500)


@csrf_exempt
def paystack_webhook(request):
    # unchanged (kept as-is)
    try:
        payload = request.body
        received_sig = request.headers.get("x-paystack-signature", "")

        computed_sig = hmac.new(
            settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
            payload,
            hashlib.sha512
        ).hexdigest()

        if not hmac.compare_digest(computed_sig, received_sig):
            logger.warning("Invalid Paystack webhook signature")
            return HttpResponse(status=400)

        event_data = json.loads(payload)
        event_type = event_data.get("event")
        data = event_data.get("data", {})

        logger.info("Paystack event: %s", event_type)

        if event_type == "dedicatedaccount.assign":
            customer_email = data.get("customer", {}).get("email")
            bank_info = data.get("bank", {})
            account_number = data.get("account_number")
            bank_name = bank_info.get("name")

            user = User.objects.filter(email=customer_email).first()
            if not user:
                logger.error("No user for email %s", customer_email)
                return HttpResponse(status=404)

            va, created = VirtualAccount.objects.update_or_create(
                user=user,
                defaults={
                    "account_number": account_number,
                    "bank_name": bank_name,
                    "provider": "paystack",
                    "assigned": True,
                },
            )

            profile = getattr(user, "profile", None)
            if profile:
                profile.account_no = account_number
                profile.bank_name = bank_name
                profile.save(update_fields=["account_no", "bank_name"])

            logger.info("DVA assigned: %s -> %s", user.email, account_number)

        elif event_type == "charge.success":
            amount_kobo = data.get("amount", 0)
            try:
                amount = Decimal(int(amount_kobo) / 100)
            except Exception:
                amount = Decimal("0")

            account_number = data.get("authorization", {}).get("account_number")
            customer_email = data.get("customer", {}).get("email")

            user = None
            if account_number:
                va = VirtualAccount.objects.filter(account_number=account_number).first()
                if va:
                    user = va.user
            if not user and customer_email:
                user = User.objects.filter(email=customer_email).first()

            if not user:
                logger.error("No user found for charge.success (%s)", customer_email)
                return HttpResponse(status=404)

            wallet, _ = Wallet.objects.get_or_create(user=user)
            wallet.balance = (wallet.balance or Decimal("0")) + amount
            wallet.save(update_fields=["balance"])
            logger.info("Credited %s to %s via Paystack", amount, user.email)

        else:
            logger.info("Ignored Paystack event: %s", event_type)

        return HttpResponse(status=200)

    except Exception as e:
        logger.exception("Paystack webhook error")
        return HttpResponse(status=500)


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def psb_webhook(request):
    try:
        data = request.data
        logger.info("Received 9PSB webhook: %s", json.dumps(data))
        account_number = str(data.get("account_number", "")).strip()
        amount = Decimal(str(data.get("amount", "0")))
        transaction_ref = data.get("transaction_reference")

        if not account_number or amount <= 0:
            logger.warning("Invalid 9PSB payload")
            return Response({"status": "invalid"}, status=400)

        va = VirtualAccount.objects.filter(account_number=account_number, provider="9psb").select_related("user").first()
        if not va or not va.user:
            logger.warning("No VA for 9PSB account %s", account_number)
            return Response({"status": "not_found"}, status=404)

        wallet, _ = Wallet.objects.get_or_create(user=va.user)

        with transaction.atomic():
            if not Deposit.objects.filter(provider_reference=transaction_ref).exists():
                Deposit.objects.create(
                    user=va.user,
                    virtual_account=va,
                    amount=amount,
                    provider_reference=transaction_ref,
                    status="credited",
                    raw=data,
                    created_at=timezone.now(),
                )
                wallet.balance = (wallet.balance or Decimal("0")) + amount
                wallet.save(update_fields=["balance"])
                logger.info("Credited %s to %s via 9PSB", amount, va.user.email)
            else:
                logger.info("Duplicate 9PSB txn ignored: %s", transaction_ref)

        return Response({"status": "success"}, status=200)
    except Exception as e:
        logger.exception("9PSB webhook processing error")
        return Response({"status": "error", "message": str(e)}, status=500)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
