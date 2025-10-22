# serializers.py

from rest_framework import serializers
from .models import AssetSellOrder, ExchangeInfo, ExchangeRate, PaymentProof


class AssetSellOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetSellOrder
        fields = [
            "id",
            "order_id",
            "asset",          # ✅ fixed (was asset_type)
            "source",         # ✅ fixed (was exchange_id)
            "amount_asset",   # ✅ fixed (was amount)
            "rate_ngn",
            "amount_ngn",
            "status",
            "details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "order_id",
            "rate_ngn",
            "amount_ngn",
            "status",
            "created_at",
            "updated_at",
        ]


class PaymentProofSerializer(serializers.Serializer):
    payment_proof = serializers.ImageField()

    def validate_payment_proof(self, value):
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Image size should not exceed 5MB.")
        return value


class ExchangeInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeInfo
        fields = [
            "id",
            "exchange",
            "receive_qr",
            "contact_info",
        ]
        read_only_fields = ["id", "exchange", "receive_qr", "contact_info"]

    def get_qr_url(self, obj):
        if obj.receive_qr:
            return obj.receive_qr.url
        return None

class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["asset", "rate_ngn", "updated_at"]


