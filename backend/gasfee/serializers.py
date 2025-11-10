# serializers.py

from rest_framework import serializers
from .models import AssetSellOrder, PaymentProof, Asset

class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ["id", "symbol", "name"]

class AssetSellOrderSerializer(serializers.ModelSerializer):
    asset = AssetSerializer(read_only=True)
    class Meta:
        model = AssetSellOrder
        fields = [
            "id",
            "order_id",
            "asset",
            "source",
            "amount_asset",
            "rate_ngn",
            "amount_ngn",
            "status",
            "details",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "order_id", "rate_ngn", "amount_ngn", "status", "created_at", "updated_at"]


class PaymentProofSerializer(serializers.Serializer):
    payment_proof = serializers.ImageField()

    def validate_payment_proof(self, value):
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Image size should not exceed 5MB.")
        return value



