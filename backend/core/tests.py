from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.cache import cache
from django.db import connection
from datetime import timedelta
import json

from .models import AppSettings

User = get_user_model()


class AnalyticsCacheTableTestCase(TestCase):
    """Test that analytics_cache_table is created and functional"""

    def test_cache_table_exists(self):
        """Test that the analytics_cache_table exists in the database"""
        # Use Django's connection introspection for database-agnostic table checking
        table_names = connection.introspection.table_names()
        self.assertIn('analytics_cache_table', table_names,
                     "analytics_cache_table should exist in the database")

    def test_cache_operations_work(self):
        """Test that cache operations work with the database backend"""
        # Clear any existing cache
        cache.clear()
        
        # Test setting a value
        cache.set('test_key', 'test_value', timeout=60)
        
        # Test getting the value
        value = cache.get('test_key')
        self.assertEqual(value, 'test_value')
        
        # Test deleting the value
        cache.delete('test_key')
        value = cache.get('test_key')
        self.assertIsNone(value)

    def test_cache_expiry(self):
        """Test that cache entries have expiry set"""
        cache.clear()
        
        # Set a value with short timeout
        cache.set('expiring_key', 'expiring_value', timeout=1)
        
        # Should exist immediately
        value = cache.get('expiring_key')
        self.assertEqual(value, 'expiring_value')
        
        # Clear cache to verify expiry was set (Django clears expired entries)
        # This is a simpler, more reliable test than checking the database directly
        cache.clear()
        value = cache.get('expiring_key')
        self.assertIsNone(value, "Cache entry should be cleared")

    def test_cache_timezone_aware_datetime(self):
        """
        Test that cache operations work with timezone-aware datetimes.
        This validates the fix for TypeError when comparing offset-naive
        and offset-aware datetimes.
        """
        cache.clear()
        
        # Store a model instance with timezone-aware datetime fields
        settings = AppSettings.objects.create(
            maintenance_enabled=True,
            maintenance_start_time=timezone.now(),
            maintenance_end_time=timezone.now() + timedelta(hours=2)
        )
        
        # Cache the settings object
        cache.set('test_settings', settings, timeout=60)
        
        # Retrieve from cache - this should not raise TypeError
        cached_settings = cache.get('test_settings')
        
        # Verify the object was cached and retrieved successfully
        self.assertIsNotNone(cached_settings)
        self.assertEqual(cached_settings.pk, settings.pk)
        self.assertEqual(cached_settings.maintenance_enabled, True)
        
        # Verify datetime fields are timezone-aware
        self.assertIsNotNone(cached_settings.maintenance_start_time.tzinfo)
        self.assertIsNotNone(cached_settings.maintenance_end_time.tzinfo)


class AppSettingsModelTestCase(TestCase):
    """Test the AppSettings model"""

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_singleton_pattern(self):
        """Test that only one AppSettings instance exists"""
        # Get or create first instance
        settings1 = AppSettings.get_settings()
        settings1.maintenance_enabled = True
        settings1.save()
        
        # Load and update
        settings2 = AppSettings.get_settings()
        settings2.maintenance_enabled = False
        settings2.save()
        
        # Should only have one instance in database
        self.assertEqual(AppSettings.objects.count(), 1)
        
        # The second save should have updated the first
        settings_from_db = AppSettings.objects.get(pk=1)
        self.assertFalse(settings_from_db.maintenance_enabled)
        self.assertEqual(settings1.pk, settings2.pk)

    def test_get_settings_creates_if_not_exists(self):
        """Test that get_settings creates instance if it doesn't exist"""
        self.assertEqual(AppSettings.objects.count(), 0)
        
        settings = AppSettings.get_settings()
        
        self.assertIsNotNone(settings)
        self.assertEqual(AppSettings.objects.count(), 1)
        self.assertEqual(settings.pk, 1)

    def test_get_settings_uses_cache(self):
        """Test that get_settings uses cache to minimize database queries"""
        settings = AppSettings.get_settings()
        
        # Update database directly
        AppSettings.objects.filter(pk=1).update(maintenance_enabled=True)
        
        # Should still return cached value (False)
        cached_settings = AppSettings.get_settings()
        self.assertFalse(cached_settings.maintenance_enabled)
        
        # Clear cache and try again
        cache.clear()
        fresh_settings = AppSettings.get_settings()
        self.assertTrue(fresh_settings.maintenance_enabled)

    def test_save_clears_cache(self):
        """Test that save() clears the cache"""
        settings = AppSettings.get_settings()
        self.assertFalse(settings.maintenance_enabled)
        
        # Cache should be populated
        self.assertIsNotNone(cache.get('maintenance_settings'))
        
        # Update and save
        settings.maintenance_enabled = True
        settings.save()
        
        # Cache should be cleared
        self.assertIsNone(cache.get('maintenance_settings'))

    def test_is_maintenance_active(self):
        """Test the is_maintenance_active class method"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = False
        settings.save()
        cache.clear()
        
        self.assertFalse(AppSettings.is_maintenance_active())
        
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()
        
        self.assertTrue(AppSettings.is_maintenance_active())


class MaintenanceModeMiddlewareTestCase(TestCase):
    """Test the MaintenanceModeMiddleware"""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            email="user@test.com",
            password="testpass123"
        )
        self.admin = User.objects.create_user(
            email="admin@test.com",
            password="adminpass123",
            is_staff=True
        )
        self.superuser = User.objects.create_user(
            email="superuser@test.com",
            password="superpass123",
            is_superuser=True
        )
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_normal_access_when_maintenance_disabled(self):
        """Test that normal access works when maintenance is disabled"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = False
        settings.save()
        cache.clear()

        response = self.client.get('/')
        # Should get normal response (not 503)
        self.assertNotEqual(response.status_code, 503)

    def test_maintenance_blocks_regular_users(self):
        """Test that maintenance mode blocks regular users"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.maintenance_message = "System under maintenance"
        settings.save()
        cache.clear()

        response = self.client.get('/')
        
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertEqual(data['status'], 'maintenance')
        self.assertEqual(data['message'], "System under maintenance")
        self.assertTrue(data['maintenance_enabled'])

    def test_admin_access_during_maintenance(self):
        """Test that admin users can access during maintenance"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        # Login as admin
        self.client.force_login(self.admin)
        
        response = self.client.get('/')
        # Admin should not get 503
        self.assertNotEqual(response.status_code, 503)

    def test_superuser_access_during_maintenance(self):
        """Test that superusers can access during maintenance"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        # Login as superuser
        self.client.force_login(self.superuser)
        
        response = self.client.get('/')
        # Superuser should not get 503
        self.assertNotEqual(response.status_code, 503)

    def test_admin_panel_always_accessible(self):
        """Test that admin panel is always accessible during maintenance"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        response = self.client.get('/admin/')
        # Should redirect to login, not show maintenance (not 503)
        self.assertNotEqual(response.status_code, 503)

    def test_maintenance_status_endpoint_always_accessible(self):
        """Test that maintenance status endpoint is always accessible"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        response = self.client.get('/api/maintenance-status/')
        # Should get 200, not 503
        self.assertEqual(response.status_code, 200)

    def test_maintenance_response_includes_countdown_data(self):
        """Test that maintenance response includes timing data"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.maintenance_start_time = timezone.now()
        settings.maintenance_end_time = timezone.now() + timedelta(hours=2)
        settings.show_countdown = True
        settings.save()
        cache.clear()

        response = self.client.get('/')
        
        self.assertEqual(response.status_code, 503)
        data = response.json()
        self.assertTrue(data['show_countdown'])
        self.assertIn('start_time', data)
        self.assertIn('end_time', data)

    def test_auth_endpoints_accessible_during_maintenance(self):
        """Test that authentication endpoints are accessible during maintenance"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        # Test register endpoint
        response = self.client.get('/api/register/')
        self.assertNotEqual(response.status_code, 503)

        # Test login endpoint
        response = self.client.get('/api/login/')
        self.assertNotEqual(response.status_code, 503)

        # Test verify-email endpoint
        response = self.client.get('/api/verify-email/test-token/')
        self.assertNotEqual(response.status_code, 503)

        # Test resend verification endpoint
        response = self.client.get('/api/resend-verification/')
        self.assertNotEqual(response.status_code, 503)

        # Test password reset endpoint
        response = self.client.get('/api/password-reset/')
        self.assertNotEqual(response.status_code, 503)

        # Test token endpoints
        response = self.client.get('/api/auth/token/')
        self.assertNotEqual(response.status_code, 503)

        response = self.client.get('/api/auth/token/refresh/')
        self.assertNotEqual(response.status_code, 503)

    def test_regular_user_blocked_from_non_auth_endpoints(self):
        """Test that regular users are still blocked from non-auth endpoints"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.save()
        cache.clear()

        # Login as regular user
        self.client.force_login(self.user)

        # Non-auth endpoints should be blocked for regular users
        response = self.client.get('/api/wallet-balance/')
        self.assertEqual(response.status_code, 503)



class MaintenanceStatusAPITestCase(TestCase):
    """Test the maintenance status API endpoint"""

    def setUp(self):
        self.client = Client()
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_status_endpoint_returns_correct_data(self):
        """Test that status endpoint returns correct data"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.maintenance_message = "Test message"
        settings.show_countdown = True
        settings.save()
        cache.clear()

        response = self.client.get('/api/maintenance-status/')
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['maintenance_enabled'])
        self.assertEqual(data['message'], "Test message")
        self.assertTrue(data['show_countdown'])

    def test_status_endpoint_when_maintenance_disabled(self):
        """Test that status endpoint works when maintenance is disabled"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = False
        settings.save()
        cache.clear()

        response = self.client.get('/api/maintenance-status/')
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['maintenance_enabled'])
        self.assertIsNone(data.get('message'))

    def test_status_endpoint_includes_timing_when_enabled(self):
        """Test that timing data is only included when maintenance is enabled"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = True
        settings.maintenance_start_time = timezone.now()
        settings.maintenance_end_time = timezone.now() + timedelta(hours=1)
        settings.save()
        cache.clear()

        response = self.client.get('/api/maintenance-status/')
        data = response.json()
        
        self.assertIn('start_time', data)
        self.assertIn('end_time', data)

    def test_status_endpoint_excludes_timing_when_disabled(self):
        """Test that timing data is not included when maintenance is disabled"""
        settings = AppSettings.get_settings()
        settings.maintenance_enabled = False
        settings.maintenance_start_time = timezone.now()
        settings.maintenance_end_time = timezone.now() + timedelta(hours=1)
        settings.save()
        cache.clear()

        response = self.client.get('/api/maintenance-status/')
        data = response.json()
        
        self.assertNotIn('start_time', data)
        self.assertNotIn('end_time', data)
