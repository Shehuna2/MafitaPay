from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, UserProfile
from p2p.models import Wallet
from django.urls import reverse
from django.utils.html import format_html


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "Profile"
    fk_name = "user"

class UserProfileAdmin(admin.ModelAdmin):
    model = UserProfile
    list_display = ("user", "phone_number", "account_no", "bank_name")
    search_fields = ("user__email", "phone_number")
    readonly_fields = ("user",)


class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ('email', 'is_merchant', 'is_staff', 'is_superuser', 'referral_code', 'referred_by')
    list_filter = ('is_merchant', 'is_staff', 'is_superuser')
    search_fields = ('email',)
    ordering = ('email',)

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Merchant Info', {'fields': ('is_merchant',)}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'is_merchant', 'is_staff', 'is_superuser'),
        }),
    )

    inlines = [UserProfileInline]  # Attach profile inline


class CustomAdminSite(admin.AdminSite):
    site_header = "Admin Panel"

    def admin_dashboard_link(self):
        url = reverse("admin_dashboard")
        return format_html('<a href="{}" class="button">Order Metrics Dashboard</a>', url)


admin_site = CustomAdminSite(name="custom_admin")


admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(User, CustomUserAdmin)
