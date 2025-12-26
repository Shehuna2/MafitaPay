# wallet/utils.py
"""
Utility functions for the wallet app
"""
from decimal import Decimal


def calculate_deposit_fee(amount):
    """
    Calculate deposit fee: 2% with a maximum of ₦100.
    
    Args:
        amount: The deposit amount (Decimal or numeric type)
    
    Returns:
        tuple: (net_amount, fee) where net_amount is amount after fee deduction
    
    Example:
        calculate_deposit_fee(Decimal("10000")) -> (Decimal("9800"), Decimal("200"))
        calculate_deposit_fee(Decimal("50000")) -> (Decimal("49900"), Decimal("100"))
    """
    amount = Decimal(str(amount))
    fee_rate = Decimal("0.02")  # 2%
    max_fee = Decimal("100")
    
    fee = min(amount * fee_rate, max_fee)
    net_amount = amount - fee
    
    return net_amount, fee

def extract_nested_value(data, paths, default=None):
    """
    Extract a value from a nested dictionary by trying multiple paths.
    
    Args:
        data: The dictionary to search
        paths: List of tuples representing paths to try. Each tuple contains keys to traverse.
               Example: [("bank_name",), ("data", "account_bank_name")]
        default: Default value to return if no path yields a value
    
    Returns:
        The first non-None value found, or the default value
    
    Example:
        data = {"raw_response": {"data": {"account_bank_name": "Sterling BANK"}}}
        paths = [
            ("bank_name",),
            ("raw_response", "data", "account_bank_name")
        ]
        result = extract_nested_value(data, paths, "Unknown")
        # Returns: "Sterling BANK"
    """
    for path in paths:
        try:
            value = data
            for key in path:
                if isinstance(value, dict):
                    value = value.get(key)
                else:
                    # If we hit a non-dict value before completing the path,
                    # this path is invalid, so break and try the next path
                    value = None
                    break
            
            # Return the value if it's not None and not an empty string
            if value is not None and value != '':
                return value
        except (KeyError, TypeError, AttributeError):
            continue
    
    return default


def extract_bank_name(response_data, default="Unknown Bank"):
    """
    Extract bank_name from a Flutterwave response with various possible nested structures.
    
    Note: The double 'raw_response' nesting occurs because our service wraps the original
    Flutterwave API response in another layer when persisting to the database. This means
    we may encounter patterns like: metadata.raw_response.raw_response.data.account_bank_name
    
    Args:
        response_data: The response dictionary from Flutterwave
        default: Default value if bank_name is not found
    
    Returns:
        The bank name or default value
    """
    paths = [
        ("bank_name",),
        ("bank",),
        ("account_bank_name",),
        ("data", "account_bank_name"),
        ("raw_response", "bank_name"),
        ("raw_response", "account_bank_name"),
        ("raw_response", "data", "account_bank_name"),
        # Double nesting: service wraps original API response
        ("raw_response", "raw_response", "data", "account_bank_name"),
    ]
    return extract_nested_value(response_data, paths, default)


def extract_account_name(response_data, default="Virtual Account"):
    """
    Extract account_name from a Flutterwave response with various possible nested structures.
    
    Args:
        response_data: The response dictionary from Flutterwave
        default: Default value if account_name is not found
    
    Returns:
        The account name or default value
    """
    paths = [
        ("account_name",),
        ("name",),
        ("data", "account_name"),
        ("raw_response", "account_name"),
        ("raw_response", "data", "account_name"),
        ("raw_response", "raw_response", "data", "account_name"),
    ]
    return extract_nested_value(response_data, paths, default)
