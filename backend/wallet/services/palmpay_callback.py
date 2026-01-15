import json
import hashlib
import base64
from typing import Dict, Any

from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature


def verify_palmpay_callback(
    payload: Dict[str, Any],
    signature: str,
    palmpay_public_key,
) -> bool:
    if not signature:
        return False

    # 1. Prepare params - include ALL fields except 'sign', convert to str (even empty)
    str_params = {}
    for k, v in payload.items():
        if k == "sign":
            continue
        str_params[k] = str(v) if v is not None else ""

    # 2. Sort keys
    sorted_keys = sorted(str_params.keys())

    # 3. Build exact string
    strA = '&'.join(f"{key}={str_params[key]}" for key in sorted_keys)

    # Debug (very useful!)
    print("Callback strA:", strA)
    print("Callback MD5 input length:", len(strA))

    # 4. MD5 uppercase
    md5_str = hashlib.md5(strA.encode("utf-8")).hexdigest().upper()

    # 5. Verify
    try:
        palmpay_public_key.verify(
            base64.b64decode(signature),
            md5_str.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
        return True
    except InvalidSignature:
        return False
    except Exception as e:
        print("Callback verify error:", str(e))
        return False