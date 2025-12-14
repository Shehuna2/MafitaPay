from django.contrib import admin

from .models import Wallet, WalletTransaction, VirtualAccount

class WalletAdmin(admin.ModelAdmin):
    list_display = ("user", "balance")
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
    list_display = ("user", "account_number", "bank_name", "provider", "created_at")
    search_fields = ("user__username", "account_number")
    list_filter  = ("created_at", "provider")
    ordering     = ("-created_at",)

