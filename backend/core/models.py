from django.db import models
from django.utils import timezone
from django.core.cache import cache


class AppSettings(models.Model):
    """
    Singleton model to store application-wide settings.
    Only one instance should exist in the database.
    """
    maintenance_enabled = models.BooleanField(
        default=False,
        help_text="Enable maintenance mode for the entire application"
    )
    maintenance_message = models.CharField(
        max_length=500,
        default="We are currently performing scheduled maintenance. Please check back soon.",
        help_text="Custom message to display during maintenance"
    )
    maintenance_start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When maintenance mode was enabled"
    )
    maintenance_end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Estimated time when maintenance will end"
    )
    show_countdown = models.BooleanField(
        default=True,
        help_text="Show countdown timer on maintenance page"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Application Settings"
        verbose_name_plural = "Application Settings"

    def __str__(self):
        status = "Enabled" if self.maintenance_enabled else "Disabled"
        return f"Maintenance Mode: {status}"

    def save(self, *args, **kwargs):
        """
        Ensure only one instance exists (singleton pattern).
        Also clear cache when settings are updated.
        """
        self.pk = 1
        super().save(*args, **kwargs)
        # Clear cache when settings are updated
        cache.delete('maintenance_settings')

    @classmethod
    def get_settings(cls):
        """
        Get or create the singleton settings instance.
        Uses cache to minimize database queries.
        """
        settings = cache.get('maintenance_settings')
        if settings is None:
            settings, _ = cls.objects.get_or_create(pk=1)
            cache.set('maintenance_settings', settings, 60)  # Cache for 60 seconds
        return settings

    @classmethod
    def is_maintenance_active(cls):
        """Check if maintenance mode is currently active"""
        settings = cls.get_settings()
        return settings.maintenance_enabled
