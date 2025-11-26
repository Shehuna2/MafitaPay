# bills/vtu_ng.py → FINAL 100% WORKING (Nov 2025)
import logging
import uuid
from typing import Optional, Dict, Any
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ONLY FOR AUTH
BASE_URL = settings.VTU_BASE_URL.rstrip("/")  # https://vtu.ng/wp-json

USERNAME = settings.VTU_USERNAME
PASSWORD = settings.VTU_PASSWORD

TOKEN: Optional[str] = None
TOKEN_EXPIRES_AT: float = 0

session = requests.Session()
session.headers.update({"User-Agent": "MafitaPay/2.0"})

def _get_token() -> str:
    global TOKEN, TOKEN_EXPIRES_AT
    import time
    if TOKEN and time.time() < TOKEN_EXPIRES_AT - 60:
        return TOKEN

    url = f"{BASE_URL}/jwt-auth/v1/token"
    try:
        resp = session.post(url, json={"username": USERNAME, "password": PASSWORD}, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if "token" in data:
            TOKEN = data["token"]
            TOKEN_EXPIRES_AT = time.time() + 3500
            logger.info("VTU.ng → Authenticated successfully")
            return TOKEN

        raise ValueError(f"Invalid token response: {data}")
    except Exception as e:
        logger.error(f"VTU.ng AUTH FAILED → {e}")
        raise

def headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {_get_token()}", "Content-Type": "application/json"}

# CORRECT ENDPOINT → /wp-json/api/v2/variations/data
def get_variations(network: Optional[str] = None) -> list:
    url = "https://vtu.ng/wp-json/api/v2/variations/data"
    if network:
        url += f"?service_id={network}"

    try:
        resp = session.get(url, timeout=20)  # Public endpoint — no token needed
        resp.raise_for_status()
        result = resp.json()

        if result.get("code") != "success":
            logger.warning(f"VTU.ng variations → {result.get('message')}")
            return []

        plans = []
        for p in result.get("data", []):
            name = p.get("data_plan", "Unknown")
            price = float(p["price"])
            vid = str(p["variation_id"])
            service = p["service_id"].lower()

            # Smart category
            name_lower = name.lower()
            category = "REGULAR"
            if "sme 2" in name_lower or "sme2" in name_lower:
                category = "SME2"
            elif "sme" in name_lower:
                category = "SME"
            elif "gift" in name_lower or "gifting" in name_lower:
                category = "GIFTING"
            elif "corporate" in name_lower:
                category = "CORPORATE"

            plans.append({
                "id": vid,
                "variation_id": vid,
                "name": name,
                "amount": price,
                "network": service,
                "category": category,
                "provider": "vtung"
            })

        logger.info(f"VTU.ng → Loaded {len(plans)} plans")
        return plans

    except Exception as e:
        logger.error(f"VTU.ng get_variations FAILED → {e}")
        return []


def purchase_data(phone: str, variation_id: str, network: str, request_id: Optional[str] = None) -> Dict[Any, Any]:
    url = "https://vtu.ng/wp-json/api/v2/data"
    payload = {
        "request_id": request_id or f"mf_{uuid.uuid4().hex[:10]}",
        "phone": phone,
        "service_id": network,
        "variation_id": variation_id
    }

    try:
        resp = session.post(url, json=payload, headers=headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("code") == "success":
            logger.info(f"VTU.ng → SUCCESS → {variation_id} → {phone}")
            return {"success": True, "provider": "vtung", "request_id": payload["request_id"], "raw": data}
        else:
            logger.warning(f"VTU.ng → Failed → {data.get('message')}")
            return {"success": False, "error": data.get("message", "Failed")}
    except Exception as e:
        logger.error(f"VTU.ng purchase ERROR → {e}")
        return {"success": False, "error": str(e)}