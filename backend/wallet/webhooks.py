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
from .services.palmpay_service import PalmpayService

logger = logging.getLogger(__name__)

# Security Constants
MAX_WEBHOOK_SIZE = 1024 * 1024  # 1MB - Maximum webhook payload size to prevent DoS
MAX_AMOUNT = Decimal("10000000")  # 10M NGN - Maximum transaction amount

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
        # SECURITY: Limit payload size to prevent DoS attacks
        raw = request.body or b""
        
        if len(raw) > MAX_WEBHOOK_SIZE:
            logger.warning(
                "Webhook payload too large: %d bytes (max: %d)",
                len(raw), MAX_WEBHOOK_SIZE
            )
            return Response({"error": "payload too large"}, status=413)
        
        # Check multiple header variations for signature
        # Django's request.headers is case-insensitive, but we check common variants
        # as well as Django's META format for completeness
        # Flutterwave may use different header names depending on their version
        signature = (
            request.headers.get("verif-hash")
            or request.headers.get("x-verif-hash")
            or request.headers.get("Flutterwave-Signature")
            or request.META.get("HTTP_VERIF_HASH")
            or request.META.get("HTTP_X_VERIF_HASH")
            or request.META.get("HTTP_FLUTTERWAVE_SIGNATURE")
        )

        if not signature:
            logger.warning(
                "Missing Flutterwave verif-hash header in the above logged headers"
            )
            return Response({"error": "missing signature"}, status=400)


        fw_service = FlutterwaveService(use_live=True)

        # SECURITY: Validate hash secret is configured
        if not fw_service.hash_secret:
            logger.error(
                "CRITICAL: Flutterwave hash secret not configured. "
                "Cannot verify webhook. Environment: LIVE"
            )
            return Response({"error": "configuration error"}, status=500)

        # Verify authenticity
        if not fw_service.verify_webhook_signature(raw, signature):
            logger.error("Invalid Flutterwave webhook signature")
            return Response({"error": "invalid signature"}, status=401)

        payload = json.loads(raw.decode("utf-8") or "{}")
        event = payload.get("event") or payload.get("event_type") or payload.get("type")
        data = payload.get("data", {}) or payload

        # SECURITY: Log without exposing sensitive data
        logger.info(
            "Flutterwave webhook received: event=%s, body_length=%d",
            event or "unknown",
            len(raw)
        )

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

        # SECURITY: Validate amount is positive and within reasonable limits
        amount = Decimal(str(data.get("amount", "0")))
        if amount <= 0 or amount > MAX_AMOUNT:
            logger.warning(
                "Invalid or excessive amount in webhook: %s (max: %s)",
                amount, MAX_AMOUNT
            )
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

        # Resolve VA account number
        account_number = (
            data.get("account_number")
            or data.get("destination_account")
            or data.get("receiver_account")
        )

        # FW bank transfer payload
        bt = data.get("payment_method", {}).get("bank_transfer", {})

        if not account_number:
            account_number = data.get("meta", {}).get("account_number")

        if not account_number and data.get("reference"):
            va_fallback = VirtualAccount.objects.filter(
                provider_account_id=data.get("reference"),
                provider="flutterwave",
            ).first()
            if va_fallback:
                account_number = va_fallback.account_number

        if not account_number:
            return Response({"status": "ignored"}, status=200)

        va = VirtualAccount.objects.filter(
            account_number=account_number,
            provider="flutterwave",
        ).select_related("user").first()

        if not va:
            return Response({"status": "ignored"}, status=200)

        user = va.user
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
                if existing.status != "credited":
                    if wallet.deposit(amount, f"flw_{provider_ref}", metadata):
                        existing.status = "credited"
                        existing.save(update_fields=["status"])
                        return Response({"status": "recovered"}, status=200)
                return Response({"status": "already_processed"}, status=200)

            # New deposit
            if not wallet.deposit(amount, f"flw_{provider_ref}", metadata):
                return Response({"status": "deposit_failed"}, status=500)

            Deposit.objects.create(
                user=user,
                virtual_account=va,
                amount=amount,
                provider_reference=provider_ref,
                status="credited",
                raw=payload
            )

        logger.info("Flutterwave deposit success → ₦%s | user=%s", amount, user.email)
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


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def palmpay_webhook(request):
    """
    PalmPay Webhook Handler — secure + idempotent deposit processing.
    """
    try:
        # SECURITY: Limit payload size to prevent DoS attacks
        raw = request.body or b""
        
        if len(raw) > MAX_WEBHOOK_SIZE:
            logger.warning(
                "PalmPay webhook payload too large: %d bytes (max: %d)",
                len(raw), MAX_WEBHOOK_SIZE
            )
            return Response({"error": "payload too large"}, status=413)
        
        # Get signature and timestamp from headers
        signature = (
            request.headers.get("X-Signature")
            or request.headers.get("x-signature")
            or request.META.get("HTTP_X_SIGNATURE")
        )
        
        timestamp = (
            request.headers.get("X-Timestamp")
            or request.headers.get("x-timestamp")
            or request.META.get("HTTP_X_TIMESTAMP")
        )

        if not signature or not timestamp:
            logger.warning("Missing PalmPay webhook signature or timestamp")
            return Response({"error": "missing signature or timestamp"}, status=400)

        palmpay_service = PalmpayService(use_live=not settings.DEBUG)

        # SECURITY: Validate private key is configured
        if not palmpay_service.private_key:
            env_label = "LIVE" if not settings.DEBUG else "TEST"
            logger.error(
                "CRITICAL: PalmPay private key not configured. "
                "Cannot verify webhook. Environment: %s", env_label
            )
            return Response({"error": "configuration error"}, status=500)

        # Verify authenticity
        if not palmpay_service.verify_webhook_signature(raw, signature, timestamp):
            logger.error("Invalid PalmPay webhook signature")
            return Response({"error": "invalid signature"}, status=401)

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error("Failed to decode PalmPay webhook payload: %s", str(e))
            return Response({"error": "invalid payload"}, status=400)
            
        event = payload.get("event") or payload.get("eventType") or payload.get("type")
        data = payload.get("data", {}) or payload

        # SECURITY: Log without exposing sensitive data
        logger.info(
            "PalmPay webhook received: event=%s, body_length=%d",
            event or "unknown",
            len(raw)
        )

        # Allowed events - adjust based on PalmPay's actual event types
        if event not in (
            "VIRTUAL_ACCOUNT_PAYMENT",
            "PAYMENT_SUCCESS",
            "payment.success",
            "virtualaccount.payment",
        ):
            logger.info("PalmPay webhook event ignored: %s", event)
            return Response({"status": "ignored"}, status=200)

        # Check payment status
        status_text = (data.get("status") or "").upper()
        if status_text not in ("SUCCESS", "SUCCESSFUL", "COMPLETED"):
            logger.info("PalmPay webhook status ignored: %s", status_text)
            return Response({"status": "ignored"}, status=200)

        # SECURITY: Validate amount is positive and within reasonable limits
        amount = Decimal(str(data.get("amount", "0")))
        if amount <= 0 or amount > MAX_AMOUNT:
            logger.warning(
                "Invalid or excessive amount in PalmPay webhook: %s (max: %s)",
                amount, MAX_AMOUNT
            )
            return Response({"status": "ignored"}, status=200)

        # Get transaction reference - check for None before converting to string
        provider_ref = (
            data.get("transactionId")
            or data.get("transaction_id")
            or data.get("reference")
            or data.get("paymentReference")
        )
        if not provider_ref:
            logger.error("Missing PalmPay reference in payload: %s", data)
            return Response({"status": "ignored"}, status=200)
        
        provider_ref = str(provider_ref)

        # Resolve VA account number
        account_number = (
            data.get("accountNumber")
            or data.get("account_number")
            or data.get("receiverAccount")
            or data.get("receiver_account")
        )

        if not account_number:
            logger.error("Missing account number in PalmPay webhook: %s", data)
            return Response({"status": "ignored"}, status=200)

        # Find virtual account
        va = VirtualAccount.objects.filter(
            account_number=account_number,
            provider="palmpay",
        ).select_related("user").first()

        if not va:
            logger.warning(
                "PalmPay webhook: No virtual account found for account number %s",
                account_number
            )
            return Response({"status": "ignored"}, status=200)

        user = va.user
        wallet, _ = Wallet.objects.get_or_create(user=user)

        # IDEMPOTENT HANDLING
        with transaction.atomic():
            existing = Deposit.objects.select_for_update().filter(
                provider_reference=provider_ref
            ).first()

            metadata = clean_for_json({
                "provider": "palmpay",
                "event": event,
                "account_number": account_number,
                "sender_name": data.get("senderName") or data.get("sender_name"),
                "sender_account": data.get("senderAccount") or data.get("sender_account"),
                "palmpay_id": provider_ref,
            })

            if existing:
                if existing.status != "credited":
                    if wallet.deposit(amount, f"palmpay_{provider_ref}", metadata):
                        existing.status = "credited"
                        existing.save(update_fields=["status"])
                        logger.info(
                            "PalmPay deposit recovered → ₦%s | user=%s",
                            amount, user.email
                        )
                        return Response({"status": "recovered"}, status=200)
                logger.info(
                    "PalmPay deposit already processed: ref=%s",
                    provider_ref
                )
                return Response({"status": "already_processed"}, status=200)

            # New deposit
            if not wallet.deposit(amount, f"palmpay_{provider_ref}", metadata):
                logger.error(
                    "PalmPay deposit failed to credit wallet: ref=%s, user=%s",
                    provider_ref, user.email
                )
                return Response({"status": "deposit_failed"}, status=500)

            Deposit.objects.create(
                user=user,
                virtual_account=va,
                amount=amount,
                provider_reference=provider_ref,
                status="credited",
                raw=payload
            )

        logger.info("PalmPay deposit success → ₦%s | user=%s", amount, user.email)
        return Response({"status": "success"}, status=200)

    except Exception:
        logger.exception("FATAL ERROR in PalmPay webhook")
        return Response({"error": "server error"}, status=500)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
