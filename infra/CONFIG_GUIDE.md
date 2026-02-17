# Environment Configuration Guide

## 📁 Configuration Structure

```
infra/
├── config/
│   ├── .env.example      # Template (committed to git)
│   ├── dev.env          # Development config (gitignored)
│   ├── test.env         # Test/staging config (gitignored)
│   └── prod.env         # Production config (gitignored)
├── scripts/
│   ├── deploy-with-env.js   # Deployment script
│   └── destroy-with-env.js  # Destruction script
└── package.json         # Updated with new scripts
```

## 🚀 Quick Start

### 1. Create Your Configuration Files

```bash
cd infra/config

# Copy the example file for each environment
cp .env.example dev.env
cp .env.example test.env
cp .env.example prod.env

# Edit each file with your settings
nano dev.env
nano test.env
nano prod.env
```

### 2. Deploy to Any Environment

```bash
cd infra

# Development (FREE - codes in API response)
npm run deploy:dev

# Test/Staging (FREE - codes via email)
npm run deploy:test

# Production (PAID - real SMS)
npm run deploy:prod
```

## 📋 Configuration Files Explained

### `dev.env` - Development Environment

**Purpose**: Local development, no SMS costs

```bash
# SMS codes returned in API responses
DEV_SMS_MODE=inline
DEV_EMAIL_MODE=inline

# Not used in dev mode
SES_SENDER_EMAIL=noreply@example.com

# No spending
SNS_SPENDING_LIMIT=0

# Verbose logging
LOG_LEVEL=debug

# Features
ENABLE_SMS_MFA=false
ENABLE_RATE_LIMITING=true
```

**Cost**: $0 (FREE)

**Use when**:
- Local development
- Testing API endpoints
- Debugging code
- No need for real SMS

### `test.env` - Test/Staging Environment

**Purpose**: Pre-production testing with email fallback

```bash
# SMS codes sent via email instead
DEV_SMS_MODE=email
DEV_EMAIL_MODE=email

# REQUIRED: Must be verified in AWS SES
SES_SENDER_EMAIL=noreply@yourdomain.com

# Low spending limit
SNS_SPENDING_LIMIT=5

# Standard logging
LOG_LEVEL=info

# Features
ENABLE_SMS_MFA=false
ENABLE_RATE_LIMITING=true
```

**Cost**: $0 (FREE - uses SES instead of SNS)

**Use when**:
- Testing full user flows
- QA/staging environment
- Demo to stakeholders
- Want to avoid SMS costs

**Requirements**:
- Verify SES sender email in AWS Console

### `prod.env` - Production Environment

**Purpose**: Real SMS delivery to users

```bash
# Empty = production mode (real SMS)
DEV_SMS_MODE=
DEV_EMAIL_MODE=

# REQUIRED: Must be verified in AWS SES
SES_SENDER_EMAIL=noreply@yourdomain.com

# Higher spending limit
SNS_SPENDING_LIMIT=50

# Minimal logging
LOG_LEVEL=warn

# Features
ENABLE_SMS_MFA=true
ENABLE_RATE_LIMITING=true
```

**Cost**: ~$0.00645 per SMS (US)

**Use when**:
- Production deployment
- Real users
- SMS delivery required

**Requirements**:
- ✅ SNS production access approved (24-48 hours)
- ✅ SNS spending limit configured
- ✅ CloudWatch cost alarms enabled
- ✅ SES sender email verified
- ✅ Tested in test environment first

## 🎯 Deployment Commands

### Deploy Commands

```bash
# Development
npm run deploy:dev

# Test/Staging
npm run deploy:test

# Production (with safety checks)
npm run deploy:prod
```

### Destroy Commands

```bash
# Development
npm run destroy:dev

# Test/Staging
npm run destroy:test

# Production (requires confirmation)
npm run destroy:prod
```

## 🔒 Security Best Practices

### 1. Never Commit Environment Files

The `.gitignore` is configured to exclude:
- `config/dev.env`
- `config/test.env`
- `config/prod.env`

Only `config/.env.example` is committed.

### 2. Use Different AWS Accounts

**Recommended setup**:
```bash
# Development - Personal AWS account
AWS_PROFILE=dev npm run deploy:dev

# Test - Shared staging account
AWS_PROFILE=staging npm run deploy:test

# Production - Production account
AWS_PROFILE=production npm run deploy:prod
```

### 3. Rotate Secrets Regularly

If you add secrets to config files:
- Use AWS Secrets Manager for sensitive data
- Rotate credentials every 90 days
- Never log secret values

### 4. Limit Production Access

```bash
# Only specific team members should have prod.env
chmod 600 config/prod.env

# Store production config in secure location
# (e.g., 1Password, AWS Secrets Manager)
```

## 📊 Configuration Variables Reference

### SMS Configuration

| Variable | Values | Description |
|----------|--------|-------------|
| `DEV_SMS_MODE` | `inline`, `email`, `(empty)` | SMS delivery mode |
| `DEV_EMAIL_MODE` | `inline`, `email`, `(empty)` | Email delivery mode |

**Values**:
- `inline` - Codes in API response (dev only)
- `email` - Codes via email (testing)
- `(empty)` - Real SMS/email (production)

### SES Configuration

| Variable | Example | Description |
|----------|---------|-------------|
| `SES_SENDER_EMAIL` | `noreply@yourdomain.com` | Verified SES email |

**Requirements**:
- Must be verified in AWS SES Console
- Can be email address or domain
- Required for all environments

### Cost Protection

| Variable | Example | Description |
|----------|---------|-------------|
| `SNS_SPENDING_LIMIT` | `10` | Monthly SMS spending limit (USD) |

**Recommendations**:
- Dev: `0` (no SMS)
- Test: `5` (safety net)
- Prod: `50` (adjust based on usage)

### Logging

| Variable | Values | Description |
|----------|--------|-------------|
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | CloudWatch log verbosity |

**Recommendations**:
- Dev: `debug` (verbose)
- Test: `info` (standard)
- Prod: `warn` (minimal)

### Feature Flags

| Variable | Values | Description |
|----------|--------|-------------|
| `ENABLE_SMS_MFA` | `true`, `false` | Enable SMS as MFA option |
| `ENABLE_RATE_LIMITING` | `true`, `false` | Enable rate limiting |

## 🔧 Advanced Usage

### Custom Environment

Create a custom environment for special cases:

```bash
# Create custom config
cp config/.env.example config/demo.env

# Edit settings
nano config/demo.env

# Deploy
node scripts/deploy-with-env.js demo
```

### Override Specific Variables

```bash
# Override single variable
SES_SENDER_EMAIL=custom@example.com npm run deploy:dev

# Override multiple variables
DEV_SMS_MODE=email SES_SENDER_EMAIL=test@example.com npm run deploy:test
```

### CI/CD Integration

**GitHub Actions example**:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Create prod.env from secrets
        run: |
          cd infra/config
          echo "DEV_SMS_MODE=" > prod.env
          echo "SES_SENDER_EMAIL=${{ secrets.SES_SENDER_EMAIL }}" >> prod.env
          echo "SNS_SPENDING_LIMIT=50" >> prod.env
          echo "LOG_LEVEL=warn" >> prod.env
      
      - name: Deploy to production
        run: |
          cd infra
          npm install
          npm run deploy:prod
```

## 🐛 Troubleshooting

### Config File Not Found

```bash
❌ Configuration file not found: config/dev.env
```

**Solution**:
```bash
cd infra/config
cp .env.example dev.env
nano dev.env  # Edit with your settings
```

### Invalid Environment

```bash
❌ Invalid environment: production
   Valid options: dev, test, prod
```

**Solution**: Use correct environment name:
```bash
npm run deploy:prod  # Not deploy:production
```

### SES Email Not Verified

```bash
❌ Email address is not verified
```

**Solution**:
1. Go to AWS Console → SES → Verified identities
2. Click "Create identity"
3. Enter your email address
4. Check your email and click verification link

### SNS Production Access Required

```bash
❌ SMS delivery failed: Sandbox mode
```

**Solution**:
1. AWS Console → SNS → Text messaging (SMS)
2. Click "Request production access"
3. Fill out form (takes 24-48 hours)

### Spending Limit Reached

```bash
❌ SMS delivery failed: Spending limit exceeded
```

**Solution**:
```bash
# Increase limit in AWS Console or CLI
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=50.00
```

## 📚 Related Documentation

- **Quick Start**: `SMS_QUICK_START.md`
- **Full Setup**: `SMS_SETUP_GUIDE.md`
- **Cost Details**: `COST_OPTIMIZATION.md`
- **Summary**: `../SMS_IMPLEMENTATION_SUMMARY.md`

## ✅ Checklist

### Before First Deployment

- [ ] Copy `.env.example` to `dev.env`, `test.env`, `prod.env`
- [ ] Edit each config file with your settings
- [ ] Verify SES sender email in AWS Console
- [ ] Test in dev environment first
- [ ] Review cost estimates

### Before Production Deployment

- [ ] Request SNS production access (24-48 hours)
- [ ] Set SNS spending limit in AWS Console
- [ ] Configure CloudWatch cost alarms
- [ ] Test thoroughly in test environment
- [ ] Review `prod.env` configuration
- [ ] Backup existing production data
- [ ] Plan rollback strategy

### After Deployment

- [ ] Test SMS delivery with real phone number
- [ ] Monitor CloudWatch logs
- [ ] Check AWS Billing Dashboard
- [ ] Verify cost alarms working
- [ ] Document any issues
- [ ] Update team on deployment

## 🎉 Benefits of This Approach

✅ **No manual environment variables** - Everything in config files  
✅ **Environment-specific settings** - Different configs per environment  
✅ **Git-safe** - Sensitive configs not committed  
✅ **Easy deployment** - Single command per environment  
✅ **Safety checks** - Production requires confirmation  
✅ **Cost protection** - Spending limits per environment  
✅ **Team-friendly** - Easy to share and document  

---

**You're all set!** Use `npm run deploy:dev` to get started. 🚀
