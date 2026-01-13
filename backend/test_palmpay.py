import requests
import json
import time
import uuid
import hmac
import hashlib
import base64

# Test credentials
APP_ID = "L250109060739968946411"
MERCHANT_ID = "125010905579101"
PRIVATE_KEY = "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCGKIkOisXVtjx9JDLIp5y3WI1AGqxJJo5TkrxKvfSt5cft3naRNamQN3APGJyZQ5wSefVoJmEYWWdBPixhYUwbr4v9PqD0Xfa8wrucKof5HNbIOQGphlR1tVIdn0Tup7njgvlN0RFAGR+cbQhFz61usWZpdqNH9uFb4K8zW0PLT20SYH7VI3eZebJQEMzhuhcRlflmJ9N3ylj+XgG7/zqD9RUYGCeu3nn2D0I61yhXb0HeVPv+Zytz1KKfd6ug5qAFw0uVt/137sxI2KeMm94zLumI+K1cMFYh66YcsrD7Q+/mAXmsLp5u8t0+64mpNzqX95cSM4Z89YWHTRAn7vNxAgMBAAECggEAAUM60CoxxqK/s0jAIuZPwrbOyQsqC2dChVxOjy2jX9nXY9Q4XnMyscfryb6zlTAnrY3lo9DLPeg32ZaqpnAXIfUZ95+DAcFJ7lXcI4L5MjjMSnPSbPobdxeMGNtzFZpj+pGtQfv3HXMsQgTGNT7u24tXOlFIUR6DBqIxU+1g7rJXU850kaQVg6dwII+9MgFmRqRSO4m7QGNbjZ/aUpebZ1vr4NawLwJqiW+crRIpyB08OQholFtHJwY44qLRorHf3mQiV3uD1Qc0rg+D5JZ9NfvZKGVogM7VyjFyzYoG9QLiD2J0VpB1N83aMQ+t8ihHBV+KYejcfJvKESmcpuhBHwKBgQC6Qz3ocgbX7I08llPauSrwI0joibdidasWSepbQNM+VqSIFuJPRvc3B4Qpg74FAXkmXmUPII1ZK52DNGKqqRo+cUa3royBEZYgjyCfO0yGuIqMTZvbWmHkuipkm5iUlNRaJxOTSwaIfAzvZ6cnpjLBourHKjXSrlYW3D1p2QLqQwKBgQC4Yz09LDBGLq7a069yqUVEL9aocvuYQQrQLuGpDicj80riwEB+O9SBBMWrbrbhnlHERuYc3Z33ElXZd9PD0/QW9MoChrr5gc8w3sKo8qFGgopBRfe/sRj9PaNsPDBasL9LK4ULTIaAjnzyoBtZ3S4ARieJqVboYmmJi1hu+gjSOwKBgAFTDROkC+xpIC/4GayKeIWwmoocwJMQpyDHccUoVtgwoYbeMsnBhWx8vzHUX/uFISlmrm1HG/owVzRhoPn5rdgX0hroQNOCHoEow2CeeVLT6RhKTPtoTx3jPP3uJU2ZKVFiyb7YX7mEuErTf9rGUcISuHymDi/rUW1kL4ObKWwlAoGAcNLgdN7mBvunqGRg9ZMXvBpdiaMZydb6q9oT4GK1lmzXBJpInDU12WA3J6fOJY2/UI9lXIJKlxTUDQYiQLAfqjBMr3ELVYKVabzUdZZJEqDrwfbzGotd1A70QVUu7T87Pd66QOipYF5PnBJVyg3piOdkZ/qDIByfoTbvfLBn12MCgYANZuzZKm+CZAzAN7hGD/KQb/TgqxVB8OgtdOZ6fYj9R768QD2mIgBV17+PmNVEq5Jb9v/FPKXY7h4giZCf5gUkCbhxpZ6OShbCdnp3p7+LbuI0bTnBgQ8fUKWEO5MD/QHzuQqGl/jL0X7UBAZHsozJ6iHAPiPET74WUi6gBSY5cQ=="
PUBLIC_KEY = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCVT+pLc1nkz9z803SOmF48bMFn0GYF4ng6nxj0ojUeu4KeNKkkw/nfureTtL77j9RpMjquJzzKdOZfHRvQyuAbaLoaSD1uU47npNiAL05bLYZEoZWvFOar9gNbIesea8MX0DeYncA2Tkr3kUo8K6XBrZ+TcV2Q8NEvm1T536LOGwIDAQAB"

# Payload
payload_dict = {
    "requestTime":  int(time.time() * 1000),
    "identityType": "personal",
    "virtualAccountName": "Test User",
    "customerName": "Test User",
    "email": "test@example.com",
    "nonceStr": str(uuid.uuid4()),
    "version": "V2.0",
    "appId": APP_ID,
    "merchantId": MERCHANT_ID,
}

payload = json.dumps(payload_dict, separators=(",", ":"), ensure_ascii=False)
timestamp = str(int(time.time() * 1000))

# Signature
message = f"{timestamp}{payload}"
signature = base64.b64encode(
    hmac.new(
        PRIVATE_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256
    ).digest()
).decode("utf-8")

# Base headers
base_headers = {
    "Content-Type": "application/json;charset=UTF-8",
    "CountryCode": "NG",
    "Signature": signature,
    "Request-Time": timestamp,
    "appId": APP_ID,
    "merchantId":  MERCHANT_ID,
}

# Different Authorization formats to try
auth_formats = [
    ("Bearer <public_key>", f"Bearer {PUBLIC_KEY}"),
    ("Bearer appId", f"Bearer {APP_ID}"),
    ("Bearer merchantId", f"Bearer {MERCHANT_ID}"),
    ("appId only", APP_ID),
    ("merchantId only", MERCHANT_ID),
    ("appId: merchantId", f"{APP_ID}:{MERCHANT_ID}"),
]

url = "https://open-gw-daily.palmpay-inc.com/api/v2/virtual/account/label/create"

for auth_name, auth_value in auth_formats:
    print(f"\n{'='*60}")
    print(f"Testing: {auth_name}")
    print(f"Authorization value: {auth_value}")
    print(f"{'='*60}")
    
    headers = base_headers.copy()
    headers["Authorization"] = auth_value
    
    try: 
        response = requests.post(
            url,
            data=payload.encode("utf-8"),
            headers=headers,
            timeout=60
        )
        print(f"Status Code: {response.status_code}")
        print(f"Response:  {response.json()}")
    except Exception as e:
        print(f"Error: {str(e)}")

print(f"\n{'='*60}")
print("Test complete!")