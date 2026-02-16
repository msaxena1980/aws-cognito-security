#!/usr/bin/env node

/**
 * Create/Deploy AWS Infrastructure
 * 
 * This script orchestrates the complete deployment process:
 * 1. Deploys the CDK stack (defined in stack.js)
 * 2. Fetches stack outputs from CloudFormation
 * 3. Auto-updates frontend configuration (src/aws-exports.js)
 * 4. Displays deployment summary
 * 
 * Usage:
 *   node create.js
 *   npm run create
 *   
 * Deployment Commands (executed automatically):
 *   1. npm install (in infra directory)
 *   2. npx cdk deploy --require-approval never --app "node stack.js"
 *   3. aws cloudformation describe-stacks --stack-name InfraStack --region us-east-1
 *   4. Updates src/aws-exports.js with new configuration
 * 
 * Environment Variables (optional):
 *   SES_SENDER_EMAIL - Verified email for SES (default: noreply@example.com)
 *   ENCRYPTION_KEY - Secret key for vault encryption
 * 
 * ============================================================================
 * INFRASTRUCTURE COMPONENTS (defined in stack.js)
 * ============================================================================
 * 
 * 1. COGNITO USER POOL
 *    - Email-based sign-in (case-insensitive)
 *    - Optional TOTP MFA (no SMS in sandbox)
 *    - Email verification
 *    - Password policy: min 8 chars, requires lowercase/uppercase/digits/symbols
 *    - Account recovery: EMAIL_AND_PHONE_WITHOUT_MFA
 *    - Advanced security: OFF (free tier)
 * 
 * 2. DYNAMODB TABLES (Provisioned 1 RCU/WCU each)
 *    a) UserSecurity
 *       - pk: 'USER#<sub>', sk: 'PROFILE' | 'VAULT' | 'PASSPHRASE' | 'PHONE_CHANGE'
 *       - GSI: EmailIndex (email → user lookup)
 *       - Stores: user profiles, vault metadata, encrypted passphrases
 * 
 *    b) EmailMapping
 *       - pk: email (normalized/lowercase)
 *       - Attributes: sub, createdAt, updatedAt
 *       - GSI: SubIndex (reverse lookup for email changes)
 *       - Purpose: Stable email-to-sub mapping (solves email GSI issues)
 * 
 *    c) DeviceTracking
 *       - pk: userSub, sk: deviceId
 *       - Attributes: deviceType, fingerprint, firstSeen, lastLogin, lastIp, isTrusted
 *       - GSI: LastLoginIndex (query recent logins)
 *       - Purpose: Isolated device history (prevents hot partitions)
 * 
 *    d) Passkeys
 *       - pk: userSub, sk: credentialId
 *       - Attributes: publicKey, deviceId, deviceName, email, counter, createdAt, lastUsed
 *       - GSI: DeviceIdIndex (device-based lookups)
 *       - Purpose: WebAuthn passkey credentials for passwordless authentication
 * 
 * 3. KMS KEY
 *    - For vault/passphrase encryption
 *    - Key rotation enabled
 *    - Scoped per-user with encryption context
 * 
 * 4. LAMBDA FUNCTIONS (128MB, Node.js 20.x)
 *    
 *    Cognito Triggers:
 *    - preSignUp.js (3s timeout)
 *      → Pre-signup validation/normalization
 *      → Permissions: UserSecurity read/write
 * 
 *    - postConfirmation.js (3s timeout)
 *      → Creates initial user profile in UserSecurity
 *      → Creates email mapping in EmailMapping
 *      → Permissions: UserSecurity + EmailMapping read/write
 * 
 *    - postAuthentication.js (5s timeout)
 *      → Device tracking (new device detection)
 *      → Profile sync (lastGlobalLogin, email update)
 *      → Security alerts via SES (new device)
 *      → Permissions: UserSecurity + DeviceTracking read/write, SES send
 * 
 *    API Handlers:
 *    - hello.js (3s timeout)
 *      → Test endpoint (authenticated)
 *      → Permissions: UserSecurity read/write
 * 
 *    - getAuthMethods.js (3s timeout)
 *      → Public endpoint: GET /auth-methods?email=<email>
 *      → Returns available auth methods for email
 *      → Checks: EmailMapping → UserSecurity → Cognito
 *      → Permissions: UserSecurity + EmailMapping read, Cognito ListUsers
 * 
 *    - vault.js (5s timeout)
 *      → GET/PUT /vault - encrypted vault data
 *      → GET/POST /vault/passphrase - KMS-encrypted passphrase
 *      → POST /vault/passphrase/verify - verify passphrase
 *      → Permissions: UserSecurity read/write, KMS encrypt/decrypt
 * 
 *    - account.js (5s timeout)
 *      → POST /account/delete/complete - full account deletion
 *      → Verifies passphrase, deletes all DynamoDB items, deletes Cognito user
 *      → Permissions: UserSecurity read/write, KMS decrypt, Cognito AdminDeleteUser, SES send
 * 
 *    - profile.js (3s timeout)
 *      → GET/PUT /profile - user profile management
 *      → Permissions: UserSecurity read/write
 * 
 *    - phone.js (5s timeout)
 *      → POST /profile/phone/start - initiate phone change
 *      → POST /profile/phone/verify-old - verify old phone code
 *      → POST /profile/phone/verify-new - verify new phone code
 *      → Permissions: UserSecurity read/write, Cognito AdminUpdateUserAttributes, SES send
 * 
 *    - emailChange.js (5s timeout)
 *      → POST /profile/email/start - initiate email change
 *      → POST /profile/email/verify-old - verify old email code
 *      → POST /profile/email/verify-new - verify new email code
 *      → Permissions: UserSecurity read/write, Cognito AdminUpdateUserAttributes, SES send
 * 
 *    - verifyCredentials.js (5s timeout)
 *      → POST /verify-credentials - verify password + optional TOTP
 *      → Used for 2FA disable flow (no new session created)
 *      → Permissions: Cognito InitiateAuth + RespondToAuthChallenge
 * 
 *    - passkey.js (5s timeout)
 *      → POST /passkey/register-options - generate passkey registration challenge
 *      → POST /passkey/register - complete passkey registration
 *      → POST /passkey/authenticate-options - generate authentication challenge
 *      → POST /passkey/authenticate - complete passkey authentication
 *      → GET /passkey/list - list user's passkeys
 *      → POST /passkey/delete - delete a passkey
 *      → Permissions: Passkeys table read/write, Cognito AdminInitiateAuth
 * 
 * 5. API GATEWAY
 *    - REST API with Cognito authorizer
 *    - CORS: Allow all origins (configurable for production)
 *    - Throttling: 100 req/s rate, 200 burst
 *    - Gateway responses: 4xx/5xx with CORS headers
 * 
 *    Routes:
 *    - GET /hello (auth)
 *    - GET /auth-methods (public)
 *    - GET/PUT /vault (auth)
 *    - GET/POST /vault/passphrase (auth)
 *    - POST /vault/passphrase/verify (auth)
 *    - POST /account/delete/start (auth) - currently returns 410
 *    - POST /account/delete/verify (auth) - currently returns 410
 *    - POST /account/delete/complete (auth)
 *    - GET/PUT /profile (auth)
 *    - POST /profile/phone/start (auth)
 *    - POST /profile/phone/verify-old (auth)
 *    - POST /profile/phone/verify-new (auth)
 *    - POST /profile/email/start (auth)
 *    - POST /profile/email/verify-old (auth)
 *    - POST /profile/email/verify-new (auth)
 *    - POST /verify-credentials (public)
 *    - POST /passkey/register-options (auth)
 *    - POST /passkey/register (auth)
 *    - POST /passkey/authenticate-options (public)
 *    - POST /passkey/authenticate (public)
 *    - GET /passkey/list (auth)
 *    - POST /passkey/delete (auth)
 * 
 * ============================================================================
 * UTILITY MODULES (lambda/utils/)
 * ============================================================================
 * 
 * Ready-to-use utilities for Lambda functions:
 * - validation.js - Email, phone, passphrase, device ID validation
 * - errors.js - Standardized error responses with proper HTTP codes
 * - logger.js - Structured JSON logging for CloudWatch Logs Insights
 * - secrets.js - AWS Secrets Manager integration with caching
 * 
 * Example usage in Lambda:
 *   import { validateEmail } from './utils/validation.js';
 *   import { CommonErrors, withErrorHandling } from './utils/errors.js';
 *   import { createLogger, logRequest } from './utils/logger.js';
 * 
 * ============================================================================
 * FREE TIER COSTS
 * ============================================================================
 * 
 * - Cognito: 50,000 MAUs free
 * - DynamoDB: 25 RCU/WCU free (using 8 RCU + 8 WCU with Passkeys table)
 * - Lambda: 1M requests + 400,000 GB-seconds free
 * - API Gateway: 1M requests free (first 12 months)
 * - KMS: 20,000 requests free
 * - CloudWatch Logs: 5 GB free
 * 
 * Total Cost: $0/month (within AWS Free Tier)
 * 
 * ============================================================================
 * RELATED FILES
 * ============================================================================
 * 
 * - stack.js - Complete CDK infrastructure definition
 * - destroy.js - Destroy the stack with confirmation
 * - lambda/ - All Lambda function code
 * - tests/ - Lambda function tests (Jest + aws-sdk-client-mock)
 * - ../docs/aws-cognito-implementation-plan.md - Complete documentation
 * - ../INFRASTRUCTURE.md - Infrastructure overview
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const INFRA_DIR = __dirname;

console.log('\n🚀 Deploying AWS Infrastructure...\n');

try {
  // Deploy the stack
  console.log('Running: npx cdk deploy --require-approval never --app "node stack.js"\n');
  execSync('npx cdk deploy --require-approval never --app "node stack.js"', {
    stdio: 'inherit',
    cwd: INFRA_DIR,
  });

  console.log('\n✅ Deployment complete!\n');

  // Get stack outputs
  console.log('Fetching stack outputs...');
  const outputs = execSync(
    'aws cloudformation describe-stacks --stack-name InfraStack --region us-east-1 --query "Stacks[0].Outputs" --output json',
    { encoding: 'utf-8', cwd: INFRA_DIR }
  );

  const outputsArray = JSON.parse(outputs);
  const outputsObj = {
    InfraStack: {}
  };

  outputsArray.forEach(output => {
    outputsObj.InfraStack[output.OutputKey] = output.OutputValue;
  });

  // Save outputs.json
  const outputsPath = join(INFRA_DIR, 'outputs.json');
  writeFileSync(outputsPath, JSON.stringify(outputsObj, null, 2));
  console.log('📄 Stack outputs saved to infra/outputs.json');

  // Extract values
  const userPoolId = outputsObj.InfraStack.UserPoolId;
  const clientId = outputsObj.InfraStack.UserPoolClientId;
  const apiUrl = outputsObj.InfraStack.ApiUrl;
  const region = outputsObj.InfraStack.Region || 'us-east-1';

  console.log('\n📝 Updating src/aws-exports.js...');

  // Generate aws-exports.js content
  const awsExportsContent = `const awsmobile = {
    "aws_project_region": "${region}",
    "aws_cognito_region": "${region}",
    "aws_user_pools_id": "${userPoolId}",
    "aws_user_pools_web_client_id": "${clientId}",
    "oauth": {},
    "aws_cognito_username_attributes": [
        "EMAIL"
    ],
    "aws_cognito_social_providers": [],
    "aws_cognito_signup_attributes": [
        "EMAIL"
    ],
    "aws_cognito_mfa_configuration": "OFF",
    "aws_cognito_mfa_types": [],
    "aws_cognito_password_protection_settings": {
        "passwordPolicyMinLength": 8,
        "passwordPolicyCharacters": [
            "REQUIRES_LOWERCASE",
            "REQUIRES_UPPERCASE",
            "REQUIRES_NUMBERS",
            "REQUIRES_SYMBOLS"
        ]
    },
    "aws_cognito_verification_mechanisms": [
        "EMAIL"
    ],
    "aws_cloud_logic_custom": [
        {
            "name": "AuthApi",
            "endpoint": "${apiUrl.replace(/\/$/, '')}",
            "region": "${region}"
        }
    ]
};

export default awsmobile;
`;

  // Write to src/aws-exports.js
  const awsExportsPath = join(ROOT_DIR, 'src', 'aws-exports.js');
  writeFileSync(awsExportsPath, awsExportsContent);
  console.log('✅ Updated src/aws-exports.js with new values\n');

  // Display summary
  console.log('📊 Deployment Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Region:        ${region}`);
  console.log(`User Pool:     ${userPoolId}`);
  console.log(`Client ID:     ${clientId}`);
  console.log(`API Endpoint:  ${apiUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('✨ All done! Your infrastructure is ready.\n');
  console.log('💡 Next steps:');
  console.log('1. Run: npm run dev');
  console.log('2. Visit: http://localhost:5173/');
  console.log('3. Test signup/login\n');

} catch (error) {
  console.error('\n❌ Deployment failed:', error.message);
  process.exit(1);
}
