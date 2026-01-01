from django.contrib import admin
from django.utils import timezone
from .models import AppSettings


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    """
    Admin interface for managing maintenance mode settings.
    """
    list_display = (
        'maintenance_enabled',
        'maintenance_message_preview',
        'maintenance_start_time',
        'maintenance_end_time',
        'show_countdown',
        'updated_at'
    )
    
    fieldsets = (
        ('Maintenance Mode', {
            'fields': ('maintenance_enabled', 'maintenance_message'),
            'description': 'Toggle maintenance mode and customize the message displayed to users'
        }),
        ('Schedule', {
            'fields': ('maintenance_start_time', 'maintenance_end_time', 'show_countdown'),
            'description': 'Set maintenance window and countdown timer visibility'
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    readonly_fields = ('created_at', 'updated_at')
    
    def maintenance_message_preview(self, obj):
        """Show a preview of the maintenance message"""
        if len(obj.maintenance_message) > 50:
            return f"{obj.maintenance_message[:50]}..."
        return obj.maintenance_message
    maintenance_message_preview.short_description = "Message Preview"
    
    def has_add_permission(self, request):
        """Prevent adding multiple instances (singleton pattern)"""
        return not AppSettings.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of the settings instance"""
        return False
    
    def save_model(self, request, obj, form, change):
        """Set start_time when enabling maintenance mode"""
        if obj.maintenance_enabled and not obj.maintenance_start_time:
            obj.maintenance_start_time = timezone.now()
        # Note: We don't clear times when disabling to preserve history
        super().save_model(request, obj, form, change)
