# rewards/serializers.py
from rest_framework import serializers
from .models import Bonus, BonusType

class BonusTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BonusType
        fields = "__all__"

class BonusSerializer(serializers.ModelSerializer):
    bonus_type_name = serializers.CharField(source="bonus_type.name", read_only=True)
    class Meta:
        model = Bonus
        fields = ["id","user","bonus_type","bonus_type_name","amount","status","description","metadata","created_at","activated_at","expires_at"]
        read_only_fields = ["status","created_at","activated_at"]
