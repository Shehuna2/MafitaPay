# backend/accounts/test_email_failure_handling.py
"""
Tests for graceful email failure handling during registration
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from smtplib import SMTPServerDisconnected

User = get_user_model()


class EmailFailureHandlingTestCase(TestCase):
    """Test cases for registration when email sending fails"""

    def setUp(self):
        """Set up test client"""
        self.client = APIClient()

    @patch('accounts.tasks.EmailMultiAlternatives.send')
    def test_registration_succeeds_when_email_fails(self, mock_send):
        """Test that registration succeeds even when email sending fails"""
        # Simulate email sending failure
        mock_send.side_effect = SMTPServerDisconnected("Connection unexpectedly closed")
        
        response = self.client.post('/api/register/', {
            'email': 'newuser@example.com',
            'password': 'TestPass123!',
            'password2': 'TestPass123!',
            'first_name': 'Test',
            'last_name': 'User'
        })
        
        # Registration should still succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('message', response.data)
        self.assertIn('Registration successful', response.data['message'])
        
        # User should be created
        self.assertTrue(User.objects.filter(email='newuser@example.com').exists())
        
        # User should NOT be verified (since email wasn't sent)
        user = User.objects.get(email='newuser@example.com')
        self.assertFalse(user.is_email_verified)
        self.assertIsNotNone(user.verification_token)

    @patch('accounts.tasks.EmailMultiAlternatives.send')
    def test_registration_succeeds_when_email_works(self, mock_send):
        """Test that registration still works normally when email succeeds"""
        # Email sending succeeds
        mock_send.return_value = 1
        
        response = self.client.post('/api/register/', {
            'email': 'gooduser@example.com',
            'password': 'TestPass123!',
            'password2': 'TestPass123!',
            'first_name': 'Good',
            'last_name': 'User'
        })
        
        # Registration should succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # User should be created
        self.assertTrue(User.objects.filter(email='gooduser@example.com').exists())
        
        # Email send should have been called
        self.assertTrue(mock_send.called)

    @patch('accounts.tasks.EmailMultiAlternatives.send')
    def test_send_verification_email_sync_returns_false_on_failure(self, mock_send):
        """Test that send_verification_email_sync returns False when email fails"""
        from accounts.tasks import send_verification_email_sync
        
        # Simulate email sending failure
        mock_send.side_effect = Exception("SMTP error")
        
        # Should return False instead of raising
        result = send_verification_email_sync(
            'test@example.com',
            'http://example.com/verify/token123',
            first_name='Test',
            last_name='User'
        )
        
        self.assertFalse(result)

    @patch('accounts.tasks.EmailMultiAlternatives.send')
    def test_send_verification_email_sync_returns_true_on_success(self, mock_send):
        """Test that send_verification_email_sync returns True when email succeeds"""
        from accounts.tasks import send_verification_email_sync
        
        # Email sending succeeds
        mock_send.return_value = 1
        
        # Should return True
        result = send_verification_email_sync(
            'test@example.com',
            'http://example.com/verify/token123',
            first_name='Test',
            last_name='User'
        )
        
        self.assertTrue(result)

    @patch('accounts.serializers.send_verification_email_sync')
    def test_serializer_handles_email_failure(self, mock_send_email):
        """Test that RegisterSerializer handles email failures gracefully"""
        # Simulate email sending failure
        mock_send_email.side_effect = Exception("Email service down")
        
        response = self.client.post('/api/register/', {
            'email': 'serialtest@example.com',
            'password': 'TestPass123!',
            'password2': 'TestPass123!',
            'first_name': 'Serial',
            'last_name': 'Test'
        })
        
        # Registration should still succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # User should exist
        self.assertTrue(User.objects.filter(email='serialtest@example.com').exists())

    @patch('accounts.views.send_verification_email_sync')
    def test_view_handles_email_failure(self, mock_send_email):
        """Test that RegisterView handles email failures gracefully"""
        # Simulate email sending failure in view
        mock_send_email.side_effect = SMTPServerDisconnected("Connection closed")
        
        response = self.client.post('/api/register/', {
            'email': 'viewtest@example.com',
            'password': 'TestPass123!',
            'password2': 'TestPass123!',
            'first_name': 'View',
            'last_name': 'Test'
        })
        
        # Registration should still succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # User should exist
        self.assertTrue(User.objects.filter(email='viewtest@example.com').exists())

    @patch('accounts.views.send_verification_email_sync')
    def test_resend_verification_handles_email_failure(self, mock_send_email):
        """Test that ResendVerificationEmailView handles email failures gracefully"""
        # Create an unverified user
        user = User.objects.create_user(
            email='resendtest@example.com',
            password='TestPass123!'
        )
        user.is_email_verified = False
        user.save()
        
        # Simulate email sending failure
        mock_send_email.side_effect = Exception("Email service down")
        
        response = self.client.post('/api/resend-verification/', {
            'email': 'resendtest@example.com'
        })
        
        # Should return 500 with error message
        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn('error', response.data)
        self.assertIn('Failed to send verification email', response.data['error'])

    @patch('accounts.tasks.EmailMultiAlternatives.send')
    def test_verification_email_sent_only_once_during_registration(self, mock_send):
        """Test that verification email is sent only once during registration (not duplicated)"""
        # Email sending succeeds
        mock_send.return_value = 1
        
        response = self.client.post('/api/register/', {
            'email': 'oncetest@example.com',
            'password': 'TestPass123!',
            'password2': 'TestPass123!',
            'first_name': 'Once',
            'last_name': 'Test'
        })
        
        # Registration should succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # User should exist
        self.assertTrue(User.objects.filter(email='oncetest@example.com').exists())
        
        # Email should be sent ONLY ONCE (not twice)
        # This verifies the fix for duplicate email sending
        # Before the fix, this would be called twice (once in serializer, once in view)
        self.assertEqual(mock_send.call_count, 1, 
                        "Verification email should be sent exactly once during registration")
