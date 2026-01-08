import logging
import pytz
from datetime import datetime
from typing import Optional
from django.conf import settings
from tenacity import retry, stop_after_attempt, wait_fixed
import requests
from decimal import Decimal

from .vtu_ng import get_variations as vtung_get_variations
from .amigo import get_data_plans as amigo_get_data_plans, purchase_data as amigo_purchase_data

logger = logging.getLogger(__name__)

# VTpass Config
VTPASS_LIVE_URL = settings.VTPASS_LIVE_URL.rstrip("/") + "/"
API_KEY = settings.VTPASS_API_KEY
SECRET_KEY = settings.VTPASS_SECRET_KEY

# Bill service maps
CABLE_TV_SERVICE_ID_MAP = {
    "dstv": "dstv",
    "gotv": "gotv",
    "startimes": "startimes",
}

ELECTRICITY_SERVICE_ID_MAP = {
    "abuja": "aedc-prepaid",
    "kaduna": "kaduna-prepaid",
    "kano": "kano-prepaid",
    "enugu": "enugu-prepaid",
    "ibadan": "ibd-prepaid",
    "ikeja": "ikdc-prepaid",
    "jos": "jos-prepaid",
    "ekiti": "ekedc-prepaid",
    "portharcourt": "phcn-prepaid",
    "yola": "yedc-prepaid",
}

EDUCATION_SERVICE_ID_MAP = {
    "waec": "waec",
    "neco": "neco",
    "jamb": "jamb",
}

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

# ---------------------------------------------------------------------
# UTILITIES
# ---------------------------------------------------------------------
def generate_request_id(suffix: Optional[str] = None) -> str:
    tz = pytz.timezone("Africa/Lagos")
    prefix = datetime.now(tz).strftime("%Y%m%d%H%M")
    return prefix + (suffix or "")

@retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
def _make_api_call(url: str, payload: dict, method: str = "POST"):
    headers = {
        "Content-Type": "application/json",
        "api-key": API_KEY,
        "secret-key": SECRET_KEY,
    }
    try:
        if method == "POST":
            r = requests.post(url, json=payload, headers=headers, timeout=15)
        else:
            r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        logger.error(f"VTpass API error → {e}")
        raise

def _extract_txid(data: dict):
    return (
        data.get("content", {})
        .get("transactions", {})
        .get("transactionId")
    )

# ---------------------------------------------------------------------
# VTpass — Cable TV
# ---------------------------------------------------------------------
def purchase_cable_tv(decoder_number, network, variation_code, amount, phone=None,
                      subscription_type="change", request_id=None):

    service_id = CABLE_TV_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError(f"Unsupported TV network: {network}")

    request_id = request_id or generate_request_id(f"_tv_{decoder_number[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": decoder_number,
        "amount": amount,
        "phone_number": phone or "",
        "subscription_type": subscription_type,
    }

    if subscription_type == "change":
        if not variation_code:
            raise ValueError("variation_code required for 'change'")
        payload["variation_code"] = variation_code

    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        return {
            "success": True,
            "transaction_id": _extract_txid(data),
            "request_id": request_id,
            "raw": data
        }

    msg = data.get("response_description") or data.get("error") or "Unknown error"
    raise ValueError(msg)

# ---------------------------------------------------------------------
# VTpass — Electricity
# ---------------------------------------------------------------------
def purchase_electricity(meter_number, disco, amount, phone=None, request_id=None):
    service_id = ELECTRICITY_SERVICE_ID_MAP.get(disco.lower())
    if not service_id:
        raise ValueError(f"Unsupported DISCO: {disco}")

    request_id = request_id or generate_request_id(f"_elec_{meter_number[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": meter_number,
        "amount": amount,
        "phone_number": phone or "",
    }

    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        return {
            "success": True,
            "transaction_id": _extract_txid(data),
            "request_id": request_id,
            "raw": data
        }

    msg = data.get("response_description") or "Unknown error"
    raise ValueError(msg)

# ---------------------------------------------------------------------
# VTpass — Education
# ---------------------------------------------------------------------
def purchase_education(pin, exam_type, amount, phone=None, request_id=None):
    service_id = EDUCATION_SERVICE_ID_MAP.get(exam_type.lower())
    if not service_id:
        raise ValueError(f"Unsupported exam type: {exam_type}")

    request_id = request_id or generate_request_id(f"_edu_{pin[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": pin,
        "amount": amount,
        "phone_number": phone or "",
    }

    data = _make_api_call(url, payload)
    if data.get("code") == "000":
        return {
            "success": True,
            "transaction_id": _extract_txid(data),
            "request_id": request_id,
            "raw": data
        }

    msg = data.get("response_description") or "Unknown error"
    raise ValueError(msg)

# ---------------------------------------------------------------------
# VTpass — Airtime
# ---------------------------------------------------------------------
def purchase_airtime(phone, amount, network, request_id=None):
    service_id = AIRTIME_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError("Unsupported network")

    request_id = request_id or generate_request_id(f"_air_{phone[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": phone,
        "amount": int(amount),
        "phone": phone,
    }

    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        return {
            "success": True,
            "transaction_id": _extract_txid(data),
            "request_id": request_id,
            "raw": data
        }

    msg = data.get("response_description") or "Unknown error"
    raise ValueError(msg)





def get_plans_by_network(network: str) -> dict:

    grouped = {
        "REGULAR": [],
        "SME": [],
        "SME2": [],
        "GIFTING": [],
        "CORPORATE": []
    }

    # -------------------------
    # 1️⃣ VTU.ng – SME, SME2, GIFTING, CORPORATE
    # -------------------------
    try:
        vtung_plans = vtung_get_variations(network)
        for p in vtung_plans:
            cat = p["category"].upper()
            if cat in grouped:
                grouped[cat].append({
                    "id": p["id"],
                    "name": p["name"],
                    "amount": float(p["amount"]),
                    "network": network,
                    "provider": "vtung",
                    "category": cat,
                })
    except Exception as e:
        logger.error(f"VTU.ng fetch failed: {e}")

    # -------------------------
    # 2️⃣ REGULAR — Amigo (primary)
    # -------------------------
    try:
        amigo_plans = amigo_get_data_plans(network)
        for p in amigo_plans:
            grouped["REGULAR"].append({
                "id": p["id"],
                "name": p["name"],
                "amount": float(p["amount"]),
                "network": network,
                "provider": "amigo",
                "category": "REGULAR",
            })
        logger.info(f"Amigo → Loaded {len(amigo_plans)} REGULAR plans for {network.upper()}")
        return grouped  # ← IMPORTANT: stop here if Amigo works

    except Exception as e:
        logger.warning(f"Amigo failed → fallback to VTpass → {e}")


    # -------------------------
    # 2️⃣ VTpass – REGULAR ONLY
    # -------------------------
    try:
        vtpass_plans = get_data_plans(network)  # already returns REGULAR
        for p in vtpass_plans:
            if p["category"] == "REGULAR":
                grouped["REGULAR"].append({
                    "id": p["variation_code"],
                    "name": p["description"],
                    "amount": float(p["variation_amount"]),
                    "network": network,
                    "provider": "vtpass",
                    "category": "REGULAR",
                })
    except Exception as e:
        logger.error(f"VTpass fetch failed: {e}")

    return grouped



def get_all_plans() -> list:
    """
    Unified plan list (VTU.ng first, VTpass fallback)
    """
    unified = []

    VTUNG_TO_GROUPED = {
        "sme": "SME",
        "sme2": "SME2",
        "gift": "GIFTING",
        "gifting": "GIFTING",
        "corporate": "CORPORATE"
    }

    # 1️⃣ VTU.ng first
    try:
        for net in ["mtn", "airtel", "glo", "9mobile"]:
            plans = vtung_get_variations(net)
            for p in plans:
                raw_cat = p.get("category", "").lower()
                cat = VTUNG_TO_GROUPED.get(raw_cat)
                if not cat:
                    continue
                unified.append({
                    "id": p["id"],
                    "name": p["name"],
                    "amount": float(p["amount"]),
                    "network": net,
                    "provider": "vtung",
                    "category": cat
                })
        logger.info(f"Loaded {len(unified)} plans from VTU.ng (primary)")
    except Exception as e:
        logger.error(f"VTU.ng fetch failed → {e}")

    # 2️⃣ VTpass fallback (if VTU.ng completely down)
    if not unified:
        logger.warning("VTU.ng down → falling back to VTpass")
        try:
            for net in ["mtn", "airtel", "glo", "9mobile"]:
                plans = get_data_plans(net)
                for p in plans:
                    unified.append({
                        "id": p["variation_code"],
                        "name": p["description"],
                        "amount": float(p["variation_amount"]),
                        "network": net,
                        "provider": "vtpass",
                        "category": p["category"].upper()
                    })
            logger.info(f"Loaded {len(unified)} plans from VTpass (fallback)")
        except Exception as e:
            logger.error(f"VTpass also failed → {e}")

    return unified





# ---------------------------------------------------------------------
# VTpass — Data
# ---------------------------------------------------------------------
def purchase_data(phone, amount, network, variation_code, request_id=None):
    service_id = DATA_SERVICE_ID_MAP.get(network.lower())
    if not service_id:
        raise ValueError("Unsupported network")

    amount = int(float(amount))
    request_id = request_id or generate_request_id(f"_data_{phone[-4:]}")
    url = VTPASS_LIVE_URL + "pay"

    payload = {
        "request_id": request_id,
        "serviceID": service_id,
        "billersCode": phone,
        "variation_code": variation_code,
        "amount": amount,
        "phone": phone,
    }

    data = _make_api_call(url, payload)

    if data.get("code") == "000":
        return {
            "success": True,
            "transaction_id": _extract_txid(data),
            "request_id": request_id,
            "raw": data
        }

    msg = data.get("response_description") or "Unknown error"
    raise ValueError(msg)

# ---------------------------------------------------------------------
# VTU.ng + VTpass Unified Purchase
# ---------------------------------------------------------------------
def get_all_plans() -> list:
    """
    Unified plan list (VTU.ng first, VTpass fallback)
    """
    unified = []

    VTUNG_TO_GROUPED = {
        "sme": "SME",
        "sme2": "SME2",
        "gift": "GIFTING",
        "gifting": "GIFTING",
        "corporate": "CORPORATE"
    }

    # 1️⃣ VTU.ng first
    try:
        for net in ["mtn", "airtel", "glo", "9mobile"]:
            plans = vtung_get_variations(net)
            for p in plans:
                raw_cat = p.get("category", "").lower()
                cat = VTUNG_TO_GROUPED.get(raw_cat)
                if not cat:
                    continue
                unified.append({
                    "id": p["id"],
                    "name": p["name"],
                    "amount": float(p["amount"]),
                    "network": net,
                    "provider": "vtung",
                    "category": cat
                })
        logger.info(f"Loaded {len(unified)} plans from VTU.ng (primary)")
    except Exception as e:
        logger.error(f"VTU.ng fetch failed → {e}")

    # 2️⃣ VTpass fallback (if VTU.ng completely down)
    if not unified:
        logger.warning("VTU.ng down → falling back to VTpass")
        try:
            for net in ["mtn", "airtel", "glo", "9mobile"]:
                plans = get_data_plans(net)
                for p in plans:
                    unified.append({
                        "id": p["variation_code"],
                        "name": p["description"],
                        "amount": float(p["variation_amount"]),
                        "network": net,
                        "provider": "vtpass",
                        "category": p["category"].upper()
                    })
            logger.info(f"Loaded {len(unified)} plans from VTpass (fallback)")
        except Exception as e:
            logger.error(f"VTpass also failed → {e}")

    return unified


def get_single_plan(network, variation_id):
    """
    Get a single plan by network + variation ID
    """
    plans = get_plans_by_network(network)
    for items in plans.values():
        for p in items:
            if str(p["id"]) == str(variation_id):
                return p
    return None



def purchase_data_unified(phone, variation_id, network, amount, category, provider=None):
    """
    Unified purchase: Use provider if specified, else fallback by category
    """
    # Explicit provider override (from plan details)
    if provider == "amigo":
        res = amigo_purchase_data(phone, variation_id, network)
        if res.get("success"):
            return {**res, "provider": "amigo"}
        raise ValueError(res.get("error", "Amigo failed"))

    if provider == "vtung":
        res = vtung_purchase_data(phone, variation_id, network)
        if res.get("success"):
            return {**res, "provider": "vtung"}
        raise ValueError(res.get("error", "VTU.ng failed"))

    if provider == "vtpass":
        return {
            **purchase_data(phone, amount, network, variation_id),  # VTpass function
            "provider": "vtpass"
        }

    # Fallback by category (for legacy or non-specified)
    category = category.upper() if category else ""

    if category in ["SME", "SME2", "GIFTING", "CORPORATE"]:
        res = vtung_purchase_data(phone, variation_id, network)
        if res.get("success"):
            return {**res, "provider": "vtung"}
        raise ValueError(res.get("error", "VTU.ng failed"))

    if category == "REGULAR":
        res = amigo_purchase_data(phone, variation_id, network)
        if res.get("success"):
            return {**res, "provider": "amigo"}
        raise ValueError(res.get("error", "Amigo failed"))

    # Default to VTpass if nothing matches
    return {
        **purchase_data(phone, amount, network, variation_id),
        "provider": "vtpass"
    }


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


