#!/usr/bin/env node

/**
 * Create/Deploy AWS Infrastructure
 * Simple script to deploy the CDK stack and auto-update frontend config
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

console.log('\n🚀 Deploying AWS Infrastructure...\n');

try {
  // Deploy the stack
  console.log('Running: npx cdk deploy --require-approval never --app "node stack.js"\n');
  execSync('npx cdk deploy --require-approval never --app "node stack.js"', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  console.log('\n✅ Deployment complete!\n');

  // Get stack outputs
  console.log('Fetching stack outputs...');
  const outputs = execSync(
    'aws cloudformation describe-stacks --stack-name InfraStack --region us-east-1 --query "Stacks[0].Outputs" --output json',
    { encoding: 'utf-8' }
  );

  const outputsArray = JSON.parse(outputs);
  const outputsObj = {
    InfraStack: {}
  };

  outputsArray.forEach(output => {
    outputsObj.InfraStack[output.OutputKey] = output.OutputValue;
  });

  // Save outputs.json
  writeFileSync('outputs.json', JSON.stringify(outputsObj, null, 2));
  console.log('📄 Stack outputs saved to outputs.json');

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
