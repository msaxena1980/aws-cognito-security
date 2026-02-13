# Infra (CDK) – Step-by-step AWS resources

This folder is a basic CDK project at the same level as `docs/`. Resources (Cognito, Lambda, API Gateway, DynamoDB) will be added **step by step** in later changes.

## Prerequisites

- Node.js 18+
- AWS CLI configured (`aws configure`) with credentials that can create CloudFormation stacks
- One-time bootstrap in your account/region: `npx cdk bootstrap`

## Commands (run from `infra/`)

| Command | Description |
|--------|-------------|
| **`npm run create`** | **1) Create infra** – Shows what will be created (diff), asks for permission, then deploys. |
| **`npm run list`**   | **2) List infra** – Lists stacks in this app and (if AWS CLI is configured) deployed CloudFormation stacks. |
| **`npm run destroy`** | **3) Remove infra** – Asks for confirmation, then completely removes the stack(s) from AWS. |

## Usage

```bash
cd infra
npm install
npx cdk bootstrap   # once per account/region

# Create (with confirmation)
npm run create

# List what's deployed
npm run list

# Remove everything from AWS
npm run destroy
```

## Current stack

- **InfraStack** – Includes Cognito User Pool, DynamoDB (UserSecurity), Lambda Triggers, and API Gateway.
- **DynamoDB Table**: `UserSecurity` (Provisioned 5 RCU/WCU for Free Tier).
- **Cognito**: Advanced Security Mode is `OFF` to ensure Free Tier compliance.
