import { execSync } from 'child_process';

export function recreateCognito(arn, region, infraRoot) {
  const name = arn.split('/')[1];
  console.log(`[Cognito Module] Starting recreation of user pool: ${name} in ${region}...`);
  try {
    execSync(`aws cognito-idp create-user-pool --pool-name ${name} --region ${region}`, { stdio: 'inherit', cwd: infraRoot });
    console.log(`[Cognito Module] Successfully recreated user pool: ${name}`);
  } catch (e) {
    console.error(`[Cognito Module] Error recreating user pool ${name}: ${e.message}`);
    throw e;
  }
}
