# wallet/serializers.py
from rest_framework import serializers
from .models import WalletTransaction, Wallet, Notification, VirtualAccount


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = [
            "id",
            "tx_type",
            "category",
            "amount",
            "balance_before",
            "balance_after",
            "status",
            "request_id",
            "reference",
            "created_at",
            "metadata",
        ]


# wallet/serializers.py
class WalletSerializer(serializers.ModelSerializer):
    van_account_number = serializers.SerializerMethodField()
    van_bank_name = serializers.SerializerMethodField()
    van_account_name = serializers.SerializerMethodField()
    van_provider_display = serializers.SerializerMethodField()

    class Meta:
        model = Wallet
        fields = [
            "balance",
            "locked_balance",
            "van_account_number",
            "van_bank_name",
            "van_account_name",
            "van_provider",
            "van_provider_display",
        ]

    def get_dva(self, obj):
        request = self.context.get("request")
        provider = None
        if request:
            provider = request.query_params.get("provider")
        qs = VirtualAccount.objects.filter(user=obj.user, assigned=True)
        if provider:
            qs = qs.filter(provider=provider.lower())
        return qs.first()

    def get_van_account_number(self, obj):
        dva = self.get_dva(obj)
        return getattr(dva, "account_number", None)

    def get_van_bank_name(self, obj):
        dva = self.get_dva(obj)
        return getattr(dva, "bank_name", None)

    def get_van_account_name(self, obj):
        dva = self.get_dva(obj)
        if dva:
            return getattr(dva, "account_name", obj.user.get_full_name() or obj.user.email)
        return obj.user.get_full_name() or obj.user.email

    def get_van_provider_display(self, obj):
        dva = self.get_dva(obj)
        provider = getattr(dva, "provider", None)
        if provider:
            return provider.capitalize()
        return None



class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "message", "is_read", "created_at"]
