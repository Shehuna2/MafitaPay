import hashlib
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
import base64


def palmpay_sign(params: dict, private_key) -> str:
    # Step 1: filter & sort params
    items = {
        k: str(v).strip()
        for k, v in params.items()
        if v is not None and str(v).strip() != ""
    }

    sorted_items = sorted(items.items(), key=lambda x: x[0])

    strA = "&".join(f"{k}={v}" for k, v in sorted_items)

    # Step 2: MD5 uppercase
    md5_str = hashlib.md5(strA.encode("utf-8")).hexdigest().upper()

    signature = private_key.sign(
        md5_str.encode("utf-8"),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH
        ),
        hashes.SHA256()
    )

    return base64.b64encode(signature).decode("utf-8")
