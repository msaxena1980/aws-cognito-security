import { execSync } from 'child_process';

export function recreateDynamoDB(arn, region, infraRoot) {
  const tableName = arn.split('/')[1];
  console.log(`\n--- [DynamoDB Module] Manual recreation required for table: ${tableName} ---`);
  // Placeholder for CLI command if needed
}

export function recreateAPIGateway(arn, region, infraRoot) {
  const apiId = arn.split('/')[2];
  console.log(`\n--- [API Gateway Module] Manual recreation required for API: ${apiId} ---`);
}

export function recreateLambda(arn, region, infraRoot) {
  const functionName = arn.split(':').pop();
  console.log(`\n--- [Lambda Module] Manual recreation required for function: ${functionName} ---`);
}

export function recreateIAM(arn, region, infraRoot) {
  const roleName = arn.split('/').pop();
  console.log(`\n--- [IAM Module] Manual recreation required for role: ${roleName} ---`);
}
