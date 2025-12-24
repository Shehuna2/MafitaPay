# PalmPay Virtual Account Integration

This document describes the PalmPay virtual account integration added to MafitaPay.

## Overview

PalmPay has been integrated as a second bank transfer funding option alongside Flutterwave. Users can now generate a PalmPay virtual account and receive deposits through bank transfers.

## Features

- **Virtual Account Creation**: Users can generate a dedicated PalmPay virtual account
- **Webhook Processing**: Secure webhook handler for processing deposits
- **Idempotent Operations**: Prevents duplicate deposits
- **Security**: HMAC-SHA256 signature verification for all webhooks
- **Amount Validation**: Validates deposit amounts to prevent fraud

## Architecture

### Components Added

1. **PalmPay Service** (`backend/wallet/services/palmpay_service.py`)
   - Handles PalmPay API communication
   - Creates virtual accounts
   - Verifies webhook signatures

2. **Webhook Handler** (`backend/wallet/webhooks.py`)
   - Processes PalmPay deposit notifications
   - Validates signatures
   - Credits user wallets

3. **API Endpoint** (`backend/wallet/views.py`)
   - Exposes virtual account generation to users
   - Validates user input (BVN)
   - Stores virtual account details

4. **URL Configuration** (`backend/wallet/urls.py`)
   - Added PalmPay webhook endpoint: `/api/wallet/palmpay-webhook/`

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file or deployment configuration:

```bash
# PalmPay Configuration
PALMPAY_MERCHANT_ID=your_merchant_id
PALMPAY_PUBLIC_KEY=your_public_key
PALMPAY_PRIVATE_KEY=your_private_key
PALMPAY_BASE_URL=https://api.palmpay.com  # or sandbox URL for testing

# Optional: Test environment credentials
PALMPAY_TEST_MERCHANT_ID=your_test_merchant_id
PALMPAY_TEST_PUBLIC_KEY=your_test_public_key
PALMPAY_TEST_PRIVATE_KEY=your_test_private_key
PALMPAY_TEST_BASE_URL=https://api-sandbox.palmpay.com
```

### PalmPay Dashboard Setup

1. Log in to your PalmPay merchant dashboard
2. Navigate to Webhooks/API settings
3. Configure the webhook URL: `https://yourdomain.com/api/wallet/palmpay-webhook/`
4. Copy your merchant credentials (Merchant ID, Public Key, Private Key)
5. Add the credentials to your environment variables

## API Usage

### Generate Virtual Account

**Endpoint**: `POST /api/wallet/generate-dva/`

**Request Body**:
```json
{
  "provider": "palmpay",
  "bvn": "12345678901"  // Optional but recommended
}
```

**Success Response** (201 Created):
```json
{
  "success": true,
  "message": "PalmPay virtual account generated successfully.",
  "account_number": "1234567890",
  "bank_name": "PalmPay",
  "account_name": "John Doe",
  "type": "static"
}
```

**Error Responses**:

- **400 Bad Request**: Invalid BVN format or account already exists
- **500 Internal Server Error**: PalmPay API error

### Existing Virtual Account

If a user already has a PalmPay virtual account, subsequent requests will return the existing account details:

```json
{
  "success": true,
  "message": "PalmPay virtual account already exists.",
  "account_number": "1234567890",
  "bank_name": "PalmPay",
  "account_name": "John Doe",
  "type": "static"
}
```

## Webhook Flow

1. User transfers money to their PalmPay virtual account
2. PalmPay sends a webhook notification to `/api/wallet/palmpay-webhook/`
3. System validates the webhook signature
4. System checks for duplicate transactions (idempotency)
5. System credits the user's wallet
6. System creates a deposit record

### Webhook Events Supported

- `VIRTUAL_ACCOUNT_PAYMENT`
- `PAYMENT_SUCCESS`
- `payment.success`
- `virtualaccount.payment`

### Webhook Security

The webhook handler implements multiple security measures:

1. **Signature Verification**: HMAC-SHA256 signature validation
2. **Payload Size Limit**: Maximum 1MB to prevent DoS attacks
3. **Amount Validation**: Maximum ₦10,000,000 per transaction
4. **Idempotency**: Prevents duplicate processing of the same transaction
5. **Account Verification**: Ensures virtual account belongs to a valid user

## Testing

### Manual Testing Checklist

1. ✅ Create a virtual account for a test user
2. ✅ Verify account details are stored correctly
3. ✅ Initiate a test transfer to the virtual account
4. ✅ Verify webhook is received and processed
5. ✅ Check wallet balance is credited correctly
6. ✅ Verify deposit record is created
7. ✅ Test duplicate webhook (should be ignored)
8. ✅ Test invalid signature (should be rejected)

### Integration Verification

Run the verification script to check all components are in place:

```bash
python /tmp/verify_palmpay_integration.py
```

## Database Models

### VirtualAccount Model

The existing `VirtualAccount` model is used with `provider="palmpay"`:

```python
{
    "user": User,
    "provider": "palmpay",
    "account_number": "1234567890",
    "bank_name": "PalmPay",
    "account_name": "John Doe",
    "provider_account_id": "palmpay_ref_xyz",
    "metadata": {
        "raw_response": {...},
        "type": "static"
    },
    "assigned": True
}
```

### Deposit Model

Deposits are tracked using the existing `Deposit` model:

```python
{
    "user": User,
    "virtual_account": VirtualAccount,
    "amount": Decimal("1000.00"),
    "provider_reference": "palmpay_txn_123",
    "status": "credited",
    "raw": {...}  // Full webhook payload
}
```

## Error Handling

The integration includes comprehensive error handling:

- **Missing Credentials**: Raises `ImproperlyConfigured` exception
- **Invalid BVN**: Returns 400 error with clear message
- **API Failures**: Logs error and returns 400 or 500 response
- **Webhook Errors**: Logs exception and returns 500 response
- **Duplicate Accounts**: Returns 400 error preventing duplicate creation

## Monitoring & Logging

All PalmPay operations are logged with appropriate log levels:

- **INFO**: Successful operations, webhook events
- **WARNING**: Invalid signatures, duplicate transactions
- **ERROR**: API failures, configuration issues
- **EXCEPTION**: Critical errors with full stack traces

Example log entries:

```
INFO: PalmpayService initialized (LIVE) → https://api.palmpay.com
INFO: Creating PalmPay virtual account for user test@example.com
INFO: PalmPay deposit success → ₦1000.00 | user=test@example.com
WARNING: PalmPay webhook signature verification failed
ERROR: PalmPay VA creation failed: status=400
```

## Comparison with Flutterwave

| Feature | Flutterwave | PalmPay |
|---------|-------------|---------|
| BVN Required | Yes (or NIN) | Optional |
| Bank Fallback | Yes (Wema/Sterling) | No |
| Static Accounts | Yes | Yes |
| Webhook Security | HMAC-SHA256 | HMAC-SHA256 |
| Idempotency | Yes | Yes |

## Future Enhancements

Potential improvements for future versions:

- [ ] Add support for dynamic virtual accounts
- [ ] Implement transaction history API
- [ ] Add support for webhook retries
- [ ] Create admin dashboard for monitoring
- [ ] Add automated tests for webhook handling
- [ ] Implement rate limiting for API calls
- [ ] Add support for multiple currencies

## Support

For issues or questions:

1. Check PalmPay API documentation
2. Review application logs for error details
3. Verify webhook signature calculation
4. Contact PalmPay support for API-related issues

## Security Considerations

⚠️ **Important Security Notes**:

1. Never commit credentials to version control
2. Always use HTTPS for webhook endpoints
3. Regularly rotate API keys
4. Monitor webhook logs for suspicious activity
5. Implement rate limiting on production
6. Validate all user inputs
7. Keep dependencies up to date

## License

This integration follows the same license as the main MafitaPay project.
