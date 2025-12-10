# rewards/admin.py
from django.contrib import admin
from .models import BonusType, Bonus
from django.db import transaction
from wallet.models import WalletTransaction


@admin.register(BonusType)
class BonusTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "display_name", "is_active", "default_amount", "default_expiry_days")
    list_editable = ("is_active", "default_amount")
    search_fields = ("name", "display_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(Bonus)
class BonusAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "bonus_type", "amount", "status", "activated_at", "expires_at", "created_at")
    list_filter = ("status", "bonus_type")
    search_fields = ("user__email", "bonus_type__name")
    actions = ("unlock_selected", "expire_selected", "reverse_selected")

    def unlock_selected(self, request, queryset):
        for b in queryset:
            if b.status == "locked":
                b.unlock()
        self.message_user(request, "Selected bonuses unlocked.")
    unlock_selected.short_description = "Unlock selected bonuses"

    def expire_selected(self, request, queryset):
        for b in queryset:
            b.expire()
        self.message_user(request, "Selected bonuses expired.")
    expire_selected.short_description = "Expire selected bonuses"

    def reverse_selected(self, request, queryset):
        # reversing should remove credited locked_balance if applied — careful
        from wallet.models import Wallet
        for b in queryset:
            if b.status == "unlocked":
                wallet = b.user.wallet
                with transaction.atomic():
                    w = Wallet.objects.select_for_update().get(id=wallet.id)
                    amount = b.amount
                    if w.locked_balance >= amount:
                        w.locked_balance -= amount
                        w.save(update_fields=["locked_balance"])
                        # create reversal tx
                        WalletTransaction.objects.create(
                            user=b.user,
                            wallet=w,
                            tx_type="debit",
                            category="bonus",
                            amount=amount,
                            balance_before=getattr(w, "balance", 0),
                            balance_after=getattr(w, "balance", 0),
                            reference=f"Reversal of bonus {b.id}",
                            status="success",
                            metadata={"reversed_bonus": b.id},
                        )
                        b.status = "reversed"
                        b.save(update_fields=["status", "updated_at"])
        self.message_user(request, "Selected bonuses reversed where applicable.")
    reverse_selected.short_description = "Reverse selected bonuses"
