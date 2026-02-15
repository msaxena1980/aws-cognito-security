# Infrastructure Guide

All AWS infrastructure code has been consolidated into simple, easy-to-understand files.

## Structure

```
infra/
├── stack.js      - Complete CDK infrastructure (all resources in one file)
├── create.js     - Deploy script
├── destroy.js    - Destroy script
├── lambda/       - Lambda function code
└── tests/        - Lambda tests
```

## Quick Commands

### Deploy Everything

```bash
cd infra
npm run create
```

### Destroy Everything

```bash
cd infra
npm run destroy
```

## What's Deployed

### Free Tier Optimized Stack

1. **Cognito User Pool**
   - Email/password authentication
   - Optional MFA (TOTP)
   - 50,000 MAUs free

2. **DynamoDB Tables** (Provisioned 1 RCU/WCU)
   - UserSecurity - User profiles and vault data
   - EmailMapping - Email to user ID mapping
   - DeviceTracking - Login device history

3. **Lambda Functions** (128MB memory)
   - PreSignUp, PostConfirmation, PostAuthentication (Cognito triggers)
   - Hello, GetAuthMethods, Vault, Account, Profile, Phone, EmailChange (API endpoints)

4. **API Gateway**
   - REST API with Cognito authorizer
   - Rate limiting (100 req/s, burst 200)
   - CORS enabled

**Total Cost: $0/month** (within AWS Free Tier)

## Key Changes Made

### Consolidation
- ✅ All CDK code merged into single `stack.js` file
- ✅ Simple `create.js` and `destroy.js` scripts
- ✅ Removed redundant files (lib/, bin/, scripts/modules/)
- ✅ Removed redundant documentation files

### Free Tier Optimization
- ✅ DynamoDB: Provisioned mode (1 RCU/WCU per table)
- ✅ Lambda: 128MB memory, 3-5s timeout
- ✅ Removed KMS custom key (saves $1/month)
- ✅ Removed Secrets Manager (saves $0.80/month)
- ✅ Using environment variables for configuration

## Environment Variables

Set before deployment:

```bash
export SES_SENDER_EMAIL="your-verified-email@example.com"
export ENCRYPTION_KEY="your-secret-encryption-key"
```

## After Deployment

The deployment script automatically updates `src/aws-exports.js` with the new values!

Just start the frontend:

```bash
npm run dev
```

Visit: http://localhost:5173/

That's it! No manual configuration needed.

## Manual CDK Commands

If you need more control:

```bash
cd infra

# List stacks
npx cdk list

# Show changes
npx cdk diff

# Deploy with approval
npx cdk deploy

# Destroy with confirmation
npx cdk destroy
```

## Troubleshooting

### Check AWS credentials
```bash
aws sts get-caller-identity
```

### Verify deployed resources
```bash
# List tables
aws dynamodb list-tables --region us-east-1

# Check table capacity
aws dynamodb describe-table --table-name UserSecurity --region us-east-1

# List Lambda functions
aws lambda list-functions --region us-east-1 --query 'Functions[?contains(FunctionName, `InfraStack`)].FunctionName'
```

### Manual cleanup
```bash
# Delete stack via CloudFormation
aws cloudformation delete-stack --stack-name InfraStack --region us-east-1

# Wait for deletion
aws cloudformation wait stack-delete-complete --stack-name InfraStack --region us-east-1
```

## Cost Monitoring

Even with free tier optimization, monitor your usage:

```bash
# Check DynamoDB consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=UserSecurity \
  --start-time 2026-02-01T00:00:00Z \
  --end-time 2026-02-28T23:59:59Z \
  --period 86400 \
  --statistics Sum \
  --region us-east-1
```

## Free Tier Limits

Your stack uses:
- **DynamoDB**: 6 RCU + 6 WCU (out of 25 free)
- **Lambda**: 9 functions @ 128MB (1M requests free)
- **API Gateway**: 1 API (1M calls free for 12 months)
- **Cognito**: 1 user pool (50,000 MAUs free)
- **CloudWatch Logs**: Lambda logs (5 GB free)

## Production Considerations

For production, consider upgrading:
1. DynamoDB to PAY_PER_REQUEST or higher provisioned capacity
2. Lambda memory to 256-512MB
3. Add KMS for encryption at rest
4. Use Secrets Manager for sensitive config
5. Enable CloudWatch detailed monitoring
6. Set up alarms for throttling and errors

Estimated production cost: $5-10/month for low traffic
