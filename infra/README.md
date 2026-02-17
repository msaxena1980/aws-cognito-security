# AWS Cognito Security - Infrastructure

Production-ready AWS infrastructure with SMS support and environment-based configuration.

## 🚀 Quick Start

### 1. Setup Configuration

```bash
cd config

# Create environment configs from template
cp .env.example dev.env
cp .env.example test.env
cp .env.example prod.env

# Edit each file with your settings
nano dev.env
```

### 2. Deploy

```bash
# Development (FREE - codes in API response)
npm run deploy:dev

# Production (PAID - real SMS)
npm run deploy:prod
```

## 📋 Available Commands

### Deployment
- `npm run deploy:dev` - Deploy development environment
- `npm run deploy:prod` - Deploy production environment

### Destruction
- `npm run destroy:dev` - Destroy development environment
- `npm run destroy:prod` - Destroy production environment (requires confirmation)

### Testing
- `npm test` - Run Lambda unit tests

### Legacy (still works, but use new commands above)
- `npm run deploy` - Deploy with shell environment variables
- `npm run destroy` - Destroy with confirmation

## 📁 Project Structure

```
infra/
├── config/
│   ├── .env.example      # Configuration template
│   ├── dev.env          # Development settings (gitignored)
│   ├── test.env         # Test/staging settings (gitignored)
│   └── prod.env         # Production settings (gitignored)
├── scripts/
│   ├── deploy-with-env.js   # Environment-aware deployment
│   └── destroy-with-env.js  # Environment-aware destruction
├── lambda/              # Lambda function code
├── tests/              # Unit tests
├── create.js           # CDK deployment script
├── destroy.js          # CDK destruction script
└── stack.js            # CDK infrastructure definition
```

## 🔧 Configuration

### Environment Files

Each environment has its own configuration file:

**`config/dev.env`** - Development (FREE)
```bash
DEV_SMS_MODE=inline          # Codes in API response
SES_SENDER_EMAIL=noreply@example.com
SNS_SPENDING_LIMIT=0
LOG_LEVEL=debug
```

**`config/prod.env`** - Production (PAID)
```bash
DEV_SMS_MODE=                # Real SMS via SNS
SES_SENDER_EMAIL=noreply@yourdomain.com
SNS_SPENDING_LIMIT=50
LOG_LEVEL=warn
ENABLE_SMS_MFA=true
```

See `CONFIG_GUIDE.md` for complete documentation.

## 💰 Cost Estimates

| Environment | SMS Mode | Monthly Cost |
|-------------|----------|--------------|
| Development | Inline codes | **$0** (FREE) |
| Production | Real SMS | **$3-10** (typical) |

See `COST_OPTIMIZATION.md` for detailed cost analysis.

## 📚 Documentation

- **`CONFIG_GUIDE.md`** - Complete configuration guide
- **`SMS_QUICK_START.md`** - 5-minute SMS setup
- **`SMS_SETUP_GUIDE.md`** - Production SMS guide
- **`COST_OPTIMIZATION.md`** - Cost optimization strategies
- **`MIGRATION_GUIDE.md`** - Migrate from old env vars
- **`../SMS_IMPLEMENTATION_SUMMARY.md`** - Implementation overview

## 🏗️ Infrastructure Components

### AWS Services
- **Cognito User Pool** - Authentication with SMS MFA
- **DynamoDB** - User data, device tracking, passkeys
- **Lambda** - API endpoints and Cognito triggers
- **API Gateway** - REST API
- **SNS** - SMS delivery
- **SES** - Email delivery
- **KMS** - Encryption for vault/passphrase

### Features
✅ Email/password authentication  
✅ SMS verification for phone changes  
✅ SMS MFA (optional)  
✅ TOTP MFA (authenticator apps)  
✅ Passkeys (WebAuthn)  
✅ Device tracking  
✅ Encrypted vault  
✅ Account deletion  

## 🔒 Security

- Rate limiting (3 attempts per verification)
- Code expiration (10 minutes)
- E.164 phone validation
- Brute force protection
- KMS encryption for sensitive data
- Spending limits per environment

## 🧪 Testing

```bash
# Run unit tests
npm test

# Test specific file
npm test postAuthentication.test.js
```

## 🚨 Before Production

### Required Steps
- [ ] Request SNS production access (24-48 hours)
- [ ] Verify SES sender email
- [ ] Set SNS spending limit
- [ ] Configure CloudWatch cost alarms
- [ ] Test thoroughly in test environment

### SNS Production Access
```bash
# AWS Console → SNS → Text messaging (SMS)
# Click "Request production access"
# Fill out form with use case details
```

### Set Spending Limit
```bash
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=50.00
```

## 📊 Monitoring

### Check SMS Usage
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfMessagesPublished \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

### Check Costs
- AWS Console → Billing Dashboard → Cost Explorer
- Filter by service: SNS

## 🐛 Troubleshooting

### Config file not found
```bash
cd config
cp .env.example dev.env
nano dev.env
```

### SMS not received
1. Check SNS sandbox status (must be production)
2. Verify phone format: +14155552671 (E.164)
3. Check CloudWatch logs
4. Verify spending limit not reached

### High costs
1. Check CloudWatch for abuse
2. Verify DEV_SMS_MODE in dev environments
3. Review rate limiting logs
4. Consider email fallback

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
- name: Create prod.env
  run: |
    cd infra/config
    echo "DEV_SMS_MODE=" > prod.env
    echo "SES_SENDER_EMAIL=${{ secrets.SES_SENDER_EMAIL }}" >> prod.env
    echo "SNS_SPENDING_LIMIT=50" >> prod.env

- name: Deploy
  run: |
    cd infra
    npm run deploy:prod
```

## 📞 Support

- **Configuration**: See `CONFIG_GUIDE.md`
- **SMS Setup**: See `SMS_SETUP_GUIDE.md`
- **Cost Questions**: See `COST_OPTIMIZATION.md`
- **Migration**: See `MIGRATION_GUIDE.md`

---

**Ready to deploy?** Start with `npm run deploy:dev` 🚀
