# accounts/tasks.py
import logging
import re
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)

def send_verification_email_sync(email, verification_url, first_name=None, last_name=None):
    try:
        verification_url = re.sub(r'(?<!:)//+', '/', verification_url)
        if not verification_url.startswith("http"):
            verification_url = f"{settings.BASE_URL.rstrip('/')}/{verification_url.lstrip('/')}"

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

        msg = EmailMultiAlternatives(subject, plain_message, from_email, recipient_list)
        msg.attach_alternative(html_message, "text/html")
        msg.extra_headers = {
            "X-SMTPAPI": '{"filters": {"clicktrack": {"settings": {"enable": 0}}}}'
        }
        msg.send(fail_silently=False)
        logger.info("Verification email sent to %s", email)
        return True  # Indicate success
    except Exception as e:
        logger.exception("Failed to send verification email to %s: %s", email, e)
        return False  # Indicate failure, but don't crash

def send_reset_email_sync(email, reset_url, first_name=None, last_name=None):
    try:
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
        logger.info("Password reset email sent to %s", email)
    except Exception as e:
        logger.exception("Failed to send reset email to %s: %s", email, e)
        raise





