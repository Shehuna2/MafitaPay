# views.py or management/commands/check_ip.py
import requests

def check_outbound_ip(request):
    """Check what IP PalmPay sees from this server"""
    try:
        response = requests.get("https://api.ipify.org? format=json", timeout=5)
        ip_data = response.json()
        return JsonResponse({
            "outbound_ip": ip_data. get("ip"),
            "message": "Use this IP to whitelist with PalmPay"
        })
    except Exception as e: 
        return JsonResponse({"error": str(e)}, status=500)