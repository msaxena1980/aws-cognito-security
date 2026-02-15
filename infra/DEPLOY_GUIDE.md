# Complete Deployment Guide

## Simplified Workflow

The deployment process is now fully automated! No manual configuration needed.

## Steps

### 1. Destroy Old Infrastructure (if exists)

```bash
cd infra
npm run destroy
```

**Output:**
```
⚠️  Destroy AWS Infrastructure

This will delete:
  - Cognito User Pool
  - 3 DynamoDB Tables
  - 9 Lambda Functions
  - API Gateway
  - All associated IAM roles

Are you sure? Type "yes" to confirm: yes

🗑️  Destroying stack...
✅ Stack destroyed successfully!
```

### 2. Deploy New Infrastructure

```bash
npm run create
```

**Output:**
```
🚀 Deploying AWS Infrastructure...

Running: npx cdk deploy --require-approval never --app "node stack.js"

[CloudFormation deployment progress...]

✅ Deployment complete!

Fetching stack outputs...
📄 Stack outputs saved to outputs.json
📝 Updating src/aws-exports.js...
✅ Updated src/aws-exports.js with new values

📊 Deployment Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Region:        us-east-1
User Pool:     us-east-1_ABC123XYZ
Client ID:     1a2b3c4d5e6f7g8h9i0j
API Endpoint:  https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ All done! Your infrastructure is ready.

💡 Next steps:
1. Run: npm run dev
2. Visit: http://localhost:5173/
3. Test signup/login
```

### 3. Start Frontend

```bash
cd ..  # Back to root directory
npm run dev
```

**Output:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### 4. Test the Application

Visit http://localhost:5173/ and:
- ✅ Sign up with a new account
- ✅ Verify email (check your inbox)
- ✅ Log in
- ✅ Test the authenticated features

## What Happens Automatically

### ✅ Automated Steps

1. **CDK Deployment** - Creates all AWS resources
2. **Fetch Outputs** - Gets User Pool ID, Client ID, API URL
3. **Update Frontend Config** - Writes to `src/aws-exports.js`
4. **Display Summary** - Shows all important values

### ❌ No Manual Steps Required

- ~~Copy values from outputs.json~~
- ~~Edit aws-exports.js manually~~
- ~~Find and replace IDs~~

Everything is automatic! 🎉

## One-Liner for Complete Rebuild

```bash
cd infra && npm run destroy && sleep 30 && npm run create && cd .. && npm run dev
```

This will:
1. Destroy old infrastructure
2. Wait 30 seconds for cleanup
3. Deploy new infrastructure
4. Auto-update frontend config
5. Start the dev server

## Troubleshooting

### If deployment fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# Try manual CDK deploy
cd infra
npx cdk deploy
```

### If aws-exports.js not updated

The script automatically updates it, but you can verify:

```bash
# Check if file was modified
ls -la src/aws-exports.js

# View the content
cat src/aws-exports.js
```

### Manual update (if needed)

```bash
cd infra
node -e "
const fs = require('fs');
const outputs = JSON.parse(fs.readFileSync('outputs.json', 'utf8'));
console.log('User Pool ID:', outputs.InfraStack.UserPoolId);
console.log('Client ID:', outputs.InfraStack.UserPoolClientId);
console.log('API URL:', outputs.InfraStack.ApiUrl);
"
```

## Environment Variables (Optional)

For email features and secure vault encryption:

```bash
# Before deployment
export SES_SENDER_EMAIL="your-verified-email@example.com"
export ENCRYPTION_KEY=$(openssl rand -base64 32)

# Then deploy
cd infra
npm run create
```

## Summary

**Old Way:**
1. Deploy infrastructure
2. Copy outputs
3. Manually edit aws-exports.js
4. Find/replace 3-4 values
5. Save file
6. Start frontend

**New Way:**
1. `npm run create`
2. `npm run dev`

Done! 🚀
