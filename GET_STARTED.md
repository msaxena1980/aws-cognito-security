# Get Started in 3 Minutes

## 🚀 Quick Start

### Step 1: Create Config Files (30 seconds)

```bash
cd infra/config
cp .env.example dev.env
```

### Step 2: Edit Config (1 minute)

```bash
nano dev.env
```

**Minimum required change:**
```bash
# Change this line:
SES_SENDER_EMAIL=noreply@example.com

# To your email (or keep dev default):
SES_SENDER_EMAIL=your-email@yourdomain.com
```

Save and exit (Ctrl+X, Y, Enter)

### Step 3: Deploy (1 minute)

```bash
cd ..
npm run deploy:dev
```

**That's it!** Your infrastructure is deploying. ☕

## 📋 What Just Happened?

1. ✅ Created development configuration
2. ✅ Set your email address
3. ✅ Deployed to AWS with:
   - SMS codes in API responses (FREE)
   - No actual SMS sent
   - All AWS services configured
   - Ready for testing

## 🎯 Next Steps

### Test Your Deployment

```bash
# Check if deployment succeeded
# Look for "✅ Deployment successful!" message

# Get your API URL from outputs
cat infra/outputs.json
```

### Create Production Environment

```bash
cd infra/config

# Production (PAID - real SMS)
cp .env.example prod.env
nano prod.env  # Update all settings
```

### Deploy to Production

```bash
cd ..

# Production (after SNS approval)
npm run deploy:prod
```

## 💰 Cost Summary

| Environment | Command | Cost |
|-------------|---------|------|
| Development | `npm run deploy:dev` | **$0/month** |
| Production | `npm run deploy:prod` | **$3-10/month** |

## 🔍 Validate Before Deploying

```bash
# Check your configuration
npm run validate:dev
npm run validate:prod
```

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| `QUICK_REFERENCE.md` | Command cheat sheet |
| `infra/CONFIG_GUIDE.md` | Complete configuration guide |
| `infra/SMS_SETUP_GUIDE.md` | SMS setup instructions |
| `FINAL_IMPLEMENTATION_SUMMARY.md` | Everything you got |

## 🆘 Common Issues

### "Config file not found"
```bash
cd infra/config
cp .env.example dev.env
```

### "SES_SENDER_EMAIL must be set"
```bash
nano config/dev.env
# Change SES_SENDER_EMAIL to your email
```

### "AWS credentials not configured"
```bash
aws configure
# Enter your AWS credentials
```

## ✅ You're Done!

Your development environment is ready. Start building! 🎉

**Deploy command**: `npm run deploy:dev`  
**Destroy command**: `npm run destroy:dev`  
**Validate command**: `npm run validate:dev`

---

**Need help?** See `QUICK_REFERENCE.md` or `infra/CONFIG_GUIDE.md`
