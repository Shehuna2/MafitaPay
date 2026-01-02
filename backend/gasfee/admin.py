from django.contrib import admin
from django import forms
from .models import (
    AssetSellOrder, PaymentProof, Crypto,
    CryptoPurchase, ExchangeRateMargin, Asset, TransactionMonitoring
)


@admin.register(Crypto)
class CryptoAdmin(admin.ModelAdmin):
    list_display = ("symbol", "network", "coingecko_id")  # Display columns
    search_fields = ("name", "symbol", "coingecko_id")  # Enable search by name or symbol
    list_filter = ("symbol",)  # Filter by availability
    ordering = ("name",)

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.network in ['ARB', 'BASE', 'OP']:  # L2 Ethereum networks
            return ['coingecko_id']  # Make coingecko_id read-only
        return []

    def save_model(self, request, obj, form, change):
        if obj.network in ['ARB', 'BASE', 'OP']:  # If L2 Ethereum
            obj.coingecko_id = 'ethereum'  # Enforce coingecko_id
        super().save_model(request, obj, form, change)
        

@admin.register(CryptoPurchase)
class CryptoPurchaseAdmin(admin.ModelAdmin):
    list_display = ("user", "crypto", "input_amount", "input_currency", "crypto_amount", "total_price", "status", "created_at")
    list_filter = ("status", "input_currency", "crypto", "created_at")
    search_fields = ("user__username", "crypto__symbol", "wallet_address")
    readonly_fields = ("created_at",)
    fieldsets = (
        (None, {
            "fields": ("user", "crypto", "wallet_address", "status")
        }),
        ("Purchase Details", {
            "fields": ("input_amount", "input_currency", "crypto_amount", "total_price")
        }),
        ("Metadata", {
            "fields": ("created_at",)
        }),
    )

@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("name", "symbol", "coingecko_id")
    search_fields = ("name", "symbol")


# @admin.register(AssetPrice)
# class AssetPriceAdmin(admin.ModelAdmin):
#     list_display = ("asset", "price_usd", "last_updated")
#     search_fields = ("asset__symbol",)

class ExchangeRateMarginForm(forms.ModelForm):
    class Meta:
        model = ExchangeRateMargin
        fields = "__all__"

    def clean_profit_margin(self):
        profit_margin = self.cleaned_data.get("profit_margin")
        if profit_margin < 0:
            raise forms.ValidationError("Profit margin cannot be negative.")
        if profit_margin > 100000:
            raise forms.ValidationError("Profit margin seems unusually high — please review.")
        return profit_margin


@admin.register(ExchangeRateMargin)
class ExchangeRateMarginAdmin(admin.ModelAdmin):
    form = ExchangeRateMarginForm
    list_display = ("currency_pair", "margin_type", "profit_margin", "updated_at")
    list_editable = ("profit_margin",)
    list_filter = ("margin_type",)
    search_fields = ("currency_pair",)
    ordering = ("currency_pair",)

    fieldsets = (
        (None, {
            "fields": ("currency_pair", "margin_type", "profit_margin")
        }),
        ("Metadata", {
            "fields": ("updated_at",),
        }),
    )
    readonly_fields = ("updated_at",)

@admin.register(AssetSellOrder)
class SellOrderAdmin(admin.ModelAdmin):
    list_display   = (
        'id',
        'user',
        'asset',
        'source',
        'amount_asset',
        'rate_ngn',
        'amount_ngn',
        'status',
        'created_at',
    )
    list_filter    = ('asset', 'source', 'status', 'created_at')
    search_fields  = ('user__username', 'id')
    ordering       = ('-created_at',)
    readonly_fields = ('rate_ngn', 'amount_ngn', 'created_at')

    fieldsets = (
        (None, {
            'fields': ('user', 'asset', 'source', 'amount_asset')
        }),
        ('Computed & Status', {
            'fields': ('rate_ngn', 'amount_ngn', 'status', 'details', 'created_at'),
        }),
    )


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    list_display = ("order", "uploaded_at")
    readonly_fields = ("uploaded_at",)


@admin.register(TransactionMonitoring)
class TransactionMonitoringAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'user', 'event_type', 'severity', 
        'created_at', 'reviewed', 'reviewed_by'
    )
    list_filter = ('event_type', 'severity', 'reviewed', 'created_at')
    search_fields = ('user__username', 'user__email', 'description')
    ordering = ('-created_at',)
    readonly_fields = ('created_at', 'metadata')
    
    fieldsets = (
        (None, {
            'fields': ('user', 'event_type', 'severity', 'description')
        }),
        ('Metadata', {
            'fields': ('metadata', 'created_at'),
        }),
        ('Review', {
            'fields': ('reviewed', 'reviewed_at', 'reviewed_by', 'notes'),
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """Auto-set reviewed_by to current admin user when marking as reviewed"""
        if obj.reviewed and not obj.reviewed_by:
            obj.reviewed_by = request.user
            from django.utils import timezone
            obj.reviewed_at = timezone.now()
        super().save_model(request, obj, form, change)