# File: backend/gasfee/utils.py
"""
Crypto Payment Utilities

This module provides essential utilities for cryptocurrency payments including:

1. Enhanced Wallet Address Validation:
   - EVM chains: EIP-55 checksum validation
   - Solana: Base58 format validation with 32-byte key verification
   - NEAR: Named and implicit account validation
   - TON: Base64url format validation with workchain support

2. Security Monitoring:
   - Rapid purchase detection
   - Unusual transaction amount detection
   - Secure error message sanitization

3. Price and Rate Utilities:
   - Asset price fetching with caching
   - USD-NGN rate conversion with margin support

All validation functions are designed to prevent invalid addresses before 
blockchain submission, reducing failed transactions and improving security.
"""

from decimal import Decimal, InvalidOperation, getcontext
import logging
import os
import re
import base64
import base58
from typing import Optional

from django.conf import settings
from web3 import Web3, HTTPProvider
from eth_account import Account

# Import your price functions
from .price_service import get_crypto_prices_in_usd, get_usd_ngn_rate_with_margin
from .evm_sender import get_web3

logger = logging.getLogger(__name__)

# Ensure enough precision
getcontext().prec = 28

# ==============================
# Environment helper
# ==============================
def get_env_var(var_name, required=True):
    value = os.getenv(var_name)
    if required and not value:
        raise ValueError(f"Missing required environment variable: {var_name}")
    return value

# ==============================
# Constants
# ==============================
DEFAULT_USD_NGN_FALLBACK = Decimal("1500")
COINGECKO_CACHE_SECONDS = 300

# ==============================
# Price Utilities
# ==============================
def get_asset_price_ngn(asset_id: str, margin_type: str) -> Decimal:
    asset_id = (asset_id or "").lower()
    usd_prices = get_crypto_prices_in_usd([asset_id])
    usd_price = usd_prices.get(asset_id)
    if usd_price is None:
        logger.error(f"[Price] Asset {asset_id} returned no USD price")
        return Decimal("0")
    usd_price = Decimal(usd_price)

    ngn_rate = get_usd_ngn_rate_with_margin(margin_type)
    if not ngn_rate or Decimal(ngn_rate) <= 0:
        logger.warning(f"[Price] Invalid NGN rate ({ngn_rate}), using fallback")
        ngn_rate = DEFAULT_USD_NGN_FALLBACK

    ngn_value = usd_price * Decimal(ngn_rate)
    return ngn_value.quantize(Decimal("0.01"))

# ==============================
# EVM / BSC SENDERS
# ==============================
# BSC global provider
BSC_RPC_URL = get_env_var("BSC_RPC_URL", required=False)
BSC_PRIVATE_KEY = get_env_var("BSC_PRIVATE_KEY", required=False)

# Initialize BSC connection only if credentials are available
if BSC_RPC_URL and BSC_PRIVATE_KEY:
    w3_bsc = Web3(HTTPProvider(BSC_RPC_URL))
    if not w3_bsc.is_connected():
        logger.warning(f"Failed to connect to BSC RPC: {BSC_RPC_URL}")
        w3_bsc = None
        BSC_SENDER_ADDRESS = None
    else:
        BSC_SENDER_ADDRESS = w3_bsc.eth.account.from_key(BSC_PRIVATE_KEY).address
else:
    w3_bsc = None
    BSC_SENDER_ADDRESS = None




# ==============================
# BSC native send
# ==============================
def send_bsc(to_address: str, amount: Decimal, order_id: Optional[int] = None) -> str:
    if not Web3.is_address(to_address):
        raise ValueError(f"Invalid BSC address: {to_address}")
    to_address = Web3.to_checksum_address(to_address)
    try:
        value = w3_bsc.to_wei(amount, "ether")
    except Exception:
        raise ValueError(f"Invalid BNB amount: {amount}")

    gas_price = w3_bsc.eth.gas_price
    gas_limit = 21000
    tx_cost = gas_limit * gas_price
    sender_balance = w3_bsc.eth.get_balance(BSC_SENDER_ADDRESS)
    if sender_balance < (value + tx_cost):
        raise ValueError("Insufficient BNB balance.")

    nonce = w3_bsc.eth.get_transaction_count(BSC_SENDER_ADDRESS)
    tx = {
        "nonce": nonce,
        "to": to_address,
        "value": value,
        "gas": gas_limit,
        "gasPrice": gas_price,
        "chainId": 56,
    }
    signed_tx = w3_bsc.eth.account.sign_transaction(tx, BSC_PRIVATE_KEY)
    tx_hash = w3_bsc.eth.send_raw_transaction(signed_tx.raw_transaction)
    return tx_hash.hex()


# ==============================
# Enhanced Wallet Address Validation
# ==============================

def validate_evm_address(address: str) -> bool:
    """
    Validate EVM address with EIP-55 checksum verification.
    Returns True if address is valid and checksummed correctly.
    """
    if not address or not isinstance(address, str):
        return False
    
    try:
        # Check basic format
        if not Web3.is_address(address):
            return False
        
        # Verify EIP-55 checksum
        # If the address contains mixed case, it must be checksummed correctly
        if address != address.lower() and address != address.upper():
            # Mixed case - must match checksum
            checksummed = Web3.to_checksum_address(address)
            return address == checksummed
        
        # All lowercase or all uppercase is acceptable (no checksum)
        return True
        
    except Exception as e:
        logger.debug(f"EVM address validation failed for {address}: {e}")
        return False


def validate_solana_address(address: str) -> bool:
    """
    Validate Solana base58 address format.
    Solana addresses are 32-44 characters in base58 encoding.
    """
    if not address or not isinstance(address, str):
        return False
    
    # Solana addresses are typically 32-44 characters
    if not (32 <= len(address) <= 44):
        return False
    
    try:
        # Try to decode as base58
        decoded = base58.b58decode(address)
        # Solana public keys are 32 bytes
        if len(decoded) != 32:
            return False
        return True
    except Exception as e:
        logger.debug(f"Solana address validation failed for {address}: {e}")
        return False


def validate_near_address(address: str) -> bool:
    """
    Validate NEAR protocol address format.
    NEAR supports both implicit (64 hex chars) and named accounts.
    """
    if not address or not isinstance(address, str):
        return False
    
    # NEAR addresses must be lowercase
    if address != address.lower():
        return False
    
    address = address.strip().lower()
    
    # Length check
    if len(address) < 2 or len(address) > 64:
        return False
    
    # Implicit account: 64 hex characters
    if len(address) == 64:
        if re.fullmatch(r'[0-9a-f]{64}', address):
            return True
        return False
    
    # Named account rules:
    # - lowercase letters, digits, underscores, hyphens, dots
    # - must not start or end with separator
    # - separators cannot be consecutive
    if not re.fullmatch(r'[a-z0-9]([-_.]?[a-z0-9])*', address):
        return False
    
    # Additional NEAR-specific rules
    # Account ID cannot start with a hyphen or underscore
    if address.startswith('-') or address.startswith('_'):
        return False
    
    return True


def validate_ton_address(address: str) -> bool:
    """
    Validate TON address format.
    TON addresses are base64url encoded with optional workchain prefix.
    Format: [workchain:]<base64url-address>
    """
    if not address or not isinstance(address, str):
        return False
    
    # TON addresses are typically 48-66 characters
    if not (20 <= len(address) <= 100):
        return False
    
    try:
        # TON addresses can have workchain prefix (e.g., "0:...")
        parts = address.split(':', 1)
        
        if len(parts) == 2:
            # Validate workchain is a number
            workchain = parts[0]
            addr_part = parts[1]
            
            if not workchain.lstrip('-').isdigit():
                return False
            
            # Workchain is typically -1 or 0
            workchain_num = int(workchain)
            if workchain_num not in [-1, 0]:
                logger.debug(f"Unusual TON workchain: {workchain_num}")
        else:
            addr_part = address
        
        # Validate base64url format (TON uses base64url encoding)
        # Base64url uses: A-Z, a-z, 0-9, -, _
        if not re.fullmatch(r'[A-Za-z0-9\-_]+={0,2}', addr_part):
            return False
        
        # Try to decode base64
        # Add padding if needed
        padding = len(addr_part) % 4
        if padding:
            addr_part += '=' * (4 - padding)
        
        # Replace URL-safe chars with standard base64
        standard_b64 = addr_part.replace('-', '+').replace('_', '/')
        decoded = base64.b64decode(standard_b64)
        
        # TON address payload should be at least 32 bytes
        if len(decoded) < 32:
            return False
        
        return True
        
    except Exception as e:
        logger.debug(f"TON address validation failed for {address}: {e}")
        return False


def validate_wallet_address(symbol: str, address: str) -> bool:
    """
    Enhanced wallet address validation with chain-specific rules.
    
    Args:
        symbol: Crypto symbol (e.g., 'ETH', 'SOL', 'NEAR', 'TON')
        address: Wallet address to validate
    
    Returns:
        True if address is valid for the given chain, False otherwise
    """
    if not address or not isinstance(address, str):
        return False
    
    symbol = symbol.upper()
    
    try:
        # EVM chains with EIP-55 checksum validation
        if symbol in {'ETH', 'ARB', 'BNB', 'BASE', 'OP', 'POL', 'AVAX', 'LINEA'}:
            return validate_evm_address(address)
        
        # Solana with base58 validation
        elif symbol == 'SOL':
            return validate_solana_address(address)
        
        # NEAR protocol
        elif symbol == 'NEAR':
            return validate_near_address(address)
        
        # TON
        elif symbol == 'TON':
            return validate_ton_address(address)
        
        # Fallback for other chains: basic non-empty check
        else:
            logger.warning(f"No specific validation for symbol: {symbol}")
            return len(address.strip()) > 0
            
    except Exception as e:
        logger.error(f"Address validation error for {symbol}: {e}")
        return False


# ==============================
# Security Logging and Monitoring
# ==============================

def log_suspicious_transaction(user, event_type: str, description: str, metadata: dict = None, severity: str = 'medium'):
    """
    Log suspicious transaction patterns for fraud detection.
    
    Args:
        user: User object
        event_type: Type of suspicious event (e.g., 'rapid_purchase', 'unusual_amount')
        description: Human-readable description
        metadata: Additional metadata about the event
        severity: Severity level ('low', 'medium', 'high')
    """
    from .models import TransactionMonitoring
    
    try:
        TransactionMonitoring.objects.create(
            user=user,
            event_type=event_type,
            severity=severity,
            description=description,
            metadata=metadata or {}
        )
        logger.warning(
            f"[SECURITY] {event_type} detected for user {user.id}: {description}",
            extra={'user_id': user.id, 'event_type': event_type, 'severity': severity}
        )
    except Exception as e:
        logger.error(f"Failed to log suspicious transaction: {e}")


def check_rapid_purchases(user, time_window_minutes: int = 5, max_purchases: int = 3) -> bool:
    """
    Check if user has made rapid successive purchases.
    
    Args:
        user: User object
        time_window_minutes: Time window to check (default 5 minutes)
        max_purchases: Maximum allowed purchases in time window
    
    Returns:
        True if rapid purchases detected, False otherwise
    """
    from django.utils import timezone
    from datetime import timedelta
    from .models import CryptoPurchase
    
    cutoff_time = timezone.now() - timedelta(minutes=time_window_minutes)
    recent_purchases = CryptoPurchase.objects.filter(
        user=user,
        created_at__gte=cutoff_time
    ).count()
    
    if recent_purchases >= max_purchases:
        log_suspicious_transaction(
            user=user,
            event_type='rapid_purchase',
            description=f'User made {recent_purchases} purchases in {time_window_minutes} minutes',
            metadata={
                'purchase_count': recent_purchases,
                'time_window_minutes': time_window_minutes,
                'threshold': max_purchases
            },
            severity='high'
        )
        return True
    
    return False


def check_unusual_amount(user, amount_ngn: Decimal, crypto_symbol: str) -> bool:
    """
    Check if transaction amount is unusually high or low.
    
    Args:
        user: User object
        amount_ngn: Transaction amount in NGN
        crypto_symbol: Crypto symbol being purchased
    
    Returns:
        True if unusual amount detected, False otherwise
    """
    # Define thresholds (can be moved to settings)
    VERY_LOW_THRESHOLD = Decimal("100")  # Suspiciously low
    HIGH_THRESHOLD = Decimal("1000000")  # 1M NGN
    VERY_HIGH_THRESHOLD = Decimal("5000000")  # 5M NGN
    
    is_unusual = False
    severity = 'low'
    reason = ''
    
    if amount_ngn < VERY_LOW_THRESHOLD:
        is_unusual = True
        severity = 'low'
        reason = f'Amount {amount_ngn} NGN is below minimum threshold'
    elif amount_ngn >= VERY_HIGH_THRESHOLD:
        is_unusual = True
        severity = 'high'
        reason = f'Amount {amount_ngn} NGN is very high (>= 5M NGN)'
    elif amount_ngn >= HIGH_THRESHOLD:
        is_unusual = True
        severity = 'medium'
        reason = f'Amount {amount_ngn} NGN is high (>= 1M NGN)'
    
    if is_unusual:
        log_suspicious_transaction(
            user=user,
            event_type='unusual_amount',
            description=reason,
            metadata={
                'amount_ngn': str(amount_ngn),
                'crypto_symbol': crypto_symbol,
                'threshold_type': 'very_low' if amount_ngn < VERY_LOW_THRESHOLD else 'high'
            },
            severity=severity
        )
    
    return is_unusual


def sanitize_error_message(error_msg: str) -> str:
    """
    Sanitize error messages to avoid exposing sensitive information.
    
    Args:
        error_msg: Raw error message
    
    Returns:
        Sanitized error message safe for client display
    """
    # List of patterns to remove/replace
    sensitive_patterns = [
        (r'0x[a-fA-F0-9]{40,}', '[REDACTED_ADDRESS]'),  # Ethereum addresses
        (r'[13][a-km-zA-HJ-NP-Z1-9]{25,34}', '[REDACTED_ADDRESS]'),  # Bitcoin addresses
        (r'private[_-]?key', '[REDACTED]'),
        (r'secret', '[REDACTED]'),
        (r'password', '[REDACTED]'),
        (r'\b\d{10,}\b', '[REDACTED_NUMBER]'),  # Long numbers
    ]
    
    sanitized = str(error_msg)
    for pattern, replacement in sensitive_patterns:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    
    return sanitized

