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
    """
    Verify PalmPay callback signature.

    PalmPay rules:
    - Remove `sign`
    - Sort params by ASCII key order
    - key=value&...
    - MD5 uppercase
    - Verify RSA SHA1WithRSA (PKCS#1 v1.5)
    """

    if not signature:
        return False

    # --------------------------------------------------
    # 1. Filter params
    # --------------------------------------------------
    items = {}
    for k, v in payload.items():
        if k == "sign":
            continue
        if v is None:
            continue
        v = str(v).strip()
        if v == "":
            continue
        items[k] = v

    # --------------------------------------------------
    # 2. ASCII sort
    # --------------------------------------------------
    sorted_items = sorted(items.items(), key=lambda x: x[0])

    # --------------------------------------------------
    # 3. Build strA
    # --------------------------------------------------
    strA = "&".join(f"{k}={v}" for k, v in sorted_items)

    # --------------------------------------------------
    # 4. MD5 uppercase
    # --------------------------------------------------
    md5_str = hashlib.md5(strA.encode("utf-8")).hexdigest().upper()

    # --------------------------------------------------
    # 5. Verify RSA signature
    # --------------------------------------------------
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
