# wallet/utils.py

def extract_nested_value(data, *keys, fallback=None):
    """
    Extract a value from nested dictionary structures by trying multiple key paths.
    
    This utility function searches for values in nested dictionaries by:
    1. First trying direct keys at the top level
    2. Then trying nested paths: data, raw_response, raw_response.data, raw_response.raw_response.data
    
    Args:
        data: The dictionary to search
        *keys: Variable number of key names to try (e.g., 'bank_name', 'bank', 'account_bank_name')
        fallback: Default value if none of the keys are found
    
    Returns:
        The first non-None, non-empty value found, or fallback if none exist
        
    Example:
        >>> response = {"raw_response": {"data": {"account_bank_name": "Sterling BANK"}}}
        >>> extract_nested_value(response, "bank_name", "account_bank_name", fallback="Unknown")
        'Sterling BANK'
    """
    if not isinstance(data, dict):
        return fallback
    
    # Try direct keys first
    for key in keys:
        value = data.get(key)
        # Check for non-None and non-empty string values
        if value is not None and (not isinstance(value, str) or value.strip()):
            return value
    
    # Try nested paths
    nested_paths = [
        ("data",),
        ("raw_response",),
        ("raw_response", "data"),
        ("raw_response", "raw_response", "data"),
    ]
    
    for path in nested_paths:
        current = data
        for segment in path:
            if not isinstance(current, dict):
                break
            current = current.get(segment)
            if current is None:
                break
        
        if isinstance(current, dict):
            for key in keys:
                value = current.get(key)
                # Check for non-None and non-empty string values
                if value is not None and (not isinstance(value, str) or value.strip()):
                    return value
    
    return fallback
