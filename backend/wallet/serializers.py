# wallet/serializers.py
from rest_framework import serializers
from .models import WalletTransaction, Wallet, Notification, VirtualAccount, CardDepositExchangeRate, CardDeposit
from .utils import extract_bank_name


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


# ----------------------------------------------------------------------
# NEW: Serializer for a single VirtualAccount (used inside WalletSerializer)
# ----------------------------------------------------------------------
class VirtualAccountSerializer(serializers.ModelSerializer):
    bank_name = serializers.SerializerMethodField()

    class Meta:
        model = VirtualAccount
        fields = ["id", "account_number", "bank_name", "provider"]

    def get_type(self, obj):
        return "static"

    def get_bank_name(self, obj):
        # Try DB field first
        if obj.bank_name:
            return obj.bank_name
        
        # Fallback: extract from metadata across multiple nested paths
        metadata = obj.metadata or {}
        return extract_bank_name(metadata, default="Bank")


# ----------------------------------------------------------------------
# WalletSerializer – now returns **all** assigned Virtual Accounts
# ----------------------------------------------------------------------
class WalletSerializer(serializers.ModelSerializer):
    van_account_number = serializers.SerializerMethodField()
    van_bank_name = serializers.SerializerMethodField()
    van_account_name = serializers.SerializerMethodField()
    van_provider_display = serializers.SerializerMethodField()

    virtual_accounts = serializers.SerializerMethodField()

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
            "virtual_accounts",
        ]

    def get_virtual_accounts(self, obj):
        qs = VirtualAccount.objects.filter(user=obj.user, assigned=True)
        return VirtualAccountSerializer(qs, many=True, context=self.context).data

    # ------------------------------------------------------------------
    # Helper – returns the *first* VA (or the one matching ?provider=…)
    # ------------------------------------------------------------------
    def get_dva(self, obj):
        request = self.context.get("request")
        provider = None
        if request:
            provider = request.query_params.get("provider")
        qs = VirtualAccount.objects.filter(user=obj.user, assigned=True)
        if provider:
            qs = qs.filter(provider=provider.lower())
        return qs.first()

    # ------------------------------------------------------------------
    # Legacy single-VA getters – unchanged
    # ------------------------------------------------------------------
    def get_van_account_number(self, obj):
        dva = self.get_dva(obj)
        return getattr(dva, "account_number", None)

    def get_van_bank_name(self, obj):
        dva = self.get_dva(obj)
        return getattr(dva, "bank_name", None)

    def get_van_account_name(self, obj):
        dva = self.get_dva(obj)

        # when VA exists
        if dva:
            name = dva.account_name
            if name and name.strip():
                return name

            # fallback (correct behaviour)
            return obj.user.get_full_name() or obj.user.email

        # when no VA exists at all
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


class CardDepositExchangeRateSerializer(serializers.ModelSerializer):
    """Serializer for card deposit exchange rates"""
    class Meta:
        model = CardDepositExchangeRate
        fields = [
            'currency',
            'rate',
            'flutterwave_fee_percent',
            'platform_margin_percent',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CardDepositSerializer(serializers.ModelSerializer):
    """Serializer for card deposit transactions"""
    class Meta:
        model = CardDeposit
        fields = [
            'id',
            'currency',
            'amount',
            'exchange_rate',
            'ngn_amount',
            'gross_ngn',
            'flutterwave_fee',
            'platform_margin',
            'flutterwave_tx_ref',
            'flutterwave_tx_id',
            'status',
            'card_last4',
            'card_brand',
            'use_live_mode',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id', 'exchange_rate', 'ngn_amount', 'gross_ngn',
            'flutterwave_fee', 'platform_margin', 'flutterwave_tx_id',
            'status', 'card_last4', 'card_brand', 'created_at', 'updated_at'
        ]


from decimal import Decimal
from rest_framework import serializers

SUPPORTED_CARD_CURRENCIES = {"USD", "GBP", "EUR"}


class CardDepositInitiateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField(max_length=3)
    card_number = serializers.CharField()
    cvv = serializers.CharField()
    expiry_month = serializers.CharField()
    expiry_year = serializers.CharField()
    fullname = serializers.CharField()
    use_live = serializers.BooleanField(required=False, default=False)

    def validate_currency(self, value):
        value = value.upper()
        if value not in SUPPORTED_CARD_CURRENCIES:
            raise serializers.ValidationError(
                f"Card deposits only support: {', '.join(SUPPORTED_CARD_CURRENCIES)}"
            )
        return value

    def validate_amount(self, value: Decimal):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value