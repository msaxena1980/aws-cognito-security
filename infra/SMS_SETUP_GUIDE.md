# SMS Setup Guide - Production Ready with Cost Optimization

## 🎯 Overview

This guide helps you set up SMS delivery for your Cognito users with minimal cost while maintaining production-ready quality.

## 💰 Cost Analysis

### AWS SNS SMS Pricing (No Free Tier)
- **US/Canada**: $0.00645 per SMS
- **Europe**: $0.02 - $0.08 per SMS  
- **Asia**: $0.05 - $0.15 per SMS
- **Monthly estimate (1,000 SMS)**: ~$6.45 (US only)

### Cost Optimization Strategies

#### 1. **Development Mode** (FREE)
```bash
# Set in your environment
DEV_SMS_MODE=inline  # Returns codes in API response (dev only)
DEV_SMS_MODE=email   # Sends codes via email (testing)
```

#### 2. **Production Mode** (Minimal Cost)
- Use SMS only for critical flows (MFA, password reset)
- Use email for non-critical notifications
- Implement rate limiting to prevent abuse
- Monitor usage with CloudWatch

## 🚀 Deployment Steps

### Step 1: Update Lambda Dependencies

```bash
cd infra/lambda
npm install @aws-sdk/client-sns
```

### Step 2: Deploy Infrastructure

```bash
cd infra

# Set environment variables
export DEV_SMS_MODE=inline  # For development
export SES_SENDER_EMAIL=noreply@yourdomain.com

# Deploy
npm run deploy
```

### Step 3: Move Out of SNS Sandbox (REQUIRED for Production)

AWS SNS starts in **sandbox mode** - you can only send SMS to verified phone numbers.

**To exit sandbox:**

1. Open AWS Console → SNS → Text messaging (SMS)
2. Click "Request production access"
3. Fill out the form:
   - **Use case**: Transactional (one-time passwords)
   - **Monthly SMS volume**: Your estimate
   - **Company website**: Your domain
   - **Opt-out mechanism**: "Reply STOP to unsubscribe"
   - **Sample message**: "Your CryptoJogi verification code is: 123456"

**Approval time**: Usually 24-48 hours

### Step 4: Configure SNS Spending Limits (IMPORTANT)

Protect yourself from unexpected costs:

```bash
# Set monthly SMS spending limit via AWS CLI
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=10.00  # $10/month limit
```

Or in AWS Console:
1. SNS → Text messaging (SMS) → Preferences
2. Set "Account spending limit" to $10.00

### Step 5: Enable CloudWatch Alarms

```bash
# Create alarm for SMS spending
aws cloudwatch put-metric-alarm \
  --alarm-name sms-cost-alert \
  --alarm-description "Alert when SMS costs exceed $5" \
  --metric-name SMSSuccessRate \
  --namespace AWS/SNS \
  --statistic Sum \
  --period 86400 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

## 🔧 Configuration Modes

### Mode 1: Development (FREE)
```bash
# .env or CDK context
DEV_SMS_MODE=inline
```
- SMS codes returned in API response
- No actual SMS sent
- Perfect for local development

### Mode 2: Testing with Email (FREE)
```bash
DEV_SMS_MODE=email
SES_SENDER_EMAIL=noreply@yourdomain.com
```
- SMS codes sent via email instead
- Test full flow without SMS costs
- Requires verified SES email

### Mode 3: Production (PAID)
```bash
# Remove DEV_SMS_MODE or set to empty
DEV_SMS_MODE=
```
- Real SMS via SNS
- Requires SNS production access
- Monitor costs closely

## 📊 Cost Optimization Best Practices

### 1. Rate Limiting (Implemented)
```javascript
// Already added in phone.js
- Max 3 verification attempts per request
- 10-minute code expiration
- Automatic cleanup of expired codes
```

### 2. Smart Fallbacks
```javascript
// Priority order:
1. SMS (for phone verification)
2. Email (if SMS fails or in dev mode)
3. Inline (development only)
```

### 3. Monitoring
```bash
# Check SMS usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --dimensions Name=SMSType,Value=Transactional \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T23:59:59Z \
  --period 86400 \
  --statistics Sum
```

## 🔐 Security Features (Implemented)

✅ **Rate Limiting**: Max 3 attempts per verification
✅ **Code Expiration**: 10 minutes TTL
✅ **Brute Force Protection**: Auto-delete after failed attempts
✅ **E.164 Validation**: Ensures valid phone format
✅ **Transactional SMS**: Higher priority delivery

## 🌍 International SMS Considerations

### Sender ID Support (by Country)
- ✅ **Supported**: UK, France, Spain, Italy, India
- ❌ **Not Supported**: US, Canada (shows random number)
- 💰 **Extra Cost**: Some countries charge more for Sender ID

### Cost by Region
```
US/Canada:    $0.00645/SMS
UK:           $0.0395/SMS
India:        $0.00365/SMS
China:        Not supported via SNS
```

## 🎛️ Environment Variables Reference

```bash
# Required
USER_POOL_ID=us-east-1_xxxxx
TABLE_NAME=UserSecurity

# SMS Configuration
DEV_SMS_MODE=inline|email|<empty>  # Default: empty (production)

# Email Fallback
SES_SENDER_EMAIL=noreply@yourdomain.com
```

## 📈 Scaling Considerations

### Low Volume (<1,000 SMS/month)
- **Cost**: ~$6.45/month
- **Setup**: AWS SNS (current implementation)
- **Recommendation**: ✅ Use this setup

### Medium Volume (1,000-10,000 SMS/month)
- **Cost**: ~$64.50/month
- **Setup**: AWS SNS with spending limits
- **Recommendation**: ✅ Monitor closely, consider Twilio

### High Volume (>10,000 SMS/month)
- **Cost**: $645+/month
- **Setup**: Consider Twilio/Vonage
- **Recommendation**: ⚠️ Evaluate third-party providers

## 🔄 Migration to Third-Party Provider (Optional)

If costs become too high, you can easily switch to Twilio:

```javascript
// In phone.js, replace sendSms function:
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSms(phoneNumber, message) {
  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phoneNumber
  });
  return { sent: true };
}
```

**Twilio Pricing**: $0.0079/SMS (US) - Slightly more expensive but better features

## 🧪 Testing Checklist

### Before Production
- [ ] Test in `DEV_SMS_MODE=inline` mode
- [ ] Test in `DEV_SMS_MODE=email` mode
- [ ] Verify phone number format validation
- [ ] Test rate limiting (3 failed attempts)
- [ ] Test code expiration (10 minutes)
- [ ] Request SNS production access
- [ ] Set SNS spending limit ($10/month)
- [ ] Configure CloudWatch alarms
- [ ] Test with real phone number in sandbox
- [ ] Document emergency contact for SMS issues

### After Production
- [ ] Monitor CloudWatch metrics daily
- [ ] Check SNS spending weekly
- [ ] Review failed SMS deliveries
- [ ] Collect user feedback on SMS delivery
- [ ] Adjust spending limits as needed

## 🆘 Troubleshooting

### SMS Not Received
1. Check SNS sandbox status (must be in production)
2. Verify phone number format (E.164: +14155552671)
3. Check CloudWatch logs for errors
4. Verify SNS spending limit not reached
5. Check phone carrier spam filters

### High Costs
1. Check for abuse (rate limiting working?)
2. Review CloudWatch metrics for unusual spikes
3. Verify DEV_SMS_MODE in development environments
4. Consider email fallback for non-critical flows

### Delivery Failures
1. Check SNS delivery logs in CloudWatch
2. Verify phone number is valid and active
3. Check country-specific restrictions
4. Try different phone number for testing

## 📞 Support

- **AWS SNS Issues**: AWS Support Console
- **Cognito Issues**: Check CloudWatch Logs
- **Cost Questions**: AWS Billing Dashboard

## 🎉 Summary

You now have a production-ready SMS setup with:
- ✅ Real SMS delivery via AWS SNS
- ✅ Cost optimization with spending limits
- ✅ Development mode (no costs)
- ✅ Email fallback for testing
- ✅ Rate limiting and security
- ✅ Cognito SMS MFA enabled
- ✅ Easy migration path to third-party providers

**Estimated Monthly Cost**: $6-10 for typical usage (1,000 SMS)
