"""
Management command to test email configuration and SMTP connectivity.

Usage:
    python manage.py test_email_config
    python manage.py test_email_config --send-to your@email.com
"""
import sys
import smtplib
from django.core.management.base import BaseCommand
from django.conf import settings
from django.core.mail import send_mail, EmailMultiAlternatives
from django.utils.html import strip_tags


class Command(BaseCommand):
    help = 'Test email configuration and SMTP connectivity'

    def add_arguments(self, parser):
        parser.add_argument(
            '--send-to',
            type=str,
            help='Send a test email to this address',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 70))
        self.stdout.write(self.style.MIGRATE_HEADING('Email Configuration Test'))
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 70))
        self.stdout.write('')

        # Check configuration
        self.stdout.write(self.style.WARNING('1. Checking Email Configuration...'))
        self.stdout.write('')
        
        config_ok = True
        
        # Email Backend
        backend = settings.EMAIL_BACKEND
        self.stdout.write(f'   EMAIL_BACKEND: {backend}')
        
        if backend == 'django.core.mail.backends.console.EmailBackend':
            self.stdout.write(self.style.WARNING(
                '   ⚠ Using console backend - emails will print to console, not send via SMTP'
            ))
        
        # SMTP Settings
        if backend == 'django.core.mail.backends.smtp.EmailBackend':
            self.stdout.write(f'   EMAIL_HOST: {settings.EMAIL_HOST}')
            self.stdout.write(f'   EMAIL_PORT: {settings.EMAIL_PORT}')
            self.stdout.write(f'   EMAIL_USE_TLS: {settings.EMAIL_USE_TLS}')
            self.stdout.write(f'   EMAIL_HOST_USER: {settings.EMAIL_HOST_USER or "NOT SET"}')
            self.stdout.write(f'   EMAIL_HOST_PASSWORD: {"SET" if settings.EMAIL_HOST_PASSWORD else "NOT SET"}')
            self.stdout.write(f'   DEFAULT_FROM_EMAIL: {settings.DEFAULT_FROM_EMAIL}')
            self.stdout.write('')
            
            # Validate credentials
            if not settings.EMAIL_HOST_USER:
                self.stdout.write(self.style.ERROR('   ✗ EMAIL_HOST_USER is not set'))
                config_ok = False
            
            if not settings.EMAIL_HOST_PASSWORD:
                self.stdout.write(self.style.ERROR('   ✗ EMAIL_HOST_PASSWORD is not set'))
                config_ok = False
            
            # Check for Brevo-specific configuration
            if 'brevo' in settings.EMAIL_HOST.lower():
                if settings.EMAIL_HOST_USER and '@smtp-brevo.com' not in settings.EMAIL_HOST_USER:
                    self.stdout.write(self.style.ERROR(
                        f'   ✗ EMAIL_HOST_USER format incorrect for Brevo SMTP'
                    ))
                    self.stdout.write(self.style.ERROR(
                        f'     Current value: {settings.EMAIL_HOST_USER}'
                    ))
                    self.stdout.write(self.style.ERROR(
                        f'     Expected format: xxxxx@smtp-brevo.com (not a regular email address)'
                    ))
                    self.stdout.write(self.style.ERROR(
                        f'     Get your Brevo SMTP login from: https://app.brevo.com/settings/keys/smtp'
                    ))
                    config_ok = False
                else:
                    self.stdout.write(self.style.SUCCESS(
                        '   ✓ EMAIL_HOST_USER format looks correct for Brevo SMTP'
                    ))
        
        self.stdout.write('')
        
        if not config_ok:
            self.stdout.write(self.style.ERROR('Configuration check FAILED - please fix the errors above'))
            sys.exit(1)
        
        self.stdout.write(self.style.SUCCESS('   ✓ Configuration looks good'))
        self.stdout.write('')
        
        # Test SMTP connection
        if backend == 'django.core.mail.backends.smtp.EmailBackend':
            self.stdout.write(self.style.WARNING('2. Testing SMTP Connection...'))
            self.stdout.write('')
            
            try:
                # Create connection
                if settings.EMAIL_USE_TLS:
                    smtp = smtplib.SMTP(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=10)
                    smtp.ehlo()
                    smtp.starttls()
                    smtp.ehlo()
                else:
                    smtp = smtplib.SMTP_SSL(settings.EMAIL_HOST, settings.EMAIL_PORT, timeout=10)
                
                self.stdout.write(self.style.SUCCESS('   ✓ Connected to SMTP server'))
                
                # Test authentication
                try:
                    smtp.login(settings.EMAIL_HOST_USER, settings.EMAIL_HOST_PASSWORD)
                    self.stdout.write(self.style.SUCCESS('   ✓ SMTP authentication successful'))
                except smtplib.SMTPAuthenticationError as e:
                    self.stdout.write(self.style.ERROR(f'   ✗ SMTP authentication failed: {e}'))
                    self.stdout.write('')
                    self.stdout.write(self.style.ERROR('   Common causes:'))
                    self.stdout.write(self.style.ERROR('   - Wrong EMAIL_HOST_USER (check Brevo dashboard)'))
                    self.stdout.write(self.style.ERROR('   - Wrong EMAIL_HOST_PASSWORD (regenerate SMTP key if needed)'))
                    self.stdout.write(self.style.ERROR('   - Using Gmail address instead of Brevo SMTP username'))
                    smtp.quit()
                    sys.exit(1)
                
                smtp.quit()
                self.stdout.write(self.style.SUCCESS('   ✓ SMTP connection test passed'))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'   ✗ SMTP connection failed: {e}'))
                sys.exit(1)
            
            self.stdout.write('')
        
        # Send test email if requested
        send_to = options.get('send_to')
        if send_to:
            self.stdout.write(self.style.WARNING(f'3. Sending Test Email to {send_to}...'))
            self.stdout.write('')
            
            try:
                subject = 'MafitaPay Email Configuration Test'
                html_message = f'''
                <html>
                <body style="font-family: Arial, sans-serif;">
                    <h2>Email Configuration Test Successful! ✓</h2>
                    <p>This is a test email from MafitaPay to verify email configuration.</p>
                    <p><strong>Configuration Details:</strong></p>
                    <ul>
                        <li>Email Backend: {backend}</li>
                        <li>SMTP Host: {settings.EMAIL_HOST}</li>
                        <li>SMTP Port: {settings.EMAIL_PORT}</li>
                        <li>TLS Enabled: {settings.EMAIL_USE_TLS}</li>
                    </ul>
                    <p>If you received this email, your email configuration is working correctly!</p>
                </body>
                </html>
                '''
                plain_message = strip_tags(html_message)
                
                msg = EmailMultiAlternatives(
                    subject,
                    plain_message,
                    settings.DEFAULT_FROM_EMAIL,
                    [send_to]
                )
                msg.attach_alternative(html_message, "text/html")
                msg.send(fail_silently=False)
                
                self.stdout.write(self.style.SUCCESS(f'   ✓ Test email sent successfully to {send_to}'))
                self.stdout.write(self.style.SUCCESS('   Check your inbox (and spam folder)'))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'   ✗ Failed to send test email: {e}'))
                sys.exit(1)
            
            self.stdout.write('')
        
        # Summary
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 70))
        self.stdout.write(self.style.SUCCESS('Email configuration test completed successfully!'))
        self.stdout.write(self.style.MIGRATE_HEADING('=' * 70))
        self.stdout.write('')
        
        if not send_to:
            self.stdout.write('To send a test email, run:')
            self.stdout.write('  python manage.py test_email_config --send-to your@email.com')
            self.stdout.write('')
