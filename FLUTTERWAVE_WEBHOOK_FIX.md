# Flutterwave Webhook Fix Documentation

## Problem Statement
The Flutterwave webhook integration was failing with the following errors:
```
WARNING 2025-12-17 10:04:47,088 webhooks Missing Flutterwave verif-hash header
WARNING 2025-12-17 10:04:47,090 log Bad Request: /api/wallet/flutterwave-webhook/
```

This resulted in:
- Failed webhook processing
- Wallet credits not being applied despite successful transfers
- No audit trail of webhook failures

## Root Cause Analysis

The issue was caused by:
1. **Missing comprehensive header detection**: The webhook handler only checked `request.headers.get("verif-hash")` which might not catch all variations
2. **Insufficient logging**: No visibility into what headers were actually received
3. **No validation of hash secret configuration**: Silent failures if hash secret wasn't configured
4. **Limited edge case handling**: Missing logs for critical failure scenarios

## Solution Implemented

### 1. Enhanced Header Detection
```python
# Try multiple header name variations (case-insensitive handling)
signature = (
    request.headers.get("verif-hash") 
    or request.headers.get("Verif-Hash")
    or request.META.get("HTTP_VERIF_HASH")
)
```

### 2. Comprehensive Logging
Added logging at every critical step:
- Log all incoming webhook requests with headers
- Log when signature is missing and show available headers
- Log signature verification failures with details
- Log when hash secret is not configured
- Log CRITICAL errors for scenarios that could result in fund loss

### 3. Hash Secret Validation
```python
# Check if hash secret is configured
if not fw_service.hash_secret:
    logger.error(
        "Flutterwave hash secret not configured. Cannot verify webhook. "
        "Environment: %s",
        "LIVE" if not settings.DEBUG else "TEST"
    )
    return Response({"error": "hash secret not configured"}, status=500)
```

### 4. Enhanced Signature Verification
Improved the `verify_webhook_signature` method with:
- Better error handling
- Detailed debug logging
- Comprehensive documentation
- Input validation

### 5. Edge Case Handling
Added critical logging for:
- Missing account numbers → Could result in lost funds
- Missing virtual accounts → Successful transfer but no credit
- Missing users → Data integrity issues
- Failed wallet deposits → Immediate attention required

## Configuration Required

Ensure the following environment variables are set:

### Test Environment
```bash
FLW_TEST_CLIENT_ID=your_test_client_id
FLW_TEST_CLIENT_SECRET=your_test_client_secret
FLW_TEST_ENCRYPTION_KEY=your_test_encryption_key
FLW_TEST_HASH_SECRET=your_test_hash_secret
FLW_TEST_BASE_URL=https://developersandbox-api.flutterwave.com
```

### Production Environment
```bash
FLW_LIVE_CLIENT_ID=your_live_client_id
FLW_LIVE_CLIENT_SECRET=your_live_client_secret
FLW_LIVE_ENCRYPTION_KEY=your_live_encryption_key
FLW_LIVE_HASH_SECRET=your_live_hash_secret
FLW_LIVE_BASE_URL=https://f4bexperience.flutterwave.com
```

## Testing

### Manual Signature Verification Test
```python
import hmac
import hashlib
import base64
import json

# Your Flutterwave hash secret
hash_secret = "your_hash_secret_here"

# Sample webhook payload
payload = {
    "event": "virtualaccount.payment.completed",
    "data": {
        "id": "txn_123",
        "account_number": "1234567890",
        "amount": 1000,
        "status": "success"
    }
}

payload_bytes = json.dumps(payload).encode()

# Compute signature (same as Flutterwave)
dig = hmac.new(
    hash_secret.encode(),
    payload_bytes,
    hashlib.sha256
).digest()
signature = base64.b64encode(dig).decode()

print(f"Signature: {signature}")
```

## Monitoring

After deployment, monitor logs for:
1. `"Flutterwave webhook received"` - All incoming webhooks
2. `"Missing Flutterwave verif-hash header"` - Should not appear anymore
3. `"Invalid Flutterwave webhook signature"` - May indicate configuration issues
4. `"CRITICAL:"` prefix - Any message with this requires immediate attention

## Security Considerations

1. **Hash Secret Protection**: Never commit hash secrets to version control
2. **Signature Verification**: Always verify webhook signatures before processing
3. **Idempotency**: The handler correctly handles duplicate webhooks using `provider_reference`
4. **Audit Trail**: All webhook requests are now logged for security auditing

## Next Steps

1. Deploy the fix to staging environment
2. Configure proper hash secrets in environment variables
3. Test with actual Flutterwave webhooks
4. Monitor logs for any issues
5. Deploy to production once validated

## Files Modified

- `backend/wallet/webhooks.py` - Enhanced webhook handler
- `backend/wallet/services/flutterwave_service.py` - Improved signature verification
- `backend/wallet/tests.py` - Added signature verification tests
