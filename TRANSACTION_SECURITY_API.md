# Transaction Security API Documentation

## Overview

This document describes the API endpoints for transaction security features including PIN management and biometric authentication.

## Base URL

```
https://api.mafitapay.com/api
```

For local development:
```
http://localhost:8000/api
```

---

## Authentication

All endpoints (except PIN reset request/confirm) require JWT authentication.

Include the access token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## PIN Management Endpoints

### 1. Setup Transaction PIN

**POST** `/pin/setup/`

Set up a new transaction PIN for the user.

**Request Body:**
```json
{
  "pin": "1234",
  "pin_confirmation": "1234"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction PIN set up successfully."
}
```

**Errors:**
- `400` - Invalid PIN format or PINs don't match
- `400` - PIN already exists (use change endpoint)

---

### 2. Verify Transaction PIN

**POST** `/pin/verify/`

Verify the user's transaction PIN.

**Request Body:**
```json
{
  "pin": "1234"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "PIN verified successfully."
}
```

**Response (Failed):**
```json
{
  "error": "Invalid PIN.",
  "attempts_left": 4
}
```

**Errors:**
- `401` - Invalid PIN
- `403` - PIN is locked
- `400` - PIN not set

---

### 3. Change Transaction PIN

**POST** `/pin/change/`

Change the existing transaction PIN.

**Request Body:**
```json
{
  "old_pin": "1234",
  "new_pin": "5678",
  "new_pin_confirmation": "5678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction PIN changed successfully."
}
```

**Errors:**
- `401` - Invalid old PIN
- `403` - PIN is locked
- `400` - New PINs don't match or validation errors

---

### 4. Request PIN Reset

**POST** `/pin/reset/request/`

Request a PIN reset (sends email with reset token).

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "PIN reset email sent. Please check your inbox."
}
```

---

### 5. Confirm PIN Reset

**POST** `/pin/reset/confirm/`

Confirm PIN reset with token and set new PIN.

**Authentication:** Not required

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "new_pin": "5678",
  "new_pin_confirmation": "5678"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction PIN reset successfully."
}
```

**Errors:**
- `400` - Invalid or expired token
- `400` - Invalid PIN format or PINs don't match

---

### 6. Get PIN Status

**GET** `/pin/status/`

Check if user has PIN set up and if it's locked.

**Response:**
```json
{
  "has_pin": true,
  "is_locked": false,
  "last_changed": "2025-12-21T10:30:00Z"
}
```

---

## Biometric Authentication Endpoints

### 1. Enroll Biometric

**POST** `/biometric/enroll/`

Enroll biometric authentication (register WebAuthn credential).

**Request Body:**
```json
{
  "credential_id": "base64_encoded_credential_id",
  "public_key": "base64_encoded_public_key"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Biometric authentication enrolled successfully."
}
```

---

### 2. Disable Biometric

**POST** `/biometric/disable/`

Disable biometric authentication.

**Request Body:** Empty `{}`

**Response:**
```json
{
  "success": true,
  "message": "Biometric authentication disabled successfully."
}
```

---

### 3. Get Biometric Status

**GET** `/biometric/status/`

Check if user has biometric enabled.

**Response:**
```json
{
  "enabled": true,
  "registered_at": "2025-12-21T10:30:00Z",
  "has_credential": true
}
```

---

## Secure Transaction Endpoints

### 1. Secure Withdrawal

**POST** `/api/wallet/withdraw/`

Withdraw funds from wallet with PIN/biometric verification.

**Request Body:**
```json
{
  "amount": "1000.00",
  "bank_code": "058",
  "account_number": "1234567890",
  "account_name": "John Doe",
  "pin": "1234",
  "use_biometric": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal of ₦1000.00 initiated successfully.",
  "reference": "WD-20251221143000-123",
  "new_balance": "9000.00"
}
```

**Errors:**
- `400` - Insufficient balance
- `401` - Invalid PIN
- `403` - PIN locked
- `400` - Missing required fields

---

### 2. Secure Payment

**POST** `/api/wallet/payment/`

Make a payment with PIN/biometric verification.

**Request Body:**
```json
{
  "amount": "500.00",
  "recipient_email": "recipient@example.com",
  "description": "Payment for services",
  "pin": "1234",
  "use_biometric": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment of ₦500.00 to recipient@example.com completed successfully.",
  "reference": "PAY-20251221143000-123",
  "new_balance": "8500.00"
}
```

**Errors:**
- `400` - Insufficient balance
- `401` - Invalid PIN
- `403` - PIN locked
- `404` - Recipient not found
- `400` - Cannot send to self

---

## PIN Security Features

### Rate Limiting

- Maximum 5 failed PIN attempts
- After 5 failed attempts, PIN is locked for 30 minutes
- Counter resets on successful PIN verification

### PIN Requirements

- Exactly 4 digits
- Cannot be common patterns (0000, 1111, 1234, etc.)
- Stored as hashed value (never plain text)

### Audit Logging

All PIN and biometric events are logged in `TransactionSecurityLog` including:
- PIN verification attempts (success/failure)
- PIN setup/change/reset
- Biometric enrollment/disable
- Transaction approvals/denials

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (invalid credentials/PIN) |
| 403 | Forbidden (locked PIN) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Security Best Practices

1. **PIN Security:**
   - Never store PIN in plain text on client side
   - Clear PIN from memory after use
   - Don't log PIN values
   - Use HTTPS for all API calls

2. **Biometric Data:**
   - Biometric data never leaves the user's device
   - Only credential IDs and public keys are sent to server
   - Use WebAuthn standard for implementation

3. **Token Management:**
   - Rotate JWT tokens regularly
   - Store tokens securely (httpOnly cookies or secure storage)
   - Clear tokens on logout

4. **Transaction Security:**
   - Always verify PIN/biometric before sensitive operations
   - Display transaction details before confirmation
   - Provide clear feedback on verification status

---

## Examples

### Setting up PIN (cURL)

```bash
curl -X POST https://api.mafitapay.com/api/pin/setup/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "1234",
    "pin_confirmation": "1234"
  }'
```

### Making a secure withdrawal (JavaScript)

```javascript
const response = await fetch('https://api.mafitapay.com/api/wallet/withdraw/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: '1000.00',
    bank_code: '058',
    account_number: '1234567890',
    account_name: 'John Doe',
    pin: '1234'
  })
});

const data = await response.json();
console.log(data);
```

---

## Support

For questions or issues, contact support@mafitapay.com
