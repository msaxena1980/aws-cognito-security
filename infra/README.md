# AWS Infrastructure

Complete AWS infrastructure for the Cognito Security Demo, consolidated into minimal files for simplicity.

## Core Files

- **`stack.js`** - Complete CDK infrastructure definition (all AWS resources in one file)
- **`create.js`** - Deploy the stack and auto-update frontend config
- **`destroy.js`** - Destroy the stack with confirmation
- **`lambda/`** - All Lambda function code
- **`tests/`** - Lambda function tests (Jest + aws-sdk-client-mock)

## Quick Start

### Deploy Infrastructure

```bash
npm run create
```

This will:
1. Deploy all AWS resources (Cognito, DynamoDB, Lambda, API Gateway, KMS)
2. Save outputs to `outputs.json`
3. **Automatically update `../src/aws-exports.js`** with new values
4. Display deployment summary

### Destroy Infrastructure

```bash
npm run destroy
```

Prompts for confirmation, then deletes all AWS resources.

## What Gets Created

### Free Tier Optimized Resources

1. **Cognito User Pool**
   - Email-based sign-in (case-insensitive)
   - Optional TOTP MFA
   - Email verification
   - 50,000 MAUs free

2. **DynamoDB Tables** (Provisioned 1 RCU/WCU each)
   - `UserSecurity` - User profiles, vault, passphrase (with EmailIndex GSI)
   - `EmailMapping` - Stable email-to-sub mapping (with SubIndex GSI)
   - `DeviceTracking` - Device login history (with LastLoginIndex GSI)

3. **Lambda Functions** (128MB, Node.js 20.x)
   - **Triggers:** PreSignUp, PostConfirmation, PostAuthentication
   - **API Handlers:** Hello, GetAuthMethods, Vault, Account, Profile, Phone, EmailChange, VerifyCredentials

4. **API Gateway**
   - REST API with Cognito authorizer
   - CORS enabled for all origins (configurable)
   - Throttling: 100 req/s rate, 200 burst
   - 1M requests free (first 12 months)

5. **KMS Key**
   - For vault/passphrase encryption
   - Key rotation enabled

**Total Cost: $0/month** (within AWS Free Tier)

## Environment Variables (Optional)

Set before deployment for email features and vault encryption:

```bash
export SES_SENDER_EMAIL="your-verified-email@example.com"
export ENCRYPTION_KEY="your-secret-key"
```

If not set, defaults are used (see `stack.js`).

## After Deployment

The `create.js` script automatically updates `../src/aws-exports.js` with:
- User Pool ID
- Client ID
- API Gateway URL
- Region

Just start the frontend:

```bash
cd ..
npm run dev
```

Visit: http://localhost:5173/

## Architecture

All infrastructure is defined in `stack.js`:

```
Cognito User Pool
├── PreSignUp Trigger → Lambda → DynamoDB (UserSecurity)
├── PostConfirmation Trigger → Lambda → DynamoDB (UserSecurity, EmailMapping)
└── PostAuthentication Trigger → Lambda → DynamoDB (UserSecurity, DeviceTracking) + SES

API Gateway (REST)
├── GET /auth-methods (public) → Lambda → DynamoDB + Cognito
├── GET /hello (auth) → Lambda
├── /profile (auth) → Lambda → DynamoDB
├── /vault (auth) → Lambda → DynamoDB + KMS
├── /account/delete/* (auth) → Lambda → DynamoDB + KMS + Cognito
├── /profile/phone/* (auth) → Lambda → DynamoDB + Cognito + SES
├── /profile/email/* (auth) → Lambda → DynamoDB + Cognito + SES
└── POST /verify-credentials (public) → Lambda → Cognito
```

## Manual CDK Commands

```bash
# List stacks
npx cdk list --app "node stack.js"

# Show what will be deployed
npx cdk diff --app "node stack.js"

# Deploy manually
npx cdk deploy --app "node stack.js"

# Destroy manually
npx cdk destroy --app "node stack.js"
```

## Testing

Run Lambda function tests:

```bash
npm test
```

Tests use Jest with `aws-sdk-client-mock` to verify:
- Cognito trigger behavior (PreSignUp, PostConfirmation, PostAuthentication)
- DynamoDB operations
- SES email sending

## Free Tier Limits

- **DynamoDB:** 25 RCU/WCU free (using 6 RCU + 6 WCU across 3 tables)
- **Lambda:** 1M requests + 400,000 GB-seconds free
- **API Gateway:** 1M requests free (first 12 months)
- **Cognito:** 50,000 MAUs free
- **CloudWatch Logs:** 5 GB free
- **KMS:** 20,000 requests free

## Troubleshooting

### Deployment fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# Check region
aws configure get region

# Manually destroy if stuck
aws cloudformation delete-stack --stack-name InfraStack --region us-east-1
```

### Frontend config not updated

```bash
# Verify outputs.json exists
cat outputs.json

# Check aws-exports.js
cat ../src/aws-exports.js
```

### Check deployed resources

```bash
# List DynamoDB tables
aws dynamodb list-tables --region us-east-1

# List Lambda functions
aws lambda list-functions --region us-east-1 --query 'Functions[?contains(FunctionName, `Infra`)].FunctionName'

# Check Cognito user pool
aws cognito-idp list-user-pools --max-results 10 --region us-east-1
```

## Documentation

For complete architecture, implementation details, and optimization work, see:
- **[../docs/aws-cognito-implementation-plan.md](../docs/aws-cognito-implementation-plan.md)** - Complete implementation plan
- **[../INFRASTRUCTURE.md](../INFRASTRUCTURE.md)** - Infrastructure overview
