# Simplified Setup - DEV & PROD Only

## ✅ What Changed

Removed all test/staging environment references. Now you have only:
- **DEV** - Development (FREE, inline codes)
- **PROD** - Production (PAID, real SMS)

## 🚀 Available Commands

```bash
# Development
npm run deploy:dev
npm run destroy:dev
npm run validate:dev

# Production
npm run deploy:prod
npm run destroy:prod
npm run validate:prod
```

## 📁 Configuration Files

```
infra/config/
├── .env.example    ✅ Template
├── dev.env         ✅ Development
└── prod.env        ✅ Production
```

## 🔧 Quick Setup

```bash
# 1. Create configs
cd infra/config
cp .env.example dev.env
cp .env.example prod.env

# 2. Edit dev config
nano dev.env
# Update SES_SENDER_EMAIL

# 3. Deploy
cd ..
npm run deploy:dev
```

## 💰 Cost Summary

| Environment | Command | SMS Mode | Cost |
|-------------|---------|----------|------|
| **Development** | `npm run deploy:dev` | Inline codes | **$0/month** |
| **Production** | `npm run deploy:prod` | Real SMS | **$3-10/month** |

## 📊 Configuration Differences

| Variable | DEV | PROD |
|----------|-----|------|
| `DEV_SMS_MODE` | `inline` | `(empty)` |
| `SNS_SPENDING_LIMIT` | `0` | `50` |
| `LOG_LEVEL` | `debug` | `warn` |
| `ENABLE_SMS_MFA` | `false` | `true` |
| `RP_ID` | `localhost` | `yourdomain.com` |

## ✅ Validation Test

```bash
$ npm run validate:dev
✅ Configuration is valid

$ npm run validate:prod
✅ Configuration is valid

$ npm run validate:test
❌ Error: Configuration file not found
```

## 🎯 Next Steps

1. **Development**: `npm run deploy:dev`
2. **Production**: Request SNS access, then `npm run deploy:prod`

---

**Simple. Clean. Two environments only.** 🎉
