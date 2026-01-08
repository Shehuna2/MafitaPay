# bills/amigo.py
import logging
import uuid
from typing import Dict, Any, List, Optional

import requests
from django.conf import settings
from tenacity import retry, stop_after_attempt, wait_fixed

logger = logging.getLogger(__name__)

BASE_URL = settings.AMIGO_BASE_URL.rstrip("/")  # https://amigo.ng/api
API_KEY = settings.AMIGO_API_KEY

session = requests.Session()
session.headers.update({
    "User-Agent": "MafitaPay/2.0",
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
})


NETWORK_MAP = {
    "mtn": 1,
    "glo": 2,
    # airtel / 9mobile not supported yet
}


def _network_id(network: str) -> int:
    nid = NETWORK_MAP.get(network.lower())
    if not nid:
        raise ValueError(f"Amigo unsupported network: {network}")
    return nid


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def _get(url: str) -> dict:
    r = session.get(url, timeout=20)
    r.raise_for_status()
    return r.json()


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def _post(url: str, payload: dict, idem_key: Optional[str] = None) -> dict:
    headers = {}
    if idem_key:
        headers["Idempotency-Key"] = idem_key

    r = session.post(url, json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()


# ------------------------------------------------------------------
# PLANS (REGULAR ONLY)
# ------------------------------------------------------------------
def get_data_plans(network: str) -> List[Dict[str, Any]]:
    """
    Returns REGULAR data plans from Amigo (hardcoded from official catalog)
    These are cheaper with extended validity compared to standard providers
    """
    network = network.lower()
    if network not in ["mtn", "glo"]:
        return []  # Only MTN and Glo supported

    # Hardcoded from https://amigo.ng/amigo-api-docs.html (latest as of 2026)
    PLANS = {
        "mtn": [  # network_id = 1
            {"id": "5000", "capacity": 0.5,  "validity": 30, "amount": 299.00},
            {"id": "1001", "capacity": 1,    "validity": 30, "amount": 429.00},
            {"id": "6666", "capacity": 2,    "validity": 30, "amount": 849.00},
            {"id": "3333", "capacity": 3,    "validity": 30, "amount": 1329.00},
            {"id": "9999", "capacity": 5,    "validity": 30, "amount": 1799.00},
            {"id": "1110", "capacity": 10,   "validity": 30, "amount": 3699.00},
            {"id": "1515", "capacity": 15,   "validity": 30, "amount": 5690.00},
            {"id": "424",  "capacity": 20,   "validity": 30, "amount": 7899.00},
            {"id": "379",  "capacity": 36,   "validity": 30, "amount": 11900.00},
            {"id": "360",  "capacity": 75,   "validity": 30, "amount": 18990.00},
        ],
        "glo": [  # network_id = 2
            {"id": "218", "capacity": 0.2,  "validity": 30, "amount": 99.00},
            {"id": "217", "capacity": 0.5,  "validity": 30, "amount": 199.00},
            {"id": "206", "capacity": 1,    "validity": 30, "amount": 399.00},
            {"id": "195", "capacity": 2,    "validity": 30, "amount": 799.00},
            {"id": "196", "capacity": 3,    "validity": 30, "amount": 1199.00},
            {"id": "222", "capacity": 5,    "validity": 30, "amount": 1999.00},
            {"id": "512", "capacity": 10,   "validity": 30, "amount": 3990.00},
        ],
    }

    raw_plans = PLANS.get(network, [])

    plans = []
    for p in raw_plans:
        plans.append({
            "id": p["id"],
            "name": f'{p["capacity"]}GB - {p["validity"]} Days',
            "amount": float(p["amount"]),
            "network": network,
            "provider": "amigo",
            "category": "REGULAR",
        })

    logger.info(f"Amigo → Loaded {len(plans)} REGULAR plans for {network.upper()} (hardcoded)")
    return plans


# ------------------------------------------------------------------
# PURCHASE
# ------------------------------------------------------------------
def purchase_data(
    phone: str,
    variation_id: str,
    network: str,
    request_id: Optional[str] = None,
    ported_number: bool = True,
) -> Dict[str, Any]:
    """
    Purchase REGULAR data via Amigo
    """
    network_id = _network_id(network)

    request_id = request_id or f"amg_{uuid.uuid4().hex[:12]}"
    url = f"{BASE_URL}/data/"

    payload = {
        "network": network_id,
        "mobile_number": phone,
        "plan": int(variation_id),
        "Ported_number": ported_number,
    }

    try:
        data = _post(url, payload, idem_key=request_id)

        if data.get("success") is True:
            logger.info(f"Amigo SUCCESS → {variation_id} → {phone}")
            return {
                "success": True,
                "provider": "amigo",
                "request_id": request_id,
                "transaction_id": data.get("reference"),
                "raw": data,
            }

        msg = data.get("message") or data.get("error") or "Amigo failed"
        logger.warning(f"Amigo FAILED → {msg}")
        return {
            "success": False,
            "error": msg,
            "raw": data,
        }

    except Exception as e:
        logger.error(f"Amigo ERROR → {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
        }
