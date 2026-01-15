import base64
import hashlib
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding


def palmpay_sign(params: dict, private_key) -> str:
    # VERY IMPORTANT: Do NOT filter or strip!
    # Include ALL parameters, even if value is empty string or None → convert to str
    str_params = {k: str(v) if v is not None else "" for k, v in params.items()}

    # Sort keys (exactly as support does)
    sorted_keys = sorted(str_params.keys())
    parse_str = '&'.join(f"{key}={str_params[key]}" for key in sorted_keys)

    # Debug – you should see this in logs
    print("PalmPay strA:", parse_str)
    print("strA length:", len(parse_str))

    # MD5 + uppercase
    md5_hash = hashlib.md5(parse_str.encode('utf-8')).hexdigest().upper()
    print("MD5 uppercase:", md5_hash)

    # Sign with SHA1 + PKCS1v15 (matches support code)
    signature = private_key.sign(
        md5_hash.encode('utf-8'),
        padding.PKCS1v15(),
        hashes.SHA1()
    )

    b64_sig = base64.b64encode(signature).decode('utf-8')
    print("Signature:", b64_sig)

    return b64_sig