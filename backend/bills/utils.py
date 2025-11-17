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
# VTPASS_SANDBOX_URL = settings.VTPASS_SANDBOX_URL.rstrip("/") + "/"
VTPASS_LIVE_URL = settings.VTPASS_LIVE_URL.rstrip("/") + "/"  # Add to settings later
API_KEY = settings.VTPASS_API_KEY
SECRET_KEY = settings.VTPASS_SECRET_KEY


# Bill Service ID Maps
CABLE_TV_SERVICE_ID_MAP = {
    "dstv": "dstv",
    "gotv": "gotv",
    "startimes": "startimes",
}

ELECTRICITY_SERVICE_ID_MAP = {
    # All DISCOs - use as serviceID suffix, e.g., "ikdc-prepaid"
    "abuja": "aedc-prepaid",      # AEDC (Abuja)
    "kaduna": "kaduna-prepaid",   # KAEDCO
    "kano": "kano-prepaid",       # KEDCO
    "enugu": "enugu-prepaid",     # ENUGU
    "ibadan": "ibd-prepaid",      # IBEDC
    "ikeja": "ikdc-prepaid",      # IKEDC
    "jos": "jos-prepaid",         # JOS
    "ekiti": "ekedc-prepaid",     # EKEDC
    "portharcourt": "phcn-prepaid",  # PHED
    "yola": "yedc-prepaid",       # YOLA
    # Add postpaid if needed: e.g., "ikdc-postpaid"
}

EDUCATION_SERVICE_ID_MAP = {
    "waec": "waec",
    "neco": "neco",
    "jamb": "jamb",
}


def get_bill_variations(service_id: str) -> list:
    """
    Fetch billers/plans for a service.
    VTpass uses "SUCCESSFUL" for service-variations, "000" for pay.
    """
    url = f"{VTPASS_LIVE_URL}service-variations?serviceID={service_id}"
    logger.info(f"Fetching variations for serviceID={service_id}")
    
    try:
        data = _make_api_call(url, {}, method="GET")
        logger.debug(f"VTpass variations response: {data}")
    except Exception as e:
        logger.error(f"API call failed: {e}")
        raise ValueError("Failed to connect to VTpass")

    # VTpass uses different success indicators
    resp_desc = str(data.get("response_description", "")).strip().upper()
    code = data.get("code")

    success = (
        code == "000" or
        resp_desc == "000" or
        resp_desc == "SUCCESSFUL" or
        resp_desc == "TRANSACTION SUCCESSFUL"
    )

    if not success:
        error_msg = data.get("response_description") or data.get("error") or "Unknown error"
        logger.error(f"VTpass variations failed for {service_id}: {error_msg}")
        raise ValueError(f"Failed to fetch plans: {error_msg}")

    variations = data.get("content", {}).get("variations", [])
    if not isinstance(variations, list):
        logger.warning(f"Invalid variations format for {service_id}: {variations}")
        return []

    formatted = []
    for v in variations:
        try:
            amount = float(v.get("variation_amount", 0))
            code = v.get("variation_code")
            name = v.get("name", "Unknown Plan")
            if code and amount > 0:
                formatted.append({
                    "variation_code": code,
                    "variation_amount": amount,
                    "description": name,
                })
        except (ValueError, TypeError):
            continue

    logger.info(f"Loaded {len(formatted)} variations for {service_id}")
    return formatted


# utils.py
def purchase_cable_tv(
    decoder_number: str,
    network: str,
    variation_code: str,
    amount: float,  # ← Now REQUIRED
    phone: str = None,
    subscription_type: str = "change",
    request_id: str = None
) -> dict:
    service_id = CABLE_TV_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported TV network: {network}")

    request_id = request_id or generate_request_id(f"_tv_{decoder_number[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": decoder_number,
        "amount": amount,  # ← ALWAYS INCLUDED
        "phone_number": phone or "",
        "subscription_type": subscription_type,
    }

    if subscription_type == "change":
        if not variation_code:
            raise ValueError("variation_code required for 'change'")
        payload["variation_code"] = variation_code
    # For renew: amount only

    logger.info(f"Cable TV purchase: {subscription_type} → {decoder_number} ({network}) | req_id={request_id}")
    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        vtpass_txid = _extract_txid(data)
        logger.info(f"Cable TV success | TxID: {vtpass_txid}")
        return {"success": True, "transaction_id": vtpass_txid, "request_id": request_id, "raw": data}
    else:
        msg = (
            data.get("response_description") 
            or data.get("content", {}).get("errors")
            or data.get("content", {}).get("error")
            or data.get("errors")
            or data.get("error")
            or "Unknown error"
        )

        logger.error(f"Cable TV failed: {msg} | Payload: {payload}")
        raise ValueError(msg)


def purchase_electricity(meter_number: str, disco: str, amount: float, phone: str = None, request_id: str = None) -> dict:
    """
    Pay Electricity bill (prepaid/postpaid).
    - meter_number: 11-digit meter number.
    - disco: e.g., "ikeja" → serviceID "ikdc-prepaid".
    - amount: Exact bill amount (for postpaid) or load amount (prepaid).
    """
    service_id = ELECTRICITY_SERVICE_ID_MAP.get(disco.lower())
    if not service_id:
        raise ValueError(f"Unsupported DISCO: {disco}")

    request_id = request_id or generate_request_id(f"_elec_{meter_number[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": meter_number,  # Meter number
        "amount": amount,
        "phone_number": phone or "",
    }

    logger.info(f"Electricity purchase: ₦{amount} → {meter_number} ({disco}) | req_id={request_id}")
    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        vtpass_txid = _extract_txid(data)
        logger.info(f"Electricity success | TxID: {vtpass_txid}")
        return {"success": True, "transaction_id": vtpass_txid, "request_id": request_id, "raw": data}
    else:
        msg = (
            data.get("response_description") 
            or data.get("content", {}).get("errors")
            or data.get("content", {}).get("error")
            or data.get("errors")
            or data.get("error")
            or "Unknown error"
        )
        logger.error(f"Electricity failed: {msg}")
        raise ValueError(msg)


def purchase_education(pin: str, exam_type: str, amount: float, phone: str = None, request_id: str = None) -> dict:
    """
    Purchase Education scratch card (WAEC/NECO/JAMB).
    - pin: Serial number/pin from form.
    - amount: Fixed per exam (e.g., 15000 for WAEC).
    """
    service_id = EDUCATION_SERVICE_ID_MAP.get(exam_type.lower())
    if not service_id:
        raise ValueError(f"Unsupported exam: {exam_type}")

    request_id = request_id or generate_request_id(f"_edu_{pin[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": pin,  # Exam serial/pin
        "amount": amount,
        "phone_number": phone or "",
    }

    logger.info(f"Education purchase: ₦{amount} ({exam_type}) → {pin} | req_id={request_id}")
    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        vtpass_txid = _extract_txid(data)
        logger.info(f"Education success | TxID: {vtpass_txid}")
        return {"success": True, "transaction_id": vtpass_txid, "request_id": request_id, "raw": data}
    else:
        msg = (
            data.get("response_description") 
            or data.get("content", {}).get("errors")
            or data.get("content", {}).get("error")
            or data.get("errors")
            or data.get("error")
            or "Unknown error"
        )
        logger.error(f"Education failed: {msg}")
        raise ValueError(msg)

        
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
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "amount": amount,
        "phone_number": phone,
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
        msg = (
            data.get("response_description") 
            or data.get("content", {}).get("errors")
            or data.get("content", {}).get("error")
            or data.get("errors")
            or data.get("error")
            or "Unknown error"
        )

        logger.error(f"Airtime failed: {msg} | req_id={request_id}")
        raise ValueError(msg)


def purchase_data(phone: str, amount: float, network: str, variation_code: str, request_id: str = None) -> dict:
    service_id = DATA_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported network: {network}")

    request_id = request_id or generate_request_id(f"_data_{phone[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": phone,
        "variation_code": variation_code,
        "amount": amount,
        "phone_number": phone,
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
        logger.error(f"RAW VTpass response: {data}")
        msg = (
            data.get("response_description") 
            or data.get("content", {}).get("errors")
            or data.get("content", {}).get("error")
            or data.get("errors")
            or data.get("error")
            or "Unknown error"
        )

        logger.error(f"Data failed: {msg} | req_id={request_id}")
        raise ValueError(msg)



def get_data_plans(network: str) -> list:
    service_id = DATA_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported network: {network}")

    url = f"{VTPASS_LIVE_URL}service-variations?serviceID={service_id}"
    data = _make_api_call(url, {}, method="GET")

    if str(data.get("response_description", "")).strip() not in ["000", "SUCCESSFUL", "TRANSACTION SUCCESSFUL"]:
        raise ValueError(data.get("response_description", "Failed to fetch plans"))

    variations = data.get("content", {}).get("variations", [])

    categorized = []
    for p in variations:
        name = p.get("name", "").lower()
        code = p.get("variation_code", "").lower()

        if "sme" in code or "sme" in name:
            category = "SME"
        elif "gift" in code or "gifting" in name:
            category = "GIFT"
        elif "corp" in code or "corporate" in name:
            category = "CORPORATE"
        elif "coupon" in code or "coupon" in name:
            category = "COUPON"
        elif "promo" in name or "awoof" in name:
            category = "PROMO"
        else:
            category = "REGULAR"

        categorized.append({
            "variation_code": p["variation_code"],
            "variation_amount": float(p["variation_amount"]),
            "description": p["name"],
            "category": category,
        })

    return categorized


# def categorize_plan(name: str, variation_code: str) -> str:
#     text = f"{name} {variation_code}".lower()

#     if any(x in text for x in ["sme", "small", "sme-data"]):
#         return "SME"
#     if any(x in text for x in ["gift", "gifting"]):
#         return "GIFTING"
#     if "corporate" in text or "corp" in text:
#         return "CORPORATE"
#     if "coupon" in text:
#         return "COUPON"
#     if "awoof" in text:
#         return "AWOOF"
#     if "daily" in text:
#         return "DAILY"
#     if "weekly" in text:
#         return "WEEKLY"
#     if "monthly" in text or "30 days" in text or "30days" in text:
#         return "MONTHLY"

#     return "GENERAL"


# def get_data_plans(network: str) -> list:
#     service_id = DATA_SERVICE_ID_MAP.get(network.lower())
#     if not service_id:
#         raise ValueError(f"Unsupported network: {network}")

#     url = f"{VTPASS_LIVE_URL}service-variations?serviceID={service_id}"
#     data = _make_api_call(url, {}, method="GET")

#     if data.get("response_description") != "000":
#         raise ValueError(data.get("response_description", "Failed to fetch plans"))

#     plans = data.get("content", {}).get("variations", [])

#     final = []
#     for p in plans:
#         name = p["name"]
#         code = p["variation_code"]
#         amount = float(p["variation_amount"])

#         final.append({
#             "variation_code": code,
#             "variation_amount": amount,
#             "description": name,
#             "category": categorize_plan(name, code)
#         })

#     return final




# def get_data_plans(network: str) -> list:
#     service_id = DATA_SERVICE_ID_MAP.get(network.lower())
#     if not service_id:
#         raise ValueError(f"Unsupported network: {network}")

#     url = f"{VTPASS_LIVE_URL}service-variations?serviceID={service_id}"
#     data = _make_api_call(url, {}, method="GET")

#     if str(data.get("response_description", "")).strip() not in ["000", "SUCCESSFUL", "TRANSACTION SUCCESSFUL"]:
#         raise ValueError(data.get("response_description", "Failed to fetch plans"))

#     variations = data.get("content", {}).get("variations", [])

#     categorized = []
#     for p in variations:
#         name = p.get("name", "").lower()
#         code = p.get("variation_code", "").lower()

#         # CATEGORY DETECTION
#         if "sme" in code or "sme" in name:
#             category = "SME"
#         elif "gift" in code or "gifting" in name:
#             category = "GIFT"
#         elif "corp" in code or "corporate" in name:
#             category = "CORPORATE"
#         elif "coupon" in code or "coupon" in name:
#             category = "COUPON"
#         elif "promo" in name or "awoof" in name:
#             category = "PROMO"
#         else:
#             category = "REGULAR"

#         categorized.append({
#             "variation_code": p["variation_code"],
#             "variation_amount": float(p["variation_amount"]),
#             "description": p["name"],
#             **{"category": category},
#         })

#     return categorized
