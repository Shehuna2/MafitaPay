# File: accounts/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import logging

logger = logging.getLogger(__name__)

# In accounts/tasks.py
@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_verification_email(self, email, verification_url, first_name=None, last_name=None):
    try:
        logger.debug(f"Sending verification email to {email}")
        html_message = render_to_string(
            'emails/verification_email.html',
            {
                'first_name': first_name or "there",
                'last_name': last_name or "there",
                'verification_url': verification_url,
                'unsubscribe_url': f"{settings.BASE_URL}/unsubscribe/",
            }
        )
        plain_message = strip_tags(html_message).replace('{{ first_name }}', first_name or "there").replace('{{ last_name }}', last_name or "there")
        response = send_mail(
            subject="Verify Your MafitaPay Account",
            message=plain_message,
            html_message=html_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        logger.info(f"Verification email sent to {email}, SMTP response: {response}")
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {str(e)}")
        raise self.retry(exc=e)

        

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_reset_email(self, email, reset_url, first_name=None, last_name=None):
    try:
        logger.debug(f"Sending password reset email to {email}")
        html_message = render_to_string(
            'emails/password_reset_email.html',
            {
                'first_name': first_name or "there",
                'last_name': last_name or "there",
                'reset_url': reset_url,
                'unsubscribe_url': f"{settings.BASE_URL}/unsubscribe/",
            }
        )
        plain_message = strip_tags(html_message).replace('{{ first_name }}', first_name or "there").replace('{{ last_name }}', last_name or "there")
        response = send_mail(
            subject="Reset Your MafitaPay Password",
            message=plain_message,
            html_message=html_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
        logger.info(f"Password reset email sent to {email}, SMTP response: {response}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {str(e)}")
        raise self.retry(exc=e)