# backend/accounts/test_email_verification_login.py
"""
Tests for email verification during login
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class EmailVerificationLoginTestCase(TestCase):
    """Test cases for login with unverified email"""

    def setUp(self):
        """Set up test client and user"""
        self.client = APIClient()
        # Create user with unverified email
        self.user = User.objects.create_user(
            email='unverified@example.com',
            password='TestPass123!'
        )
        # Ensure email is not verified
        self.user.is_email_verified = False
        self.user.save()

    def test_login_with_unverified_email_returns_email_in_error(self):
        """Test that login with unverified email returns email in error response"""
        response = self.client.post('/api/login/', {
            'email': 'unverified@example.com',
            'password': 'TestPass123!'
        })
        
        # Should return 400 Bad Request
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Should contain 'action' field
        self.assertIn('action', response.data)
        self.assertEqual(response.data['action'], 'resend_verification')
        
        # Should contain 'email' field for frontend redirect
        self.assertIn('email', response.data)
        self.assertEqual(response.data['email'], 'unverified@example.com')
        
        # Should contain detailed error message
        self.assertIn('detail', response.data)
        self.assertIn('not been verified', response.data['detail'])

    def test_login_with_verified_email_succeeds(self):
        """Test that login with verified email succeeds"""
        # Verify the email
        self.user.is_email_verified = True
        self.user.save()
        
        response = self.client.post('/api/login/', {
            'email': 'unverified@example.com',
            'password': 'TestPass123!'
        })
        
        # Should return 200 OK with tokens
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)

    def test_login_with_wrong_password(self):
        """Test that login with wrong password fails appropriately"""
        response = self.client.post('/api/login/', {
            'email': 'unverified@example.com',
            'password': 'WrongPassword123!'
        })
        
        # Should return 400 Bad Request
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Should NOT contain action field (different error)
        self.assertNotIn('action', response.data)
