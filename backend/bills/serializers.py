from rest_framework import serializers

class AirtimePurchaseSerializer(serializers.Serializer):
    network = serializers.CharField()
    phone = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)


class DataPurchaseSerializer(serializers.Serializer):
    network = serializers.CharField()
    phone = serializers.CharField()
    plan = serializers.CharField()  # plan code from VTpass or similar


class DataPlansSerializer(serializers.Serializer):
    network = serializers.CharField()
