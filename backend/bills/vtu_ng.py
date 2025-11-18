import requests
import uuid

# --- Configuration ---
BASE_URL = "https://vtu.ng/wp-json/api/v2"
USERNAME = "shehuusman1414@gmail.com"
PASSWORD = "4203$jikaN"
SECRET_KEY = ""  # to be filled after KYC
TOKEN = ""  # will be generated after login

# --- Category Mappings ---
CATEGORY_MAP = {
    "REGULAR": "vtpass",
    "SME": "data-sme",
    "GIFT": "data-gifting",
    "DATASHARE": "data-share",
    "CORPORATE": "corporate-data"
}

# --- Network IDs for VTU.ng ---
NETWORKS = ["mtn", "airtel", "glo", "9mobile", "smile"]


# --- Utility: Get Authorization Token ---
def authenticate():
    global TOKEN
    url = f"{BASE_URL}/login"  # Assuming VTU.ng login endpoint
    payload = {"username": USERNAME, "password": PASSWORD}
    response = requests.post(url, json=payload)
    if response.status_code == 200 and "token" in response.json():
        TOKEN = response.json()["token"]
        return TOKEN
    raise Exception(f"VTU.ng Auth Failed: {response.text}")


# --- Utility: Build Headers ---
def headers():
    if not TOKEN:
        authenticate()
    return {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }


# --- Fetch All Data Variations (Plans) ---
def get_variations():
    url = f"{BASE_URL}/variations/data"
    resp = requests.get(url, headers=headers())
    if resp.status_code == 200:
        plans = resp.json().get("data", [])
        # Map plans to categories internally
        mapped = []
        for plan in plans:
            category = plan.get("category", "").lower()
            internal_category = None
            for k, v in CATEGORY_MAP.items():
                if v.replace("data-", "") in category:
                    internal_category = k
                    break
            mapped.append({
                "id": plan["id"],
                "name": plan["name"],
                "amount": plan["amount"],
                "variation_id": plan["id"],
                "category": internal_category or "REGULAR",
                "network": plan["service_name"].lower()
            })
        return mapped
    raise Exception(f"Failed to fetch variations: {resp.text}")


# --- Purchase Data Plan ---
def purchase_data(phone: str, network: str, variation_id: str):
    if network not in NETWORKS:
        raise ValueError(f"Invalid network: {network}")
    request_id = str(uuid.uuid4())[:50]  # VTU.ng limit
    payload = {
        "request_id": request_id,
        "phone": phone,
        "service_id": network,
        "variation_id": variation_id
    }
    url = f"{BASE_URL}/data"
    resp = requests.post(url, headers=headers(), json=payload)
    if resp.status_code == 200:
        return resp.json()
    else:
        # Handle VTU.ng known errors
        code_map = {
            400: "Bad Request / Missing fields or invalid data",
            402: "Insufficient funds",
            403: "Unauthorized / Token invalid",
            409: "Duplicate request/order"
        }
        error_msg = code_map.get(resp.status_code, resp.text)
        raise Exception(f"VTU.ng Error ({resp.status_code}): {error_msg}")
