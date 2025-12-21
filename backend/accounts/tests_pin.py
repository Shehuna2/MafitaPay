# backend/accounts/tests_pin.py
"""
Tests for Transaction PIN and Biometric Authentication
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta

User = get_user_model()


class PINManagementTestCase(TestCase):
    """Test cases for PIN management endpoints"""

    def setUp(self):
        """Set up test client and user"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='testuser@example.com',
            password='TestPass123!'
        )
        self.user.is_email_verified = True
        self.user.save()

        # Get authentication token
        response = self.client.post('/api/login/', {
            'email': 'testuser@example.com',
            'password': 'TestPass123!'
        })
        self.token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_pin_setup_success(self):
        """Test successful PIN setup"""
        response = self.client.post('/api/pin/setup/', {
            'pin': '8765',
            'pin_confirmation': '8765'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['success'])
        
        # Verify PIN was set
        self.user.refresh_from_db()
        self.assertTrue(self.user.has_transaction_pin())

    def test_pin_setup_mismatch(self):
        """Test PIN setup with mismatched confirmation"""
        response = self.client.post('/api/pin/setup/', {
            'pin': '8765',
            'pin_confirmation': '5678'
        })
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pin_setup_weak_pin(self):
        """Test PIN setup with weak PIN"""
        response = self.client.post('/api/pin/setup/', {
            'pin': '1234',
            'pin_confirmation': '1234'
        })
        
        # 1234 is considered weak and should be rejected
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pin_verify_success(self):
        """Test successful PIN verification"""
        # Setup PIN first
        self.user.set_transaction_pin('5678')
        
        response = self.client.post('/api/pin/verify/', {
            'pin': '5678'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

    def test_pin_verify_wrong_pin(self):
        """Test PIN verification with wrong PIN"""
        # Setup PIN first
        self.user.set_transaction_pin('5678')
        
        response = self.client.post('/api/pin/verify/', {
            'pin': '9999'
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('attempts_left', response.data)

    def test_pin_lockout_after_failed_attempts(self):
        """Test PIN lockout after 5 failed attempts"""
        # Setup PIN first
        self.user.set_transaction_pin('5678')
        
        # Make 5 failed attempts
        for i in range(5):
            response = self.client.post('/api/pin/verify/', {
                'pin': '9999'
            })
        
        # Check that PIN is now locked
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_pin_locked())
        
        # Try to verify with correct PIN - should still fail because locked
        response = self.client.post('/api/pin/verify/', {
            'pin': '5678'
        })
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pin_change_success(self):
        """Test successful PIN change"""
        # Setup initial PIN
        self.user.set_transaction_pin('5678')
        
        response = self.client.post('/api/pin/change/', {
            'old_pin': '5678',
            'new_pin': '9012',
            'new_pin_confirmation': '9012'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        # Verify old PIN no longer works
        self.user.refresh_from_db()
        self.assertFalse(self.user.check_transaction_pin('5678'))
        
        # Verify new PIN works
        self.assertTrue(self.user.check_transaction_pin('9012'))

    def test_pin_change_wrong_old_pin(self):
        """Test PIN change with wrong old PIN"""
        # Setup initial PIN
        self.user.set_transaction_pin('5678')
        
        response = self.client.post('/api/pin/change/', {
            'old_pin': '9999',
            'new_pin': '9012',
            'new_pin_confirmation': '9012'
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pin_status(self):
        """Test PIN status endpoint"""
        response = self.client.get('/api/pin/status/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['has_pin'])
        self.assertFalse(response.data['is_locked'])
        
        # Setup PIN and check again
        self.user.set_transaction_pin('5678')
        
        response = self.client.get('/api/pin/status/')
        self.assertTrue(response.data['has_pin'])


class BiometricAuthTestCase(TestCase):
    """Test cases for biometric authentication endpoints"""

    def setUp(self):
        """Set up test client and user"""
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='biometric@example.com',
            password='TestPass123!'
        )
        self.user.is_email_verified = True
        self.user.save()

        # Get authentication token
        response = self.client.post('/api/login/', {
            'email': 'biometric@example.com',
            'password': 'TestPass123!'
        })
        self.token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')

    def test_biometric_enroll_success(self):
        """Test successful biometric enrollment"""
        response = self.client.post('/api/biometric/enroll/', {
            'credential_id': 'test_credential_id_123',
            'public_key': 'test_public_key_abc'
        })
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['success'])
        
        # Verify biometric was enabled
        self.user.refresh_from_db()
        self.assertTrue(self.user.biometric_enabled)

    def test_biometric_disable_success(self):
        """Test successful biometric disable"""
        # Enable biometric first
        self.user.enable_biometric()
        
        response = self.client.post('/api/biometric/disable/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        
        # Verify biometric was disabled
        self.user.refresh_from_db()
        self.assertFalse(self.user.biometric_enabled)

    def test_biometric_status(self):
        """Test biometric status endpoint"""
        response = self.client.get('/api/biometric/status/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['enabled'])
        
        # Enable biometric and check again
        self.user.enable_biometric()
        
        response = self.client.get('/api/biometric/status/')
        self.assertTrue(response.data['enabled'])
        self.assertIsNotNone(response.data['registered_at'])


class UserModelPINTestCase(TestCase):
    """Test cases for User model PIN methods"""

    def setUp(self):
        """Set up test user"""
        self.user = User.objects.create_user(
            email='modeltest@example.com',
            password='TestPass123!'
        )

    def test_set_transaction_pin(self):
        """Test setting transaction PIN"""
        self.user.set_transaction_pin('5678')
        
        self.assertTrue(self.user.has_transaction_pin())
        self.assertIsNotNone(self.user.transaction_pin)
        self.assertIsNotNone(self.user.last_pin_change)
        self.assertEqual(self.user.pin_attempts, 0)

    def test_set_invalid_pin(self):
        """Test setting invalid PIN"""
        with self.assertRaises(ValueError):
            self.user.set_transaction_pin('123')  # Too short
        
        with self.assertRaises(ValueError):
            self.user.set_transaction_pin('12345')  # Too long
        
        with self.assertRaises(ValueError):
            self.user.set_transaction_pin('abcd')  # Not digits

    def test_check_transaction_pin(self):
        """Test checking transaction PIN"""
        self.user.set_transaction_pin('5678')
        
        # Correct PIN
        self.assertTrue(self.user.check_transaction_pin('5678'))
        
        # Wrong PIN
        self.assertFalse(self.user.check_transaction_pin('9999'))

    def test_pin_lockout(self):
        """Test PIN lockout after failed attempts"""
        self.user.set_transaction_pin('5678')
        
        # Make 5 failed attempts
        for i in range(5):
            self.user.check_transaction_pin('9999')
        
        # Verify PIN is locked
        self.assertTrue(self.user.is_pin_locked())
        
        # Verify we can't check PIN when locked
        with self.assertRaises(ValueError):
            self.user.check_transaction_pin('5678')

    def test_unlock_pin(self):
        """Test unlocking PIN"""
        self.user.set_transaction_pin('5678')
        
        # Lock the PIN by making failed attempts
        for i in range(5):
            self.user.check_transaction_pin('9999')
        
        self.assertTrue(self.user.is_pin_locked())
        
        # Unlock
        self.user.unlock_pin()
        
        self.assertFalse(self.user.is_pin_locked())
        self.assertEqual(self.user.pin_attempts, 0)
