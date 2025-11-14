@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def flutterwave_webhook(request):
    """
    Flutterwave v4 Webhook Handler — FULLY 2025-READY + AUDIT TRAIL
    Credits wallet + creates Deposit + WalletTransaction (visible in history)
    """
    try:
        raw = request.body or b""
        signature = request.headers.get("flutterwave-signature") or request.headers.get("verif-hash") or ""
        if not signature:
            logger.warning("Missing Flutterwave signature header")
            return Response({"error": "missing signature"}, status=400)

        fw_service = FlutterwaveService(use_live=True)
        secrets_to_try = [
            fw_service.hash_secret,
            getattr(settings, "FLW_LIVE_HASH_SECRET", None),
            getattr(settings, "FLW_TEST_HASH_SECRET", None),
            getattr(settings, "FLW_HASH_SECRET", None),
        ]
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
        logger.info("Flutterwave webhook received → event: %s", payload.get("event") or payload.get("type"))

        event = payload.get("event") or payload.get("event_type") or payload.get("type")
        data = payload.get("data", {}) or payload

        if event in ("charge.completed", "transfer.completed", "transfer.successful"):
            if data.get("status") not in ("successful", "succeeded", "success"):
                logger.info("Ignored non-success event %s: %s", event, data.get("status"))
                return Response({"status": "ignored"}, status=200)

            amount = Decimal(str(data.get("amount", "0")))
            if amount <= 0:
                return Response({"status": "ignored"}, status=200)

            ref = data.get("reference") or data.get("tx_ref") or data.get("transaction_reference") or str(data.get("id", ""))
            provider_ref = ref

            # Extract account_number (handles all Flutterwave formats)
            account_number = (
                data.get("account_number")
                or data.get("destination_account")
                or data.get("receiver_account")
            )
            payment_method = data.get("payment_method", {})
            if payment_method.get("type") == "bank_transfer":
                bt = payment_method.get("bank_transfer", {})
                account_number = account_number or bt.get("account_display_name")

            # Fallback via reference
            if not account_number and ref:
                va_fb = VirtualAccount.objects.filter(provider_account_id=ref, provider="flutterwave").first()
                if va_fb:
                    account_number = va_fb.account_number
                    logger.info("Account resolved via reference: %s → %s", ref, account_number)

            if not account_number:
                logger.warning("Could not resolve account_number")
                return Response({"status": "ignored"}, status=200)

            va = VirtualAccount.objects.filter(account_number=account_number, provider="flutterwave").select_related("user").first()
            if not va:
                logger.warning("No VA found for account_number: %s", account_number)
                return Response({"status": "ignored"}, status=200)

            wallet, _ = Wallet.objects.get_or_create(user=va.user)

            with transaction.atomic():
                # Idempotency check
                if Deposit.objects.filter(provider_reference=provider_ref).exists():
                    logger.info("Duplicate webhook ignored: %s", provider_ref)
                    return Response({"status": "already processed"}, status=200)

                # Create Deposit record
                Deposit.objects.create(
                    user=va.user,
                    virtual_account=va,
                    amount=amount,
                    provider_reference=provider_ref,
                    status="credited",
                    raw=payload,
                )

                # CRITICAL: Use wallet.deposit() → creates WalletTransaction + full history
                success = wallet.deposit(
                    amount=amount,
                    reference=f"flw_{provider_ref}",
                    metadata={
                        "provider": "flutterwave",
                        "event": event,
                        "account_number": account_number,
                        "sender_name": payment_method.get("bank_transfer", {}).get("originator_name"),
                        "sender_bank": payment_method.get("bank_transfer", {}).get("originator_bank_name"),
                        "flutterwave_ref": data.get("id"),
                    }
                )

                if success:
                    logger.info(
                        "CREDITED ₦%s → %s | VA: %s | Ref: %s | Event: %s",
                        amount, va.user.email, account_number, provider_ref, event
                    )
                else:
                    logger.error("wallet.deposit() failed after Deposit created!")

            return Response({"status": "success"}, status=200)

        logger.info("Unhandled Flutterwave event: %s", event)
        return Response({"status": "ignored"}, status=200)

    except Exception as e:
        logger.exception("FATAL ERROR in Flutterwave webhook")
        return Response({"error": "server error"}, status=500)