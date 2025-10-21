from rest_framework import serializers
from .models import WalletTransaction, Wallet


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

class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = [
            "balance",
            "locked_balance",
            "van_account_number",
            "van_bank_name",
            "van_provider",
        ]