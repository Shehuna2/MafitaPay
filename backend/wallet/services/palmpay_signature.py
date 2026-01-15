import hashlib
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
import base64


def palmpay_sign(params: dict, private_key) -> str:
    # Filter: remove None and empty after strip
    filtered = {}
    for k, v in params.items():
        if v is None:
            continue
        str_v = str(v).strip()
        if str_v == "":
            continue
        filtered[k] = str_v

    # Sort keys (ASCII order = lexicographic in Python sorted)
    sorted_keys = sorted(filtered.keys())
    parts = []
    for k in sorted_keys:
        parts.append(f"{k}={filtered[k]}")

    strA = "&".join(parts)

    # CRITICAL DEBUG OUTPUT ────────────────────────────────
    print("\n=== PALMPAY SIGNATURE DEBUG ===")
    print("Sorted params (as dict):", filtered)
    print("strA (exact string to MD5):")
    print("   " + strA)
    print("strA length:", len(strA))
    print("strA repr:", repr(strA))  # shows hidden chars if any

    md5_hash = hashlib.md5(strA.encode("utf-8")).hexdigest().upper()
    print("MD5 (uppercase):", md5_hash)
    # ──────────────────────────────────────────────────────

    # Try variant A: SHA1 + PKCS1v15 (original doc style)
    signature = private_key.sign(
        md5_hash.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA1()
    )

    b64_sig = base64.b64encode(signature).decode("utf-8")
    print("Signature (base64):", b64_sig)
    print("================================\n")

    return b64_sig