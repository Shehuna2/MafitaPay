import json
import hmac
import hashlib
import logging
from decimal import Decimal
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from .models import VirtualAccount, Wallet
from accounts.models import UserProfile, User

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response




logger = logging.getLogger(__name__)


@csrf_exempt
def paystack_webhook(request):
    """
    Handles Paystack webhook events securely.
    Supported events:
      - dedicatedaccount.assign
      - charge.success
    """
    try:
        payload = request.body
        received_sig = request.headers.get("x-paystack-signature", "")

        # ✅ Verify webhook authenticity
        computed_sig = hmac.new(
            settings.PAYSTACK_SECRET_KEY.encode("utf-8"),
            payload,
            hashlib.sha512
        ).hexdigest()

        if not hmac.compare_digest(computed_sig, received_sig):
            logger.warning("⚠️ Invalid Paystack webhook signature")
            return HttpResponse(status=400)

        event_data = json.loads(payload)
        event_type = event_data.get("event")
        data = event_data.get("data", {})

        logger.info(f"📦 Paystack event received: {event_type}")

        # ----------------------------------------------------------------------
        # 🧩 1️⃣ Handle DVA Assignment (dedicatedaccount.assign)
        # ----------------------------------------------------------------------
        if event_type == "dedicatedaccount.assign":
            customer_email = data.get("customer", {}).get("email")
            bank_info = data.get("bank", {})
            account_number = data.get("account_number")
            bank_name = bank_info.get("name")

            user = User.objects.filter(email=customer_email).first()
            if not user:
                logger.error(f"❌ No user found for email {customer_email}")
                return HttpResponse(status=404)

            # Update or create VirtualAccount
            va, created = VirtualAccount.objects.update_or_create(
                user=user,
                defaults={
                    "account_number": account_number,
                    "bank_name": bank_name,
                    "provider": "paystack",
                },
            )

            # Sync with UserProfile for convenience
            profile = getattr(user, "profile", None)
            if profile:
                profile.account_no = account_number
                profile.bank_name = bank_name
                profile.save()

            logger.info(f"✅ DVA assigned to {user.email} - {bank_name} ({account_number})")

        # ----------------------------------------------------------------------
        # 🧩 2️⃣ Handle Successful Payment (charge.success)
        # ----------------------------------------------------------------------
        elif event_type == "charge.success":
            amount_kobo = data.get("amount", 0)
            amount = int(amount_kobo) / 100  # Convert from kobo to naira
            customer_email = data.get("customer", {}).get("email")

            # Sometimes Paystack sends account_number under authorization
            account_number = data.get("authorization", {}).get("account_number")

            user = None
            va = None

            if account_number:
                va = VirtualAccount.objects.filter(account_number=account_number).first()
                if va:
                    user = va.user
            else:
                user = User.objects.filter(email=customer_email).first()

            if not user:
                logger.error(f"❌ No user found for charge.success event ({customer_email})")
                return HttpResponse(status=404)

            # Credit the user's wallet
            wallet = getattr(user, "wallet", None)
            if not wallet:
                wallet = Wallet.objects.create(user=user, balance=0)

            wallet.balance += amount
            wallet.save()

            logger.info(f"💰 Credited ₦{amount} to {user.email} via DVA {account_number}")

        # ----------------------------------------------------------------------
        # 🧩 3️⃣ Ignore other events for now
        # ----------------------------------------------------------------------
        else:
            logger.info(f"ℹ️ Ignored unsupported event type: {event_type}")

        return HttpResponse(status=200)

    except Exception as e:
        logger.error(f"❌ Webhook processing error: {str(e)}", exc_info=True)
        return HttpResponse(status=500)


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def psb_webhook(request):
    """
    Handles incoming 9PSB payment notifications.
    Expected payload:
    {
        "account_number": "1234567890",
        "amount": "5000.00",
        "transaction_reference": "ABC12345",
        "narration": "Deposit"
    }
    """
    try:
        data = request.data
        logger.info(f"📥 Received 9PSB Webhook: {json.dumps(data, indent=2)}")

        account_number = str(data.get("account_number", "")).strip()
        amount = Decimal(data.get("amount", "0"))
        transaction_ref = data.get("transaction_reference")

        if not account_number or amount <= 0:
            logger.warning("⚠️ Invalid webhook data (missing account or amount)")
            return Response({"status": "invalid"}, status=400)

        # 🔍 Find the virtual account linked to 9PSB
        va = VirtualAccount.objects.filter(
            account_number=account_number, provider="9psb"
        ).select_related("user").first()

        if not va or not va.user:
            logger.warning(f"⚠️ No VirtualAccount found for 9PSB account: {account_number}")
            return Response({"status": "not_found"}, status=404)

        wallet, _ = Wallet.objects.get_or_create(user=va.user)

        # ✅ Credit the wallet (avoid double credit)
        if not wallet.transactions.filter(reference=transaction_ref).exists():
            wallet.balance += amount
            wallet.save(update_fields=["balance"])
            logger.info(f"💰 Credited ₦{amount} to {va.user.email} via 9PSB ({account_number})")
        else:
            logger.info(f"🔁 Duplicate transaction ignored: {transaction_ref}")

        return Response({"status": "success"}, status=200)

    except Exception as e:
        logger.error(f"❌ Error processing 9PSB webhook: {str(e)}", exc_info=True)
        return Response({"status": "error", "message": str(e)}, status=500)

        

# wallet/webhooks.py
@api_view(["POST"])
@permission_classes([])
def flutterwave_webhook(request):
    """Handle Flutterwave transfer webhooks."""
    from .models import Deposit, Wallet, VirtualAccount
    try:
        payload = json.loads(request.body.decode())
        logger.info(f"Flutterwave webhook: {payload}")

        # Verify signature (optional but recommended)
        secret_hash = settings.FLW_HASH_SECRET
        signature = request.headers.get("verif-hash")
        if secret_hash and signature != secret_hash:
            return Response({"error": "Invalid signature"}, status=401)

        event = payload.get("event")
        data = payload.get("data", {})

        if event == "transfer.completed" and data.get("status") == "successful":
            ref = data.get("reference")
            account_number = data.get("account_number")
            amount = Decimal(str(data.get("amount", 0)))

            va = VirtualAccount.objects.filter(
                account_number=account_number, provider="flutterwave"
            ).first()
            if not va:
                logger.warning(f"No VA found for Flutterwave transfer: {account_number}")
                return Response({"status": "ignored"})

            wallet = Wallet.objects.get(user=va.user)

            with transaction.atomic():
                if not Deposit.objects.filter(provider_reference=ref).exists():
                    Deposit.objects.create(
                        user=va.user,
                        virtual_account=va,
                        amount=amount,
                        provider_reference=ref,
                        status="credited",
                        raw=payload,
                    )
                    wallet.deposit(
                        amount,
                        reference=ref,
                        metadata={"provider": "flutterwave", "event": event},
                    )
            return Response({"status": "success"}, status=200)
        return Response({"status": "ignored"}, status=200)
    except Exception as e:
        logger.error(f"Flutterwave webhook error: {str(e)}", exc_info=True)
        return Response({"error": "internal error"}, status=500)

