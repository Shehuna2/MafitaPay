# Flutterwave Card Deposit Implementation Guide

## Overview

This implementation provides a complete card deposit system using Flutterwave's payment gateway, supporting EUR, USD, and GBP card deposits that are converted to NGN with transparent fee breakdown.

## Features

### ✅ Multi-Environment Support
- Separate sandbox and live Flutterwave credentials
- Environment switching via `use_live` flag
- Automatic environment detection for webhooks (based on DEBUG setting)

### ✅ Role-Based Access Control
- Only merchants and superusers can initiate card deposits
- Custom permission class: `IsMerchantOrSuperUser`
- JWT-based authentication on all endpoints

### ✅ Multi-Currency Support
- Supported currencies: EUR, USD, GBP (no direct NGN deposits)
- Real-time exchange rate calculations
- Transparent fee breakdown showing:
  - Base exchange rate
  - Flutterwave processing fee
  - Platform margin/profit
  - Final NGN amount user receives

### ✅ Exchange Rate Management
- Admin-configurable exchange rates via Django admin
- Per-currency rate settings with fee percentages
- Historical rate tracking (created_at, updated_at)

### ✅ Card Charge Flow
- 3D Secure support for enhanced security
- PCI-DSS compliant (no raw card storage)
- Card data encrypted before transmission
- Real-time transaction status updates

### ✅ Webhook Processing
- Signature verification using HMAC-SHA256
- Idempotent processing (prevents duplicate credits)
- Automatic wallet crediting on successful charges
- User notifications

## API Endpoints

### 1. Calculate Exchange Rate
**Endpoint**: `POST /api/wallet/card-deposit/calculate-rate/`  
**Authentication**: Required  
**Purpose**: Get current exchange rates and calculate NGN amount

**Request**:
```json
{
  "currency": "USD",
  "amount": "100"
}
```

**Response**:
```json
{
  "success": true,
  "currency": "USD",
  "amount": "100",
  "exchange_rate": "1500.00",
  "gross_ngn": "150000.00",
  "flutterwave_fee": "2100.00",
  "platform_margin": "750.00",
  "net_amount": "147150.00",
  "breakdown": {
    "base_conversion": "100 USD × 1500.00 = ₦150000.00",
    "flutterwave_fee": "₦2100.00 (1.4%)",
    "platform_margin": "₦750.00 (0.5%)",
    "you_receive": "₦147150.00"
  }
}
```

### 2. Get All Exchange Rates
**Endpoint**: `GET /api/wallet/card-deposit/calculate-rate/`  
**Authentication**: Required  

**Response**:
```json
{
  "success": true,
  "rates": [
    {
      "currency": "USD",
      "rate": "1500.00",
      "flutterwave_fee_percent": "1.40",
      "platform_margin_percent": "0.50",
      "created_at": "2025-12-26T10:00:00Z",
      "updated_at": "2025-12-26T10:00:00Z"
    },
    {
      "currency": "EUR",
      "rate": "1650.00",
      "flutterwave_fee_percent": "1.40",
      "platform_margin_percent": "0.50",
      "created_at": "2025-12-26T10:00:00Z",
      "updated_at": "2025-12-26T10:00:00Z"
    }
  ]
}
```

### 3. Initiate Card Deposit
**Endpoint**: `POST /api/wallet/card-deposit/initiate/`  
**Authentication**: Required (Merchant or Superuser only)  

**Request**:
```json
{
  "currency": "USD",
  "amount": "100",
  "card_number": "4242424242424242",
  "cvv": "123",
  "expiry_month": "12",
  "expiry_year": "25",
  "fullname": "John Doe",
  "use_live": false
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Card charge initiated",
  "tx_ref": "CARD_1_ABC123XYZ",
  "authorization_url": "https://checkout.flutterwave.com/3ds/...",
  "charge_data": {
    "id": "flw_123456",
    "status": "pending",
    ...
  }
}
```

**Response (Error)**:
```json
{
  "error": "Invalid currency. Card deposits only support: EUR, USD, GBP"
}
```

### 4. List Card Deposits
**Endpoint**: `GET /api/wallet/card-deposit/list/`  
**Authentication**: Required (Merchant or Superuser only)  
**Pagination**: Supported (20 per page by default)

**Response**:
```json
{
  "success": true,
  "count": 25,
  "next": "http://api.example.com/api/wallet/card-deposit/list/?page=2",
  "previous": null,
  "results": [
    {
      "id": "uuid",
      "currency": "USD",
      "amount": "100.00",
      "exchange_rate": "1500.00",
      "ngn_amount": "147150.00",
      "gross_ngn": "150000.00",
      "flutterwave_fee": "2100.00",
      "platform_margin": "750.00",
      "flutterwave_tx_ref": "CARD_1_ABC123",
      "flutterwave_tx_id": "flw_123456",
      "status": "successful",
      "card_last4": "4242",
      "card_brand": "visa",
      "use_live_mode": false,
      "created_at": "2025-12-26T10:00:00Z",
      "updated_at": "2025-12-26T10:05:00Z"
    }
  ]
}
```

### 5. Card Deposit Webhook
**Endpoint**: `POST /api/wallet/flutterwave-card-webhook/`  
**Authentication**: None (signature verification required)  
**Purpose**: Receives Flutterwave charge completion notifications

This endpoint is called by Flutterwave automatically. Not for direct API use.

## Database Models

### CardDepositExchangeRate
Stores exchange rates and fee structure for each currency.

**Fields**:
- `currency` (CharField): EUR, USD, or GBP
- `rate` (DecimalField): Exchange rate to NGN
- `flutterwave_fee_percent` (DecimalField): Flutterwave fee percentage (default: 1.4%)
- `platform_margin_percent` (DecimalField): Platform margin percentage (default: 0.5%)
- `created_at`, `updated_at` (DateTimeField): Timestamps

### CardDeposit
Tracks all card deposit transactions.

**Fields**:
- `id` (UUIDField): Primary key
- `user` (ForeignKey): User who initiated deposit
- `currency` (CharField): Transaction currency
- `amount` (DecimalField): Amount in foreign currency
- `exchange_rate` (DecimalField): Rate at transaction time
- `ngn_amount` (DecimalField): Net NGN amount user receives
- `gross_ngn` (DecimalField): Gross NGN before fees
- `flutterwave_fee`, `platform_margin` (DecimalField): Fee breakdowns
- `flutterwave_tx_ref` (CharField): Unique transaction reference
- `flutterwave_tx_id` (CharField): Flutterwave transaction ID
- `status` (CharField): pending, processing, successful, failed
- `card_last4`, `card_brand` (CharField): Masked card details
- `raw_response` (JSONField): Full Flutterwave response
- `use_live_mode` (BooleanField): Environment flag
- `created_at`, `updated_at` (DateTimeField): Timestamps

## Admin Configuration

### Setting Exchange Rates

1. Log into Django admin
2. Navigate to "Card Deposit Exchange Rates"
3. Add/Edit rates for EUR, USD, GBP
4. Set:
   - Exchange rate (e.g., 1500 for USD)
   - Flutterwave fee percentage (typically 1.4%)
   - Platform margin percentage (your profit margin)
5. Save

### Monitoring Transactions

1. Navigate to "Card Deposits" in admin
2. Filter by:
   - Status (pending, successful, failed)
   - Currency
   - Date range
   - Live/Test mode
3. View full transaction details including:
   - User information
   - Amount and fees
   - Card details (masked)
   - Raw Flutterwave response

## Environment Variables

Add these to your `.env` file:

```bash
# Flutterwave Test/Sandbox
FLW_TEST_CLIENT_ID=your_test_client_id
FLW_TEST_CLIENT_SECRET=your_test_client_secret
FLW_TEST_ENCRYPTION_KEY=your_test_encryption_key_24_bytes
FLW_TEST_HASH_SECRET=your_test_hash_secret
FLW_TEST_BASE_URL=https://developersandbox-api.flutterwave.com

# Flutterwave Live/Production
FLW_LIVE_CLIENT_ID=your_live_client_id
FLW_LIVE_CLIENT_SECRET=your_live_client_secret
FLW_LIVE_ENCRYPTION_KEY=your_live_encryption_key_24_bytes
FLW_LIVE_HASH_SECRET=your_live_hash_secret
FLW_LIVE_BASE_URL=https://f4bexperience.flutterwave.com

# Frontend URL (for 3D Secure redirect)
FRONTEND_URL=https://yourdomain.com
```

## Security Best Practices

### Production Deployment

1. **Use HTTPS**: Always use SSL/TLS in production
2. **Separate Credentials**: Never use test credentials in production
3. **IP Whitelisting**: Restrict webhook endpoints to Flutterwave IPs
4. **Rate Limiting**: Implement rate limiting on card endpoints
5. **Monitoring**: Set up alerts for:
   - Failed transactions
   - Webhook signature failures
   - Unusual transaction patterns

### PCI-DSS Compliance

- ✅ No raw card data stored
- ✅ Card encryption before transmission
- ✅ HTTPS for all card data
- ✅ Minimal data retention (last 4 digits only)
- ✅ Audit logging enabled

## Testing

Run the test suite:
```bash
python manage.py test wallet.test_card_deposit
```

This runs 19 comprehensive tests covering:
- Exchange rate calculations
- Permission enforcement
- Card deposit initiation
- Webhook processing
- Idempotency
- Error handling

## Troubleshooting

### Common Issues

**Issue**: "Exchange rate not configured"  
**Solution**: Add exchange rate in Django admin for the currency

**Issue**: "Invalid signature" on webhook  
**Solution**: Verify `FLW_LIVE_HASH_SECRET` matches Flutterwave dashboard

**Issue**: "Missing required fields"  
**Solution**: Ensure all card fields are provided (number, cvv, expiry, name)

**Issue**: "Forbidden" error  
**Solution**: Ensure user is merchant or superuser

### Logs

Check Django logs for detailed error messages:
```bash
# Look for wallet-related logs
tail -f /var/log/django/wallet.log | grep -E "card|deposit"
```

## Migration Guide

Run migrations:
```bash
python manage.py migrate wallet
```

This creates:
- `CardDepositExchangeRate` table
- `CardDeposit` table
- Necessary indexes for performance

## Support

For issues or questions:
1. Check the security summary: `CARD_DEPOSIT_SECURITY.md`
2. Review test cases in `wallet/test_card_deposit.py`
3. Consult Flutterwave documentation: https://developer.flutterwave.com
