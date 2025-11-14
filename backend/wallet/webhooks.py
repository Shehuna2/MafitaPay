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


@csrf_exempt
def paystack_webhook(request):
    # unchanged except defensive parsing (kept as-is)
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
            # Ideally create a transaction record first; here we simply update
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

        # Idempotency: if a Deposit with same provider_reference exists, ignore
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
def flutterwave_webhook(request):
    """
    Accepts Flutterwave v4 webhooks. Verifies HMAC-SHA256 (base64).
    """
    try:
        raw = request.body or b""
        # check both modern and legacy header names
        signature = request.headers.get("flutterwave-signature") or request.headers.get("verif-hash") or ""
        if not signature:
            logger.warning("Missing Flutterwave signature header")
            return Response({"error": "missing signature"}, status=400)

        # Determine which secret to use (prefer live if set)
        # Try test then live to cover both configs; prefer explicit env naming.
        fw_service = FlutterwaveService(use_live=True)
        secrets_to_try = [fw_service.hash_secret, getattr(settings, "FLW_TEST_HASH_SECRET", None), getattr(settings, "FLW_LIVE_HASH_SECRET", None), getattr(settings, "FLW_HASH_SECRET", None)]
        verified = False
        for secret in filter(None, secrets_to_try):
            try:
                dig = hmac.new(secret.encode(), raw, hashlib.sha256).digest()
                expected_b64 = base64.b64encode(dig).decode()
                if hmac.compare_digest(expected_b64, signature):
                    verified = True
                    break
            except Exception:
                continue

        if not verified:
            logger.error("Invalid Flutterwave webhook signature")
            return Response({"error": "invalid signature"}, status=401)

        payload = json.loads(raw.decode("utf-8") or "{}")
        logger.info("Flutterwave webhook payload: %s", payload)

        # v4 events vary; try common patterns
        event = payload.get("event") or payload.get("event_type") or payload.get("type")
        data = payload.get("data", {}) or payload

        # Example: transfer.completed OR transfer.successful patterns
        # normalized fields
        status = data.get("status") or data.get("transaction_status") or ""
        # handle transfers to virtual accounts that completed successfully
        if (event and "transfer" in event and status in ("successful", "success")) or (data.get("type") == "transfer.completed" and data.get("status") == "successful"):
            ref = data.get("reference") or data.get("tx_ref") or data.get("transaction_reference")
            account_number = data.get("account_number") or data.get("destination_account") or data.get("receiver_account")
            amount = Decimal(str(data.get("amount", "0")))

            if not account_number:
                logger.warning("No account_number in webhook data; ignoring")
                return Response({"status": "ignored"}, status=200)

            va = VirtualAccount.objects.filter(account_number=account_number, provider="flutterwave").select_related("user").first()
            if not va:
                logger.warning("No VA found for account %s", account_number)
                return Response({"status": "ignored"}, status=200)

            wallet = Wallet.objects.get(user=va.user)

            with transaction.atomic():
                # idempotency: ensure provider_reference not processed
                provider_ref = ref or (data.get("id") or "")
                if not Deposit.objects.filter(provider_reference=provider_ref).exists():
                    Deposit.objects.create(
                        user=va.user,
                        virtual_account=va,
                        amount=amount,
                        provider_reference=provider_ref,
                        status="credited",
                        raw=payload,
                        created_at=timezone.now(),
                    )
                    wallet.balance = (wallet.balance or Decimal("0")) + amount
                    wallet.save(update_fields=["balance"])
                    logger.info("Credited %s to %s via Flutterwave webhook", amount, va.user.email)
                else:
                    logger.info("Duplicate Flutterwave webhook ignored: %s", provider_ref)

            return Response({"status": "success"}, status=200)

        logger.info("Unhandled Flutterwave event: %s", event)
        return Response({"status": "ignored"}, status=200)

    except Exception as e:
        logger.exception("Error processing Flutterwave webhook")
        return Response({"error": "internal error"}, status=500)
