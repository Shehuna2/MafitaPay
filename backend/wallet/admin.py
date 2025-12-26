from django.contrib import admin

from .models import Wallet, WalletTransaction, VirtualAccount, Deposit, CardDepositExchangeRate, CardDeposit

class WalletAdmin(admin.ModelAdmin):
    list_display = ("user", "balance", "locked_balance")
    search_fields = ("user__email",)
    actions = ["add_funds"]
    
    def add_funds(self, request, queryset):
        for wallet in queryset:
            wallet.deposit(5000)  # Add NGN 5000 for testing
        self.message_user(request, "Added NGN 5000 to selected wallets.")

    add_funds.short_description = "Add NGN 5000 to selected wallets"

admin.site.register(Wallet, WalletAdmin)

@admin.register(WalletTransaction)
class WalletTransactionAdmin(admin.ModelAdmin):
    list_display = ("user", "request_id", "tx_type", "amount", "category", "status", "created_at")
    list_filter  = ("tx_type", "status", "created_at")
    search_fields = ("order__id", "order__user__username")
    ordering     = ("-created_at",)
    # readonly_fields = ("amount",)


@admin.register(VirtualAccount)
class VirtualAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "account_number", "bank_name", "account_name", "provider", "assigned", "created_at")
    search_fields = ("user__username", "user__email", "account_number", "bank_name")
    list_filter  = ("provider", "assigned", "created_at")
    ordering     = ("-created_at",)
    readonly_fields = ("created_at", "metadata")
    
    fieldsets = (
        ("Account Information", {
            "fields": ("user", "provider", "provider_account_id", "account_number", "bank_name", "account_name")
        }),
        ("Status & Metadata", {
            "fields": ("assigned", "currency", "expires_at", "created_at", "metadata"),
            "classes": ("collapse",)
        }),
    )


class DepositAdmin(admin.ModelAdmin):
    list_display = ("user", "amount", "status", "created_at")
    list_filter  = ("status", "created_at")
    search_fields = ("user__username", "user__email", "reference")
    ordering     = ("-created_at",)
    # readonly_fields = ("user", "amount", "status", "reference", "created_at")

admin.site.register(Deposit, DepositAdmin)


@admin.register(CardDepositExchangeRate)
class CardDepositExchangeRateAdmin(admin.ModelAdmin):
    list_display = ("currency", "rate", "flutterwave_fee_percent", "platform_margin_percent", "updated_at")
    list_filter = ("currency",)
    search_fields = ("currency",)
    ordering = ("currency",)
    readonly_fields = ("created_at", "updated_at")
    
    fieldsets = (
        ("Currency Information", {
            "fields": ("currency", "rate")
        }),
        ("Fee Structure", {
            "fields": ("flutterwave_fee_percent", "platform_margin_percent")
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )


@admin.register(CardDeposit)
class CardDepositAdmin(admin.ModelAdmin):
    list_display = ("user", "amount", "currency", "ngn_amount", "status", "card_last4", "created_at")
    list_filter = ("status", "currency", "use_live_mode", "created_at")
    search_fields = ("user__email", "flutterwave_tx_ref", "flutterwave_tx_id", "card_last4")
    ordering = ("-created_at",)
    readonly_fields = (
        "id", "flutterwave_tx_ref", "flutterwave_tx_id", "exchange_rate", 
        "gross_ngn", "flutterwave_fee", "platform_margin", "raw_response",
        "created_at", "updated_at"
    )
    
    fieldsets = (
        ("User Information", {
            "fields": ("user",)
        }),
        ("Transaction Details", {
            "fields": (
                "currency", "amount", "exchange_rate", "gross_ngn", 
                "flutterwave_fee", "platform_margin", "ngn_amount"
            )
        }),
        ("Flutterwave Details", {
            "fields": ("flutterwave_tx_ref", "flutterwave_tx_id", "status", "use_live_mode")
        }),
        ("Card Details (Masked)", {
            "fields": ("card_last4", "card_brand")
        }),
        ("Metadata", {
            "fields": ("raw_response", "created_at", "updated_at"),
            "classes": ("collapse",)
        }),
    )