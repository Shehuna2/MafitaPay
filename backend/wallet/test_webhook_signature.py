#!/usr/bin/env python
"""
Test script for Flutterwave webhook signature verification.

Usage:
    python test_webhook_signature.py <hash_secret> <payload_json>

Example:
    python test_webhook_signature.py "my_hash_secret" '{"event":"test","data":{"amount":1000}}'
"""

import sys
import hmac
import hashlib
import base64
import json


def compute_signature(hash_secret: str, payload: str) -> str:
    """
    Compute Flutterwave webhook signature.
    
    Args:
        hash_secret: Your Flutterwave hash secret
        payload: The webhook payload as a JSON string
        
    Returns:
        Base64-encoded HMAC-SHA256 signature
    """
    payload_bytes = payload.encode('utf-8')
    dig = hmac.new(
        hash_secret.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).digest()
    signature = base64.b64encode(dig).decode('utf-8')
    return signature


def verify_signature(hash_secret: str, payload: str, signature: str) -> bool:
    """
    Verify Flutterwave webhook signature.
    
    Args:
        hash_secret: Your Flutterwave hash secret
        payload: The webhook payload as a JSON string
        signature: The signature to verify
        
    Returns:
        True if signature is valid, False otherwise
    """
    expected = compute_signature(hash_secret, payload)
    return hmac.compare_digest(expected, signature)


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_webhook_signature.py <hash_secret> [<payload_json>] [<signature>]")
        print("\nExamples:")
        print('  # Compute signature for a payload')
        print('  python test_webhook_signature.py "my_secret" \'{"event":"test"}\'')
        print('\n  # Verify a signature')
        print('  python test_webhook_signature.py "my_secret" \'{"event":"test"}\' "ABC123..."')
        sys.exit(1)
    
    hash_secret = sys.argv[1]
    
    # Default test payload
    default_payload = {
        "event": "virtualaccount.payment.completed",
        "data": {
            "id": "txn_test",
            "account_number": "1234567890",
            "amount": 1000,
            "status": "success"
        }
    }
    
    payload_json = sys.argv[2] if len(sys.argv) > 2 else json.dumps(default_payload)
    
    # Validate JSON
    try:
        json.loads(payload_json)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON payload - {e}")
        sys.exit(1)
    
    # Compute signature
    signature = compute_signature(hash_secret, payload_json)
    
    print("=" * 80)
    print("Flutterwave Webhook Signature Test")
    print("=" * 80)
    print(f"\nHash Secret: {hash_secret[:10]}... (length: {len(hash_secret)})")
    print(f"\nPayload ({len(payload_json)} bytes):")
    print(json.dumps(json.loads(payload_json), indent=2))
    print(f"\nComputed Signature:")
    print(signature)
    
    # If signature provided, verify it
    if len(sys.argv) > 3:
        provided_signature = sys.argv[3]
        is_valid = verify_signature(hash_secret, payload_json, provided_signature)
        
        print(f"\nProvided Signature:")
        print(provided_signature)
        print(f"\nVerification Result: {'✓ VALID' if is_valid else '✗ INVALID'}")
        
        if not is_valid:
            print("\nThe provided signature does not match the computed signature.")
            print("Possible causes:")
            print("- Wrong hash secret")
            print("- Payload was modified")
            print("- Different encoding or formatting")
            sys.exit(1)
    else:
        print("\nTo verify this signature, run:")
        print(f'python test_webhook_signature.py "{hash_secret}" \'{payload_json}\' "{signature}"')
    
    print("=" * 80)


if __name__ == "__main__":
    main()
