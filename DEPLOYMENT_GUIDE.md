# Flutterwave Webhook Fix - Deployment Guide

## Summary of Changes

This fix addresses the Flutterwave webhook verification issue that was preventing wallet credits from being processed. The changes include:

1. **Enhanced webhook signature verification** with fallback header detection
2. **Comprehensive logging** for debugging and auditing
3. **Critical error alerts** for fund loss scenarios
4. **Testing utilities** for production troubleshooting

## Pre-Deployment Checklist

### 1. Verify Environment Variables

Ensure the following environment variables are properly configured:

**Test/Sandbox Environment:**
```bash
FLW_TEST_CLIENT_ID=<your_test_client_id>
FLW_TEST_CLIENT_SECRET=<your_test_client_secret>
FLW_TEST_ENCRYPTION_KEY=<your_test_encryption_key>
FLW_TEST_HASH_SECRET=<your_test_hash_secret>
FLW_TEST_BASE_URL=https://developersandbox-api.flutterwave.com
```

**Production Environment:**
```bash
FLW_LIVE_CLIENT_ID=<your_live_client_id>
FLW_LIVE_CLIENT_SECRET=<your_live_client_secret>
FLW_LIVE_ENCRYPTION_KEY=<your_live_encryption_key>
FLW_LIVE_HASH_SECRET=<your_live_hash_secret>
FLW_LIVE_BASE_URL=https://f4bexperience.flutterwave.com
```

**Critical:** The `FLW_*_HASH_SECRET` is essential for webhook verification. Without it, all webhooks will fail.

### 2. Get Your Hash Secret from Flutterwave

1. Log in to your Flutterwave dashboard
2. Navigate to Settings → Webhooks
3. Copy your webhook hash secret
4. Set it in your environment variables

### 3. Configure Webhook URL in Flutterwave

Ensure your webhook URL is properly configured in Flutterwave:
- URL: `https://yourdomain.com/api/wallet/flutterwave-webhook/`
- Events to subscribe:
  - `charge.completed`
  - `transfer.completed`
  - `transfer.successful`
  - `virtualaccount.payment.completed`

## Deployment Steps

### Step 1: Deploy to Staging

```bash
# Deploy the changes to staging
git checkout copilot/fix-flutterwave-webhook-issue
# Deploy to staging environment
```

### Step 2: Test in Staging

Use the provided test script to verify signature computation:

```bash
cd backend/wallet
python3 test_webhook_signature.py "$FLW_TEST_HASH_SECRET"
```

Expected output: Shows the computed signature for a test payload.

### Step 3: Trigger a Test Webhook

1. In Flutterwave sandbox, make a test transfer to a virtual account
2. Monitor the logs for:
   ```
   INFO ... Flutterwave webhook received: headers={...}
   INFO ... ✓ Flutterwave deposit SUCCESS: ₦X credited to user@example.com
   ```

### Step 4: Verify Logging

Check that the new logging is working:

```bash
# Should see webhook requests being logged
grep "Flutterwave webhook received" logs/app.log

# Should NOT see these errors anymore
grep "Missing Flutterwave verif-hash header" logs/app.log
```

### Step 5: Deploy to Production

Once validated in staging:

```bash
# Merge and deploy to production
git checkout main
git merge copilot/fix-flutterwave-webhook-issue
# Deploy to production environment
```

## Post-Deployment Monitoring

### Critical Logs to Monitor

1. **Success indicators:**
   ```
   INFO ... ✓ Flutterwave deposit SUCCESS: ₦X credited to user@example.com
   ```

2. **Warning indicators (investigate but not critical):**
   ```
   WARNING ... Missing Flutterwave verif-hash header
   WARNING ... Ignoring Flutterwave webhook with status: pending
   ```

3. **Error indicators (require immediate attention):**
   ```
   ERROR ... Invalid Flutterwave webhook signature
   ERROR ... Flutterwave hash secret not configured
   ```

4. **Critical indicators (URGENT - potential fund loss):**
   ```
   CRITICAL: No account number found in FLW webhook
   CRITICAL: No VA found for account_number=...
   CRITICAL: Wallet deposit failed!
   CRITICAL: Failed to credit recovered deposit!
   ```

### Monitoring Commands

```bash
# Watch for all Flutterwave webhook activity
tail -f logs/app.log | grep "Flutterwave webhook"

# Watch for critical errors
tail -f logs/app.log | grep "CRITICAL:"

# Count successful deposits today
grep "Flutterwave deposit SUCCESS" logs/app.log | grep "$(date +%Y-%m-%d)" | wc -l

# Check for signature verification failures
grep "Invalid Flutterwave webhook signature" logs/app.log | tail -20
```

## Troubleshooting

### Issue: "Missing Flutterwave verif-hash header"

**Possible causes:**
1. Webhook URL not properly configured in Flutterwave dashboard
2. Proxy/load balancer stripping headers
3. Flutterwave sending webhooks without the header (rare)

**Solution:**
1. Check logs for "Available headers:" to see what headers are actually received
2. Verify webhook URL in Flutterwave dashboard
3. Check proxy/load balancer configuration

### Issue: "Invalid Flutterwave webhook signature"

**Possible causes:**
1. Wrong hash secret configured
2. Using test hash secret for live webhooks (or vice versa)
3. Payload modified in transit

**Solution:**
1. Verify correct hash secret is set for the environment
2. Use the test script to verify signature computation:
   ```bash
   python3 test_webhook_signature.py "$FLW_LIVE_HASH_SECRET" '<webhook_payload>' '<signature>'
   ```
3. Check that DEBUG setting matches environment (DEBUG=False for production)

### Issue: "Flutterwave hash secret not configured"

**Possible causes:**
1. Environment variable not set
2. Wrong variable name used
3. Variable not loaded properly

**Solution:**
1. Check environment variables: `echo $FLW_LIVE_HASH_SECRET`
2. Restart the application after setting variables
3. Check settings.py is loading the correct variable

### Issue: Webhook received but wallet not credited

**Check logs for:**
1. "No account number found" → Virtual account mapping issue
2. "No VA found for account_number" → Database inconsistency
3. "Wallet deposit failed" → Wallet operation error
4. "Duplicate deposit detected" → Already processed (check previous logs)

## Rollback Plan

If issues occur after deployment:

```bash
# Revert to previous version
git revert HEAD
# Or checkout previous commit
git checkout <previous_commit>
# Redeploy
```

The old webhook handler will continue to work but without the enhanced logging and header detection improvements.

## Testing Production Webhooks

To test in production without real funds:

1. Use Flutterwave's webhook replay feature in the dashboard
2. Or use the test script to compute signatures for test payloads:
   ```bash
   python3 test_webhook_signature.py "$FLW_LIVE_HASH_SECRET" '{"event":"test","data":{"amount":1}}'
   ```
3. Send the test webhook using curl:
   ```bash
   curl -X POST https://yourdomain.com/api/wallet/flutterwave-webhook/ \
     -H "Content-Type: application/json" \
     -H "verif-hash: <computed_signature>" \
     -d '{"event":"test","data":{"amount":1}}'
   ```

## Success Criteria

The fix is successful when:

1. ✅ No "Missing Flutterwave verif-hash header" warnings in logs
2. ✅ Webhook requests are logged with full details
3. ✅ Successful transfers result in wallet credits
4. ✅ No critical errors related to fund processing
5. ✅ Signature verification passes for all valid webhooks

## Support

For issues or questions:
1. Check the logs first using the monitoring commands above
2. Use the test script to verify signature computation
3. Review FLUTTERWAVE_WEBHOOK_FIX.md for detailed technical information
4. Check Flutterwave dashboard for webhook delivery status

## Security Notes

1. **Never log full signatures in production** - Only log first few characters for debugging
2. **Protect hash secrets** - Never commit to version control
3. **Monitor for suspicious activity** - Watch for signature verification failures
4. **Rotate secrets periodically** - Update hash secrets in both Flutterwave and your environment
