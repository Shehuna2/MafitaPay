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
    try:
        raw = request.body or b""
        signature = request.headers.get("verif-hash") or request.headers.get("flutterwave-signature")

        if not signature:
            return Response({"error": "missing signature"}, status=400)

        fw = FlutterwaveService()

        if not fw.verify_webhook(raw, signature):
            logger.error("Invalid FLW signature")
            return Response({"error": "invalid signature"}, status=401)

        payload = json.loads(raw.decode())
        event = payload.get("event") or payload.get("type")
        data = payload.get("data", {})

        logger.info("FLW webhook event: %s", event)

        if event not in ("charge.completed", "transfer.completed", "transfer.successful"):
            return Response({"status": "ignored"}, status=200)

        if data.get("status") not in ("successful", "succeeded", "success"):
            return Response({"status": "ignored"}, status=200)

        amount = Decimal(str(data.get("amount", "0")))
        reference = data.get("reference") or data.get("id")

        # Resolve account_number (different FLW formats)
        account_number = (
            data.get("account_number") or
            data.get("destination_account") or
            data.get("receiver_account")
        )

        # bank_transfer structure
        bt = data.get("payment_method", {}).get("bank_transfer", {})
        if not account_number:
            account_number = bt.get("account_display_name")

        if not account_number:
            logger.warning("Missing account_number for FLW credit")
            return Response({"status": "ignored"}, status=200)

        va = VirtualAccount.objects.filter(
            account_number=account_number,
            provider="flutterwave"
        ).select_related("user").first()

        if not va:
            logger.warning("No VA bound to %s", account_number)
            return Response({"status": "ignored"}, status=200)

        wallet, _ = Wallet.objects.get_or_create(user=va.user)

        with transaction.atomic():
            if Deposit.objects.filter(provider_reference=reference).exists():
                return Response({"status": "duplicate"}, status=200)

            Deposit.objects.create(
                user=va.user,
                virtual_account=va,
                amount=amount,
                provider_reference=reference,
                status="credited",
                raw=payload,
            )

            wallet.deposit(
                amount=amount,
                reference=f"flw_{reference}",
                metadata={
                    "provider": "flutterwave",
                    "event": event,
                    "account_number": account_number,
                    "sender_bank": bt.get("originator_bank_name"),
                    "sender_name": bt.get("originator_name"),
                }
            )

        return Response({"status": "success"}, status=200)

    except Exception as e:
        logger.exception("FLW webhook fatal error")
        return Response({"error": "server error"}, status=500)
