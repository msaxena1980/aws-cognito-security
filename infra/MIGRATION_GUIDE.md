# Migration Guide: Environment Variables to Config Files

## 🎯 What Changed

**Before** (Old way):
```bash
export DEV_SMS_MODE=inline
export SES_SENDER_EMAIL=noreply@example.com
npm run deploy
```

**After** (New way):
```bash
# Settings in config/dev.env
npm run deploy:dev
```

## 🚀 Quick Migration (2 minutes)

### Step 1: Create Config Files

```bash
cd infra/config

# Create from template
cp .env.example dev.env
cp .env.example test.env
cp .env.example prod.env
```

### Step 2: Copy Your Current Settings

If you were using environment variables, copy them to the appropriate config file:

**Old command**:
```bash
export DEV_SMS_MODE=inline
export SES_SENDER_EMAIL=noreply@example.com
npm run deploy
```

**New config** (`config/dev.env`):
```bash
DEV_SMS_MODE=inline
SES_SENDER_EMAIL=noreply@example.com
SNS_SPENDING_LIMIT=0
LOG_LEVEL=debug
ENABLE_SMS_MFA=false
ENABLE_RATE_LIMITING=true
```

### Step 3: Use New Deployment Commands

```bash
# Instead of: npm run deploy
npm run deploy:dev

# Instead of: npm run destroy
npm run destroy:dev
```

## 📋 Command Mapping

| Old Command | New Command | Environment |
|-------------|-------------|-------------|
| `npm run deploy` | `npm run deploy:dev` | Development |
| `npm run deploy` (with test vars) | `npm run deploy:test` | Test/Staging |
| `npm run deploy` (with prod vars) | `npm run deploy:prod` | Production |
| `npm run destroy` | `npm run destroy:dev` | Development |
| `npm run destroy` | `npm run destroy:test` | Test/Staging |
| `npm run destroy` | `npm run destroy:prod` | Production |

## 🔄 Environment Variable Mapping

### SMS Configuration

| Old Variable | New Location | Notes |
|--------------|--------------|-------|
| `DEV_SMS_MODE` | `config/*.env` | Same values |
| `DEV_EMAIL_MODE` | `config/*.env` | Same values |
| `SES_SENDER_EMAIL` | `config/*.env` | Same values |

### New Variables (Added)

| Variable | Purpose | Default |
|----------|---------|---------|
| `SNS_SPENDING_LIMIT` | Monthly SMS cost limit | `10` |
| `LOG_LEVEL` | CloudWatch log verbosity | `info` |
| `ENABLE_SMS_MFA` | Enable SMS MFA | `false` |
| `ENABLE_RATE_LIMITING` | Enable rate limiting | `true` |

## 📝 Example Migrations

### Example 1: Development Setup

**Before**:
```bash
#!/bin/bash
export DEV_SMS_MODE=inline
export SES_SENDER_EMAIL=dev@example.com
cd infra
npm run deploy
```

**After**:
```bash
# config/dev.env
DEV_SMS_MODE=inline
SES_SENDER_EMAIL=dev@example.com
SNS_SPENDING_LIMIT=0
LOG_LEVEL=debug
ENABLE_SMS_MFA=false
ENABLE_RATE_LIMITING=true
```

```bash
#!/bin/bash
cd infra
npm run deploy:dev
```

### Example 2: Production Setup

**Before**:
```bash
#!/bin/bash
export DEV_SMS_MODE=
export SES_SENDER_EMAIL=noreply@myapp.com
cd infra
npm run deploy
```

**After**:
```bash
# config/prod.env
DEV_SMS_MODE=
SES_SENDER_EMAIL=noreply@myapp.com
SNS_SPENDING_LIMIT=50
LOG_LEVEL=warn
ENABLE_SMS_MFA=true
ENABLE_RATE_LIMITING=true
```

```bash
#!/bin/bash
cd infra
npm run deploy:prod
```

### Example 3: CI/CD Pipeline

**Before** (GitHub Actions):
```yaml
- name: Deploy
  env:
    DEV_SMS_MODE: ""
    SES_SENDER_EMAIL: ${{ secrets.SES_SENDER_EMAIL }}
  run: |
    cd infra
    npm run deploy
```

**After** (GitHub Actions):
```yaml
- name: Create prod.env
  run: |
    cd infra/config
    echo "DEV_SMS_MODE=" > prod.env
    echo "SES_SENDER_EMAIL=${{ secrets.SES_SENDER_EMAIL }}" >> prod.env
    echo "SNS_SPENDING_LIMIT=50" >> prod.env
    echo "LOG_LEVEL=warn" >> prod.env
    echo "ENABLE_SMS_MFA=true" >> prod.env
    echo "ENABLE_RATE_LIMITING=true" >> prod.env

- name: Deploy
  run: |
    cd infra
    npm run deploy:prod
```

## 🔍 Verification

### Check Your Migration

1. **Verify config files exist**:
```bash
ls -la infra/config/*.env
# Should show: dev.env, test.env, prod.env
```

2. **Test deployment**:
```bash
cd infra
npm run deploy:dev
```

3. **Verify environment is loaded**:
```bash
# Check the deployment output
# Should show: "📋 Configuration: DEV_SMS_MODE: inline ..."
```

## 🐛 Troubleshooting

### Issue: Config file not found

```bash
❌ Configuration file not found: config/dev.env
```

**Solution**:
```bash
cd infra/config
cp .env.example dev.env
nano dev.env  # Edit with your settings
```

### Issue: Old commands still work

The old commands (`npm run deploy`, `npm run destroy`) still work but don't use the config files. They use environment variables from your shell.

**Solution**: Use the new commands:
- `npm run deploy:dev`
- `npm run deploy:test`
- `npm run deploy:prod`

### Issue: Variables not being loaded

**Check**:
1. Config file exists in `infra/config/`
2. File has correct format (no spaces around `=`)
3. No quotes around values (unless needed)

**Example**:
```bash
# ✅ Correct
DEV_SMS_MODE=inline
SES_SENDER_EMAIL=noreply@example.com

# ❌ Wrong
DEV_SMS_MODE = inline
SES_SENDER_EMAIL="noreply@example.com"
```

## 📚 Benefits of New Approach

### Before (Environment Variables)

❌ Manual export commands  
❌ Easy to forget variables  
❌ Hard to share with team  
❌ No environment separation  
❌ Difficult to document  

### After (Config Files)

✅ All settings in one file  
✅ Environment-specific configs  
✅ Easy to share (template)  
✅ Git-safe (files ignored)  
✅ Self-documenting  
✅ Safety checks built-in  

## 🎯 Next Steps

1. **Create your config files** from `.env.example`
2. **Test in dev** with `npm run deploy:dev`
3. **Update your scripts** to use new commands
4. **Update CI/CD** pipelines if needed
5. **Share template** with your team

## 📞 Need Help?

- **Configuration Guide**: `CONFIG_GUIDE.md`
- **Quick Start**: `SMS_QUICK_START.md`
- **Full Setup**: `SMS_SETUP_GUIDE.md`

## ✅ Migration Checklist

- [ ] Created `config/dev.env`
- [ ] Created `config/test.env`
- [ ] Created `config/prod.env`
- [ ] Copied existing environment variables to config files
- [ ] Tested `npm run deploy:dev`
- [ ] Updated deployment scripts
- [ ] Updated CI/CD pipelines
- [ ] Shared `.env.example` with team
- [ ] Documented custom settings
- [ ] Removed old export commands

---

**Migration complete!** You can now use `npm run deploy:dev|test|prod` for all deployments. 🎉
