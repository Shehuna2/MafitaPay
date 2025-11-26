# bills/serializers.py → FINAL VERSION
from rest_framework import serializers
import re

PHONE_REGEX = re.compile(r'^0[789][01]\d{8}$')  # 11-digit Nigerian numbers only


class NigerianPhoneField(serializers.CharField):
    def __init__(self, **kwargs):
        super().__init__(max_length=11, min_length=11, **kwargs)

    def to_representation(self, value):
        return value

    def to_internal_value(self, data):
        phone = str(data).strip()
        if not PHONE_REGEX.match(phone):
            raise serializers.ValidationError("Invalid Nigerian phone number.")
        return phone


# ===================================================================
# 1. DATA PURCHASE (Unified: VTU.ng + VTpass) — BEST VERSION
# ===================================================================
class DataPurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(
        choices=["mtn", "airtel", "glo", "9mobile"],
        help_text="Network in lowercase"
    )
    phone = NigerianPhoneField()
    variation_id = serializers.CharField(
        max_length=100,
        help_text="Use variation_id from /data/plans/ endpoint (supports VTU.ng & VTpass)"
    )
    amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=50,
        help_text="Price user sees and pays (your markup included)"
    )

    def validate(self, data):
        network = data["network"]
        variation_id = data["variation_id"]

        # Optional: You can validate variation_id exists in cache or DB
        # For now, we trust frontend sent correct ID from our API
        return data


# ===================================================================
# 2. DATA PLANS REQUEST
# ===================================================================
class DataPlansRequestSerializer(serializers.Serializer):
    network = serializers.ChoiceField(
        choices=["mtn", "airtel", "glo", "9mobile"],
        required=True
    )
    category = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Filter: SME, SME2, GIFTING, CORPORATE, REGULAR"
    )

    def validate_category(self, value):
        value = value.strip().upper()
        if value and value not in ["SME", "SME2", "GIFTING", "CORPORATE", "REGULAR"]:
            raise serializers.ValidationError("Invalid category")
        return value


# ===================================================================
# 3. AIRTIME PURCHASE (Normal VTU)
# ===================================================================
class AirtimePurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["mtn", "airtel", "glo", "9mobile"])
    phone = NigerianPhoneField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=50, max_value=100000)


# ===================================================================
# 4. AIRTIME TO CASH (2025 MUST-HAVE!)
# ===================================================================
class AirtimeToCashSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["mtn", "airtel", "glo", "9mobile"])
    phone = NigerianPhoneField(help_text="Phone receiving the airtime (must be same network)")
    amount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=100,
        max_value=500000,
        help_text="Amount of airtime to convert"
    )

    def validate(self, data):
        amount = data["amount"]
        # Example: 5% fee → user gets 95%
        fee = amount * Decimal("0.05")  # adjust per your rate
        credited = amount - fee
        data["credited_amount"] = credited.quantize(Decimal("0.01"))
        data["fee"] = fee.quantize(Decimal("0.01"))
        return data


# ===================================================================
# 5. CABLE TV
# ===================================================================
class CableTVPurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["dstv", "gotv", "startimes"])
    decoder_number = serializers.CharField(max_length=15, min_length=8)
    variation_code = serializers.CharField(max_length=50, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=100)
    phone = NigerianPhoneField(required=False, allow_blank=True)
    subscription_type = serializers.ChoiceField(
        choices=["change", "renew"],
        default="change"
    )

    def validate(self, data):
        if data["subscription_type"] == "change" and not data.get("variation_code"):
            raise serializers.ValidationError({"variation_code": "Required for subscription change"})
        return data


# ===================================================================
# 6. ELECTRICITY
# ===================================================================
class ElectricityPurchaseSerializer(serializers.Serializer):
    disco = serializers.CharField(max_length=50)
    meter_number = serializers.CharField(max_length=15, min_length=11)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=500)
    phone = NigerianPhoneField(required=False, allow_blank=True)


# ===================================================================
# 7. EDUCATION
# ===================================================================
class EducationPurchaseSerializer(serializers.Serializer):
    exam_type = serializers.ChoiceField(choices=["waec", "neco", "jamb"])
    pin = serializers.CharField(max_length=30)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1000)
    phone = NigerianPhoneField(required=False, allow_blank=True)