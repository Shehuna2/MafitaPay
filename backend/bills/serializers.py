# bills/serializers.py
from rest_framework import serializers

class AirtimePurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["mtn", "airtel", "glo", "9mobile"])
    phone = serializers.CharField(max_length=11, min_length=11)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=50)

class DataPurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["mtn", "airtel", "glo", "9mobile"])
    phone = serializers.CharField(max_length=11, min_length=11)
    variation_code = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=50)

class DataPlansSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["mtn", "airtel", "glo", "9mobile"])

class CableTVPurchaseSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=["dstv", "gotv", "startimes"])
    decoder_number = serializers.CharField(max_length=10, min_length=10)
    variation_code = serializers.CharField()
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=100)
    phone = serializers.CharField(max_length=11, min_length=11, required=False, allow_blank=True)

class ElectricityPurchaseSerializer(serializers.Serializer):
    disco = serializers.CharField()  # e.g., "ikeja", "abuja"
    meter_number = serializers.CharField(max_length=11, min_length=11)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=500)
    phone = serializers.CharField(max_length=11, min_length=11, required=False, allow_blank=True)

class EducationPurchaseSerializer(serializers.Serializer):
    exam_type = serializers.ChoiceField(choices=["waec", "neco", "jamb"])
    pin = serializers.CharField(max_length=20)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=15000)
    phone = serializers.CharField(max_length=11, min_length=11, required=False, allow_blank=True)

class BillVariationsSerializer(serializers.Serializer):
    service_type = serializers.CharField()  # e.g., "dstv", "ikeja", "waec"