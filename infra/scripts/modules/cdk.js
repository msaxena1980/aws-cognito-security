import { execSync } from 'child_process';

export function deployCDK(stacks, infraRoot) {
  if (!stacks || stacks.length === 0) return;
  console.log(`[CDK Module] Starting deployment of stacks: ${stacks.join(', ')}...`);
  try {
    execSync(`npx cdk deploy ${stacks.join(' ')} --require-approval never`, {
      stdio: 'inherit',
      cwd: infraRoot,
    });
    console.log(`[CDK Module] Successfully deployed stacks: ${stacks.join(', ')}`);
  } catch (e) {
    console.error(`[CDK Module] Error during CDK deployment: ${e.message}`);
    throw e;
  }
}
