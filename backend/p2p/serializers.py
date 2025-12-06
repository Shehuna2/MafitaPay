# backend/p2p/serializers.py
from rest_framework import serializers
from .models import Deposit_P2P_Offer, DepositOrder, Withdraw_P2P_Offer, WithdrawOrder
from accounts.models import UserProfile
from wallet.models import Wallet


class MerchantProfileSerializer(serializers.ModelSerializer):
    total_trades = serializers.IntegerField(read_only=True)
    success_rate = serializers.FloatField(read_only=True)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "first_name", "last_name", "full_name",
            "bank_name", "account_no", "phone_number",
            "total_trades", "success_rate"
        ]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()


class DepositOfferSerializer(serializers.ModelSerializer):
    merchant_email = serializers.EmailField(source="merchant.email", read_only=True)
    merchant_profile = MerchantProfileSerializer(source="merchant.profile", read_only=True)
    class Meta:
        model = Deposit_P2P_Offer
        fields = ["id", "merchant", "merchant_email", "merchant_profile", "amount_available", "min_amount", "max_amount", "price_per_unit", "is_available", "created_at"]
        read_only_fields = ["merchant", "merchant_email", "merchant_profile", "created_at"]

class DepositOrderSerializer(serializers.ModelSerializer):
    buyer_email = serializers.EmailField(source="buyer.email", read_only=True)
    seller_email = serializers.EmailField(source="sell_offer.merchant.email", read_only=True)
    sell_offer_detail = DepositOfferSerializer(source="sell_offer", read_only=True)
    buyer_profile = MerchantProfileSerializer(source="buyer.profile", read_only=True)
    seller_profile = MerchantProfileSerializer(source="sell_offer.merchant.profile", read_only=True)
    class Meta:
        model = DepositOrder
        fields = [
            "id", "buyer", "buyer_email", "buyer_profile",
            "sell_offer", "sell_offer_detail", "seller_email", "seller_profile",
            "amount_requested", "total_price", "status", "created_at"
        ]
        read_only_fields = ["id", "buyer", "buyer_email", "buyer_profile", "sell_offer", "sell_offer_detail", "seller_email", "seller_profile", "total_price", "status", "created_at"]

class CreateDepositOfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deposit_P2P_Offer
        fields = ["amount_available", "min_amount", "max_amount", "price_per_unit", "is_available"]

class WithdrawOfferSerializer(serializers.ModelSerializer):
    merchant_email = serializers.EmailField(source="merchant.email", read_only=True)
    merchant_profile = MerchantProfileSerializer(source="merchant.profile", read_only=True)
    class Meta:
        model = Withdraw_P2P_Offer
        fields = ["id", "merchant", "merchant_email", "merchant_profile", "amount_available", "min_amount", "max_amount", "price_per_unit", "is_active", "created_at"]
        read_only_fields = ["merchant", "merchant_email", "merchant_profile", "created_at"]

class CreateWithdrawOfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Withdraw_P2P_Offer
        fields = ["amount_available", "min_amount", "max_amount", "price_per_unit", "is_active"]

class WithdrawOrderSerializer(serializers.ModelSerializer):
    seller_email = serializers.EmailField(source="seller.email", read_only=True)
    buyer_email = serializers.EmailField(source="buyer_offer.merchant.email", read_only=True)
    buyer_offer_detail = WithdrawOfferSerializer(source="buyer_offer", read_only=True)
    seller_profile = MerchantProfileSerializer(source="seller.profile", read_only=True)
    buyer_profile = MerchantProfileSerializer(source="buyer_offer.merchant.profile", read_only=True)
    class Meta:
        model = WithdrawOrder
        fields = [
            "id", "buyer_offer", "buyer_offer_detail", "seller", "seller_email", "seller_profile",
            "buyer_email", "buyer_profile", "amount_requested", "total_price", "status", "created_at"
        ]
        read_only_fields = ["id", "buyer_offer", "seller", "seller_email", "seller_profile", "buyer_email", "buyer_profile", "total_price", "status", "created_at"]
    def validate(self, data):
        buyer_offer = self.instance.buyer_offer if self.instance else data.get('buyer_offer')
        amount_requested = data.get('amount_requested', self.instance.amount_requested if self.instance else None)
        if not buyer_offer:
            raise serializers.ValidationError("Buyer offer must be specified.")
        if amount_requested is None:
            raise serializers.ValidationError("Amount requested must be specified.")
        if amount_requested < buyer_offer.min_amount or amount_requested > buyer_offer.max_amount:
            raise serializers.ValidationError(f"Amount requested must be between {buyer_offer.min_amount} and {buyer_offer.max_amount}.")
        seller_wallet = Wallet.objects.filter(user=self.context['request'].user).first()
        if not seller_wallet or seller_wallet.balance < amount_requested:
            raise serializers.ValidationError("Insufficient balance to fulfill this order.")
        return data