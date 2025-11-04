# File: accounts/tasks.py
from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
import logging
import re

from mafitapay.celery import app

logger = logging.getLogger(__name__)

@app.task
def debug_task():
    print("Celery is alive and working!")
    return "pong"


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_verification_email(self, email, verification_url, first_name=None, last_name=None):
    """
    Sends a clean verification email with a direct link.
    Removes any potential SendGrid tracking issues by ensuring the link
    points directly to the backend verification endpoint.
    """
    try:
        logger.debug(f"Preparing verification email for {email}")

        # ✅ Ensure clean direct verification link (no double slashes, etc.)
        verification_url = re.sub(r'(?<!:)//+', '/', verification_url)
        if not verification_url.startswith("http"):
            verification_url = f"{settings.BASE_URL.rstrip('/')}/{verification_url.lstrip('/')}"

        # ✅ Prevent SendGrid from wrapping the link in tracking if needed
        # (only works if SendGrid click tracking is off for transactional emails)
        context = {
            'first_name': first_name or "there",
            'last_name': last_name or "",
            'verification_url': verification_url,
            'unsubscribe_url': f"{settings.BASE_URL}/unsubscribe/",
        }

        html_message = render_to_string('emails/verification_email.html', context)
        plain_message = strip_tags(html_message)

        subject = "Verify Your MafitaPay Account"
        from_email = settings.DEFAULT_FROM_EMAIL
        recipient_list = [email]

        # ✅ Use EmailMultiAlternatives for full HTML control
        msg = EmailMultiAlternatives(subject, plain_message, from_email, recipient_list)
        msg.attach_alternative(html_message, "text/html")

        # Optional header to disable link tracking in SendGrid (if supported)
        msg.extra_headers = {
            "X-SMTPAPI": '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'
        }

        msg.send(fail_silently=False)
        logger.info(f"Verification email sent to {email} (URL: {verification_url})")

    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {str(e)}")
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def send_reset_email(self, email, reset_url, first_name=None, last_name=None):
    """
    Sends a password reset email with a clean, direct reset link.
    """
    try:
        logger.debug(f"Preparing password reset email for {email}")

        reset_url = re.sub(r'(?<!:)//+', '/', reset_url)
        if not reset_url.startswith("http"):
            reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/{reset_url.lstrip('/')}"

        context = {
            'first_name': first_name or "there",
            'last_name': last_name or "",
            'reset_url': reset_url,
            'unsubscribe_url': f"{settings.BASE_URL}/unsubscribe/",
        }

        html_message = render_to_string('emails/password_reset_email.html', context)
        plain_message = strip_tags(html_message)

        subject = "Reset Your MafitaPay Password"
        from_email = settings.DEFAULT_FROM_EMAIL
        recipient_list = [email]

        msg = EmailMultiAlternatives(subject, plain_message, from_email, recipient_list)
        msg.attach_alternative(html_message, "text/html")
        msg.extra_headers = {
            "X-SMTPAPI": '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'
        }

        msg.send(fail_silently=False)
        logger.info(f"Password reset email sent to {email} (URL: {reset_url})")

    except Exception as e:
        logger.error(f"Failed to send password reset email to {email}: {str(e)}")
        raise self.retry(exc=e)
