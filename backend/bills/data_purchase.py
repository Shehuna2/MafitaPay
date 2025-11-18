import os
import requests
from dotenv import load_dotenv
import uuid

# Load environment variables
load_dotenv()

VTU_CONFIG = {
    "username": os.getenv("VTU_USERNAME"),
    "password": os.getenv("VTU_PASSWORD"),
    "secret_key": os.getenv("VTU_SECRET_KEY"),
    "base_url": os.getenv("VTU_BASE_URL")
}

# Network prefixes
NETWORK_PREFIXES = {
    "mtn": ["0803","0806","0703","0706","0810","0813","0814","0816","0903","0906","0913","0916","07025","07026","0704"],
    "glo": ["0805","0807","0811","0815","0905","0915","0705"],
    "airtel": ["0802","0808","0812","0708","0701","0902","0907","0912"],
    "9mobile": ["0809","0817","0818","0909","0908","0918"],
    "smile": ["07028","07029","0819"]
}

def detect_network(phone):
    """
    Detect network based on phone number prefix.
    Returns the service_id (mtn, glo, airtel, 9mobile, smile).
    """
    phone_clean = phone[-11:]  # ensure last 11 digits
    for network, prefixes in NETWORK_PREFIXES.items():
        if any(phone_clean.startswith(p) for p in prefixes):
            return network
    raise ValueError("Unknown network for phone number: " + phone)

def get_auth_token():
    """
    Authenticate with VTU.ng and return JWT token.
    """
    url = f"{VTU_CONFIG['base_url']}/jwt-auth/v1/token"
    data = {
        "username": VTU_CONFIG["username"],
        "password": VTU_CONFIG["password"]
    }
    response = requests.post(url, json=data)
    response.raise_for_status()
    return response.json()["token"]

def purchase_data(phone, variation_id, data_type="data-sme"):
    """
    Purchase a data plan via VTU.ng.

    Args:
        phone (str): Phone number (e.g., 08012345678)
        variation_id (str): Data plan variation ID
        data_type (str): type: 'data-sme', 'data-gifting', 'data-share', 'corporate-data'

    Returns:
        dict: API response
    """
    token = get_auth_token()
    url = f"{VTU_CONFIG['base_url']}/api/v2/data"

    request_id = str(uuid.uuid4())  # unique request ID
    service_id = detect_network(phone)

    payload = {
        "request_id": request_id,
        "phone": phone,
        "service_id": service_id,
        "variation_id": variation_id,
        "type": data_type
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)

    try:
        response.raise_for_status()
    except requests.HTTPError as e:
        return {"error": str(e), "response": response.json() if response.content else {}}

    return response.json()
