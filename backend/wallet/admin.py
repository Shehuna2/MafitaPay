from django.contrib import admin

from .models import Wallet, WalletTransaction, VirtualAccount

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
    readonly_fields = ("amount",)


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

