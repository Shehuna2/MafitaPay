# utils.py
import logging
import pytz
from datetime import datetime
from typing import Optional
from django.conf import settings
from tenacity import retry, stop_after_attempt, wait_fixed
import requests

logger = logging.getLogger(__name__)

# VTpass Config
VTPASS_SANDBOX_URL = settings.VTPASS_SANDBOX_URL.rstrip("/") + "/"
VTPASS_LIVE_URL = settings.VTPASS_LIVE_URL.rstrip("/") + "/"  # Add to settings later
API_KEY = settings.VTPASS_API_KEY
SECRET_KEY = settings.VTPASS_SECRET_KEY

# Service ID Maps
AIRTIME_SERVICE_ID_MAP = {
    "mtn": "mtn",
    "airtel": "airtel",
    "glo": "glo",
    "9mobile": "etisalat",
}

DATA_SERVICE_ID_MAP = {
    "mtn": "mtn-data",
    "airtel": "airtel-data",
    "glo": "glo-data",
    "9mobile": "etisalat-data",
}


def generate_request_id(suffix: Optional[str] = None) -> str:
    """
    Generate VTpass-compliant request_id:
    - First 12 chars: YYYYMMDDHHmm (Africa/Lagos)
    - Rest: optional alphanumeric suffix
    - Min length: 12
    """
    tz = pytz.timezone("Africa/Lagos")
    prefix = datetime.now(tz).strftime("%Y%m%d%H%M")  # e.g., 202510301645
    suffix = suffix or ""
    return prefix + suffix


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def _make_api_call(url: str, payload: dict, method: str = "POST"):
    headers = {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "secret-key": SECRET_KEY,
    }
    try:
        if method == "POST":
            resp = requests.post(url, json=payload, headers=headers, timeout=15)
        elif method == "GET":
            resp = requests.get(url, headers=headers, timeout=15)
        else:
            raise ValueError("Method must be POST or GET")
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error(f"VTpass API error: {e}")
        raise


def _extract_txid(data: dict) -> Optional[str]:
    return (
        data.get("content", {})
        .get("transactions", {})
        .get("transactionId")
    )


def purchase_airtime(phone: str, amount: float, network: str, request_id: str = None) -> dict:
    service_id = AIRTIME_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported network: {network}")

    # Generate compliant request_id if not provided
    request_id = request_id or generate_request_id(f"_air_{phone[-4:]}")
    url = VTPASS_SANDBOX_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "amount": amount,
        "phone": phone,
    }

    logger.info(f"Airtime purchase: ₦{amount} → {phone} ({network}) | req_id={request_id}")
    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        vtpass_txid = _extract_txid(data)
        logger.info(f"Airtime success | VTpass TxID: {vtpass_txid} | Your req_id: {request_id}")
        return {
            "success": True,
            "transaction_id": vtpass_txid,        # VTpass internal ID
            "request_id": request_id,             # ← YOUR ID (for VTpass approval!)
            "raw": data
        }
    else:
        msg = data.get("response_description", "Unknown error")
        logger.error(f"Airtime failed: {msg} | req_id={request_id}")
        raise ValueError(msg)


def purchase_data(phone: str, amount: float, network: str, variation_code: str, request_id: str = None) -> dict:
    service_id = DATA_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported network: {network}")

    request_id = request_id or generate_request_id(f"_data_{phone[-4:]}")
    url = VTPASS_SANDBOX_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": phone,
        "variation_code": variation_code,
        "amount": amount,
        "phone": phone,
    }

    logger.info(f"Data purchase: ₦{amount} ({variation_code}) → {phone} | req_id={request_id}")
    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        vtpass_txid = _extract_txid(data)
        logger.info(f"Data success | VTpass TxID: {vtpass_txid} | Your req_id: {request_id}")
        return {
            "success": True,
            "transaction_id": vtpass_txid,
            "request_id": request_id,             # ← Critical for live approval
            "raw": data
        }
    else:
        msg = data.get("response_description", "Unknown error")
        logger.error(f"Data failed: {msg} | req_id={request_id}")
        raise ValueError(msg)


def get_data_plans(network: str) -> list:
    service_id = DATA_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported network: {network}")

    url = f"{VTPASS_SANDBOX_URL}service-variations?serviceID={service_id}"
    data = _make_api_call(url, {}, method="GET")

    if data.get("response_description") != "000":
        raise ValueError(data.get("response_description", "Failed to fetch plans"))

    plans = data.get("content", {}).get("variations", [])
    return [
        {
            "variation_code": p["variation_code"],
            "variation_amount": float(p["variation_amount"]),
            "description": p["name"],
        }
        for p in plans
    ]