import hashlib
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
import base64


def palmpay_sign(params: dict, private_key) -> str:
    # Step 1: filter out None/empty & sort
    items = {
        k: str(v).strip()
        for k, v in params.items()
        if v is not None and str(v).strip() != ""
    }

    sorted_items = sorted(items.items(), key=lambda x: x[0])  # sort by key (ASCII order)

    strA = "&".join(f"{k}={v}" for k, v in sorted_items)

    # DEBUG: Very important – log this!
    print("=== PalmPay Signature Debug ===")
    print("strA          :", strA)
    print("strA length   :", len(strA))

    # Step 2: MD5 + uppercase
    md5_hash = hashlib.md5(strA.encode("utf-8")).hexdigest().upper()

    print("MD5 uppercase :", md5_hash)

    # Step 3: RSA sign with SHA256 + PSS (most likely working combo)
    signature = private_key.sign(
        md5_hash.encode("utf-8"),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH   # or try 32 / 20
        ),
        hashes.SHA256()
    )

    signed_b64 = base64.b64encode(signature).decode("utf-8")

    print("Generated signature:", signed_b64)
    print("==============================")

    return signed_b64