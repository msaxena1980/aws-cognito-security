# Quick Reference Card

## 🚀 Deployment Commands

```bash
# Development (FREE)
npm run deploy:dev

# Production (PAID)
npm run deploy:prod
```

## 🗑️ Destruction Commands

```bash
npm run destroy:dev
npm run destroy:prod  # Requires confirmation
```

## 📁 Configuration Files

| File | Location | Purpose | Cost |
|------|----------|---------|------|
| `dev.env` | `infra/config/` | Development | FREE |
| `prod.env` | `infra/config/` | Production | $3-10/mo |

## 🔧 First Time Setup

```bash
cd infra/config
cp .env.example dev.env
cp .env.example prod.env
nano dev.env  # Edit settings
cd ..
npm run deploy:dev
```

## 📊 Configuration Variables

| Variable | Dev | Prod |
|----------|-----|------|
| `DEV_SMS_MODE` | `inline` | `(empty)` |
| `SES_SENDER_EMAIL` | `noreply@example.com` | `noreply@yourdomain.com` |
| `SNS_SPENDING_LIMIT` | `0` | `50` |
| `LOG_LEVEL` | `debug` | `warn` |
| `ENABLE_SMS_MFA` | `false` | `true` |

## 💰 Cost Estimates

| Environment | SMS/Month | Cost/Month |
|-------------|-----------|------------|
| Development | 0 (inline) | **$0** |
| Production | 500 | **$3.23** |
| Production | 2,000 | **$12.90** |
| Production | 10,000 | **$64.50** |

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `infra/README.md` | Main guide |
| `infra/CONFIG_GUIDE.md` | Configuration reference |
| `infra/SMS_QUICK_START.md` | 5-minute SMS setup |
| `infra/MIGRATION_GUIDE.md` | Migration from old approach |
| `ENVIRONMENT_CONFIG_SUMMARY.md` | This implementation summary |

## 🔍 Monitoring

```bash
# Check SMS usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum

# Check costs
# AWS Console → Billing Dashboard → Cost Explorer
```

## 🚨 Before Production

- [ ] Request SNS production access (24-48 hours)
- [ ] Verify SES sender email
- [ ] Set SNS spending limit: `aws sns set-sms-attributes --attributes MonthlySpendLimit=50.00`
- [ ] Configure CloudWatch cost alarms
- [ ] Test in test environment first

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| Config file not found | `cd infra/config && cp .env.example dev.env` |
| SMS not received | Check SNS sandbox status, verify phone format |
| High costs | Check CloudWatch, verify DEV_SMS_MODE in dev |
| Deployment failed | Check AWS credentials, verify config file syntax |

## 🎯 SMS Modes

| Mode | Config Value | Behavior | Cost |
|------|--------------|----------|------|
| **Inline** | `DEV_SMS_MODE=inline` | Codes in API response | FREE |
| **Production** | `DEV_SMS_MODE=` | Real SMS via SNS | PAID |

## 🔐 Security Features

✅ Rate limiting (3 attempts)  
✅ Code expiration (10 minutes)  
✅ E.164 phone validation  
✅ Brute force protection  
✅ Spending limits per environment  
✅ Git-safe configuration  

## 📞 Quick Help

- **Config issues**: `infra/CONFIG_GUIDE.md`
- **SMS setup**: `infra/SMS_QUICK_START.md`
- **Cost questions**: `infra/COST_OPTIMIZATION.md`
- **Migration**: `infra/MIGRATION_GUIDE.md`

---

**Start here**: `cd infra && npm run deploy:dev` 🚀
