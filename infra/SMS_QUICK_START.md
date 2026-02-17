# SMS Quick Start - 5 Minutes Setup

## 🚀 Fastest Path to Production SMS

### Step 1: Install Dependencies (30 seconds)
```bash
cd infra/lambda
npm install @aws-sdk/client-sns
cd ..
```

### Step 2: Choose Your Mode (1 minute)

#### Option A: Development (FREE - No SMS sent)
```bash
export DEV_SMS_MODE=inline
npm run deploy
```
✅ Codes returned in API response  
✅ Perfect for local testing  
✅ Zero cost  

#### Option B: Testing (FREE - Email instead of SMS)
```bash
export DEV_SMS_MODE=email
export SES_SENDER_EMAIL=noreply@yourdomain.com
npm run deploy
```
✅ Codes sent via email  
✅ Test full flow without SMS costs  
✅ Requires verified SES email  

#### Option C: Production (PAID - Real SMS)
```bash
# Remove DEV_SMS_MODE
unset DEV_SMS_MODE
npm run deploy
```
⚠️ Costs ~$0.00645 per SMS  
⚠️ Requires SNS production access  
⚠️ Set spending limits first  

### Step 3: Deploy (2 minutes)
```bash
npm run deploy
```

### Step 4: Test (1 minute)
```bash
# Test phone verification endpoint
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/prod/profile/phone/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newPhone": "+14155552671"}'
```

## 💰 Cost Summary

| Users | SMS/Month | Cost |
|-------|-----------|------|
| 100 | 500 | $3.23 |
| 1,000 | 2,000 | $12.90 |
| 10,000 | 10,000 | $64.50 |

## 🔒 Security (Already Implemented)

✅ Rate limiting (3 attempts max)  
✅ Code expiration (10 minutes)  
✅ E.164 phone validation  
✅ Brute force protection  

## ⚠️ Before Production

1. **Request SNS Production Access**
   - AWS Console → SNS → Text messaging → Request production access
   - Approval: 24-48 hours

2. **Set Spending Limit**
   ```bash
   aws sns set-sms-attributes --attributes MonthlySpendLimit=10.00
   ```

3. **Enable Cost Alerts**
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name sms-cost-alert \
     --metric-name EstimatedCharges \
     --namespace AWS/Billing \
     --threshold 10 \
     --comparison-operator GreaterThanThreshold
   ```

## 🎯 What Changed

### Files Modified
- ✅ `infra/stack.js` - Added SNS role and SMS MFA
- ✅ `infra/lambda/phone.js` - Added SNS SMS sending
- ✅ Lambda IAM permissions - Added SNS publish

### New Features
- ✅ Real SMS delivery via AWS SNS
- ✅ Cognito SMS MFA enabled
- ✅ Cost-optimized with dev modes
- ✅ Email fallback for testing
- ✅ Rate limiting and security

## 📊 Monitor Costs

```bash
# Check today's SMS usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

## 🆘 Troubleshooting

### SMS Not Received
1. Check SNS sandbox status (must be production)
2. Verify phone format: +14155552671 (E.164)
3. Check CloudWatch logs
4. Verify spending limit not reached

### High Costs
1. Check for abuse in CloudWatch
2. Verify DEV_SMS_MODE in dev environments
3. Review rate limiting logs
4. Consider email fallback

## 📚 Full Documentation

- **Complete Guide**: `SMS_SETUP_GUIDE.md`
- **Cost Optimization**: `COST_OPTIMIZATION.md`
- **Deployment Script**: `deploy-with-sms.sh`

## 🎉 You're Done!

Your app now has production-ready SMS with:
- ✅ Real SMS delivery
- ✅ Cost optimization
- ✅ Security features
- ✅ Easy testing modes

**Estimated cost**: $3-10/month for typical usage
