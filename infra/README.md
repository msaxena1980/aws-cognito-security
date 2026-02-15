# AWS Infrastructure

All AWS infrastructure code consolidated into single files for simplicity.

## Files

- `stack.js` - Complete CDK infrastructure definition (all resources in one file)
- `create.js` - Deploy the stack
- `destroy.js` - Destroy the stack
- `lambda/` - Lambda function code
- `tests/` - Lambda function tests

## Quick Start

### Deploy Infrastructure

```bash
npm run create
```

This will:
1. Deploy all AWS resources (Cognito, DynamoDB, Lambda, API Gateway)
2. Save outputs to `outputs.json`
3. **Automatically update `../src/aws-exports.js` with new values**
4. Display deployment summary

### Destroy Infrastructure

```bash
npm run destroy
```

This will delete all AWS resources.

## What Gets Created

### Free Tier Optimized Resources

1. **Cognito User Pool** - 50,000 MAUs free
2. **DynamoDB Tables** (Provisioned 1 RCU/WCU each)
   - UserSecurity
   - EmailMapping
   - DeviceTracking
3. **Lambda Functions** (128MB, 1M requests free)
   - PreSignUp, PostConfirmation, PostAuthentication (triggers)
   - Hello, GetAuthMethods, Vault, Account, Profile, Phone, EmailChange (API)
4. **API Gateway** - 1M requests free (12 months)

**Total Cost: $0/month** (within free tier)

## Environment Variables

Set before deployment:

```bash
export SES_SENDER_EMAIL="your-verified-email@example.com"
export ENCRYPTION_KEY="your-secret-key"
```

## After Deployment

The `create.js` script automatically updates `../src/aws-exports.js` with the new values.

Just run the frontend:

```bash
# From root directory
npm run dev
```

Visit: http://localhost:5173/

## Manual CDK Commands

```bash
# List stacks
npx cdk list

# Show what will be deployed
npx cdk diff

# Deploy
npx cdk deploy

# Destroy
npx cdk destroy
```

## Architecture

All infrastructure is defined in `stack.js`:
- Cognito User Pool with email authentication
- 3 DynamoDB tables with GSIs
- 9 Lambda functions with proper IAM permissions
- API Gateway with Cognito authorizer
- CORS configuration for all endpoints

## Free Tier Limits

- DynamoDB: 25 RCU/WCU free (using 6 RCU + 6 WCU)
- Lambda: 1M requests + 400,000 GB-seconds free
- API Gateway: 1M requests free (first 12 months)
- Cognito: 50,000 MAUs free
- CloudWatch Logs: 5 GB free

## Troubleshooting

### Deployment fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# Manually destroy stack
aws cloudformation delete-stack --stack-name InfraStack --region us-east-1
```

### Check deployed resources

```bash
# List DynamoDB tables
aws dynamodb list-tables --region us-east-1

# Check table capacity
aws dynamodb describe-table --table-name UserSecurity --region us-east-1
```
