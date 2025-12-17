# Flutterwave Webhook Fix - Quick Reference

## 🎯 What Was Fixed

Fixed the "Missing Flutterwave verif-hash header" issue that prevented wallet credits from being processed.

## 📋 Quick Checklist

### Before Deployment
- [ ] Set `FLW_TEST_HASH_SECRET` in environment
- [ ] Set `FLW_LIVE_HASH_SECRET` in environment
- [ ] Configure webhook URL in Flutterwave dashboard
- [ ] Test signature computation with utility script

### After Deployment
- [ ] Monitor logs for "Flutterwave webhook received"
- [ ] Verify no "Missing Flutterwave verif-hash header" errors
- [ ] Check for "✓ Flutterwave deposit SUCCESS" messages
- [ ] Set up alerts for "CRITICAL:" logs

## 🔧 Quick Commands

### Test Signature Computation
```bash
cd backend/wallet
python3 test_webhook_signature.py "$FLW_TEST_HASH_SECRET"
```

### Monitor Webhooks
```bash
# Watch all webhook activity
tail -f logs/app.log | grep "Flutterwave webhook"

# Watch successful deposits
tail -f logs/app.log | grep "deposit SUCCESS"

# Watch for critical errors
tail -f logs/app.log | grep "CRITICAL:"
```

### Count Today's Deposits
```bash
grep "Flutterwave deposit SUCCESS" logs/app.log | grep "$(date +%Y-%m-%d)" | wc -l
```

## 🚨 Alert Conditions

Set up alerts for these patterns:

| Pattern | Severity | Action |
|---------|----------|--------|
| `CRITICAL: No account number found` | 🔴 URGENT | Check logs, contact Flutterwave |
| `CRITICAL: Wallet deposit failed` | 🔴 URGENT | Manual intervention needed |
| `Invalid Flutterwave webhook signature` | 🟡 HIGH | Check hash secret configuration |
| `hash secret not configured` | 🟡 HIGH | Set environment variable |

## 📚 Documentation

- **SOLUTION_SUMMARY.md** - Complete overview of the fix
- **DEPLOYMENT_GUIDE.md** - Detailed deployment instructions
- **FLUTTERWAVE_WEBHOOK_FIX.md** - Technical documentation

## 🧪 Testing

### Test Script
```bash
python3 backend/wallet/test_webhook_signature.py
```

### Sample Test
```python
import hmac, hashlib, base64, json

secret = "your_hash_secret"
payload = '{"event":"test","data":{"amount":1000}}'
sig = base64.b64encode(
    hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
).decode()
print(f"Signature: {sig}")
```

## 🔒 Security Notes

- ✅ Never commit hash secrets to git
- ✅ Use different secrets for TEST and LIVE
- ✅ Rotate secrets periodically
- ✅ Monitor signature verification failures

## 📊 Success Metrics

The fix is working when:
- ✅ No "Missing Flutterwave verif-hash header" warnings
- ✅ All transfers result in wallet credits
- ✅ Complete audit trail in logs
- ✅ Zero CRITICAL errors

## 🆘 Troubleshooting

### Issue: Signature Verification Failing

1. Check hash secret: `echo $FLW_LIVE_HASH_SECRET`
2. Verify environment: Check DEBUG setting
3. Test with script: `python3 test_webhook_signature.py "$FLW_LIVE_HASH_SECRET" '<payload>' '<signature>'`

### Issue: Webhooks Not Received

1. Check Flutterwave dashboard webhook config
2. Verify webhook URL is accessible
3. Check proxy/firewall settings
4. Review Flutterwave webhook delivery logs

### Issue: Headers Missing

1. Check logs for "Available headers:"
2. Verify proxy isn't stripping headers
3. Check load balancer configuration

## 📞 Support

For issues:
1. Check logs first
2. Use test script to verify signatures
3. Review documentation
4. Check Flutterwave dashboard

## 🚀 Quick Deploy

```bash
# Pull latest changes
git pull origin copilot/fix-flutterwave-webhook-issue

# Set environment variables
export FLW_TEST_HASH_SECRET="your_test_secret"
export FLW_LIVE_HASH_SECRET="your_live_secret"

# Restart application
systemctl restart mafitapay

# Monitor logs
tail -f logs/app.log | grep "Flutterwave"
```

## ✅ Verification

After deployment, verify:
```bash
# Should see webhook processing
grep "Flutterwave webhook received" logs/app.log | tail -5

# Should see successful deposits
grep "deposit SUCCESS" logs/app.log | tail -5

# Should NOT see these
grep "Missing Flutterwave verif-hash header" logs/app.log
grep "CRITICAL:" logs/app.log
```

## 🎉 Success!

When you see this in logs, everything is working:
```
INFO ✓ Flutterwave deposit SUCCESS: ₦5000 credited to user@example.com
```
