# Email Configuration Fix - Brevo SMTP Authentication

## Overview

This document explains the email configuration changes made to fix the SMTP authentication error (535) that was occurring in production.

## Problem

The production environment was experiencing email verification failures with the error:
```
smtplib.SMTPAuthenticationError: (535, b'5.7.8 Authentication failed')
```

### Root Cause

The environment variables had **incorrect Brevo SMTP credentials**:
- **Wrong:** `EMAIL_HOST_USER=shehuusman1414@gmail.com` (Gmail address)
- **Correct:** `EMAIL_HOST_USER=9f311a001@smtp-brevo.com` (Brevo SMTP username)

Brevo SMTP requires a specific username format that is **NOT** a regular email address. This is a common mistake.

## Solution Implemented

### 1. Email Configuration Validation (settings.py)

Added automatic validation that runs at Django startup in production mode:

- **Checks required credentials:** Ensures `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` are set
- **Validates Brevo format:** Warns if using Brevo SMTP with incorrect username format
- **Logs configuration:** Shows email settings at startup (without sensitive data)
- **Provides helpful errors:** Clear messages about what's wrong and how to fix it

### 2. Environment Variable Documentation (.env.example)

Created a comprehensive `.env.example` file with:

- **Correct Brevo SMTP format:** Shows the right format for `EMAIL_HOST_USER`
- **Common mistakes highlighted:** Warns against using Gmail or other email addresses
- **Link to credentials:** Direct link to Brevo dashboard where to get SMTP credentials
- **All environment variables:** Complete list of all required environment variables

### 3. Email Configuration Test Command

Added a management command to test and diagnose email configuration:

```bash
python manage.py test_email_config
```

This command:
- ✅ Validates email configuration
- ✅ Tests SMTP connection
- ✅ Verifies SMTP authentication
- ✅ Detects common misconfigurations
- ✅ Can send test emails

## How to Use

### Getting Brevo SMTP Credentials

1. Log in to [Brevo Dashboard](https://app.brevo.com)
2. Navigate to **Settings → SMTP & API**
3. Get your SMTP credentials:
   - **SMTP Server:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Login:** Something like `9f311a001@smtp-brevo.com` (**NOT your email**)
   - **Password:** Your SMTP key

### Setting Up Environment Variables

Update your production environment variables:

```bash
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-brevo-username@smtp-brevo.com  # From Brevo dashboard
EMAIL_HOST_PASSWORD=your-brevo-smtp-key              # From Brevo dashboard
DEFAULT_FROM_EMAIL=MafitaPay <no-reply@mafitapay.com>
```

### Testing Email Configuration

#### 1. Test Configuration Without Sending

```bash
python manage.py test_email_config
```

This will:
- Check if credentials are set
- Validate Brevo SMTP format
- Test SMTP connection
- Verify authentication

#### 2. Send a Test Email

```bash
python manage.py test_email_config --send-to your@email.com
```

This will send an actual test email to verify everything works end-to-end.

### Expected Output

#### Successful Configuration

```
======================================================================
Email Configuration Test
======================================================================

1. Checking Email Configuration...

   EMAIL_HOST: smtp-relay.brevo.com
   EMAIL_PORT: 587
   EMAIL_USE_TLS: True
   EMAIL_HOST_USER: 9f311a001@smtp-brevo.com
   EMAIL_HOST_PASSWORD: SET
   DEFAULT_FROM_EMAIL: MafitaPay <no-reply@mafitapay.com>

   ✓ EMAIL_HOST_USER format looks correct for Brevo SMTP
   ✓ Configuration looks good

2. Testing SMTP Connection...

   ✓ Connected to SMTP server
   ✓ SMTP authentication successful
   ✓ SMTP connection test passed

======================================================================
Email configuration test completed successfully!
======================================================================
```

#### Failed Configuration (Wrong Format)

```
1. Checking Email Configuration...

   EMAIL_HOST_USER: shehuusman1414@gmail.com
   
   ✗ EMAIL_HOST_USER format incorrect for Brevo SMTP
     Current value: shehuusman1414@gmail.com
     Expected format: xxxxx@smtp-brevo.com (not a regular email address)
     Get your Brevo SMTP login from: https://app.brevo.com/settings/keys/smtp

Configuration check FAILED - please fix the errors above
```

## Deployment Checklist

### For Render.com (or other platforms)

1. **Update environment variables** in your deployment platform:
   - Set `EMAIL_HOST_USER` to your Brevo SMTP username (format: `xxxxx@smtp-brevo.com`)
   - Keep `EMAIL_HOST_PASSWORD` as your existing SMTP key
   - Set `EMAIL_HOST=smtp-relay.brevo.com`

2. **Deploy the code** with the new validation

3. **Check deployment logs** for email configuration messages:
   ```
   INFO ... Email Configuration: HOST=smtp-relay.brevo.com, PORT=587, ...
   INFO ... ✓ Email configuration validated successfully
   ```

4. **Test email sending** by triggering a registration or password reset

## Common Issues and Solutions

### Issue: "EMAIL_HOST_USER format incorrect for Brevo SMTP"

**Solution:** You're using a regular email address (like Gmail) instead of Brevo SMTP username.
- Get the correct username from Brevo dashboard
- Format should be: `xxxxxx@smtp-brevo.com`

### Issue: "SMTP authentication failed (535)"

**Solutions:**
1. **Check EMAIL_HOST_USER:** Must be from Brevo dashboard, not your email
2. **Regenerate SMTP key:** In Brevo dashboard if password is old
3. **Check EMAIL_HOST:** Should be `smtp-relay.brevo.com`
4. **Verify port:** Should be `587` with TLS enabled

### Issue: "EMAIL_HOST_USER is not set"

**Solution:** Add the environment variable to your deployment platform

## Files Changed

- `backend/mafitapay/settings.py` - Added email configuration validation
- `.env.example` - Added comprehensive environment variable documentation
- `backend/accounts/management/commands/test_email_config.py` - New command to test email
- `backend/accounts/test_email_config_validation.py` - Tests for validation

## Security Notes

- ✅ Validation runs only in production (when DEBUG=False)
- ✅ Passwords are never logged (only shows "SET" or "NOT SET")
- ✅ Warnings don't break startup (in case of edge cases)
- ✅ Clear error messages help prevent misconfigurations

## Testing

Run the test suite:

```bash
python manage.py test accounts.test_email_config_validation
```

All 10 tests should pass.

## Additional Resources

- [Brevo SMTP Documentation](https://help.brevo.com/hc/en-us/articles/209462765-How-to-set-up-SMTP)
- [Brevo Dashboard - SMTP Settings](https://app.brevo.com/settings/keys/smtp)
- [Django Email Documentation](https://docs.djangoproject.com/en/5.0/topics/email/)
