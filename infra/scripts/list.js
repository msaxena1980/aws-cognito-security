#!/usr/bin/env node

/**
 * 2) List all created infra on console.
 * - Lists CDK stacks and their CloudFormation resources.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = join(__dirname, '..');

function run(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: INFRA_ROOT,
    ...options,
  });
}

async function main() {
  console.log('\n--- Infra: List deployed resources ---\n');

  // 1) List stack names from CDK app
  let stackList = '';
  try {
    stackList = run('npx cdk list');
  } catch (e) {
    console.error('Could not list CDK stacks. Run from infra/ and ensure "npm install" was done.');
    process.exit(1);
  }

  const stackNames = stackList.split('\n').filter(Boolean).map((s) => s.trim());
  if (stackNames.length === 0) {
    console.log('No stacks defined in this app.');
    process.exit(0);
  }

  // 2) For each stack, try to get CloudFormation stack name (physical) and list resources
  // CDK stack name in app is logical; deployed stack name is usually "InfraStack" or with qualifier
  const listOutput = run('npx cdk list --long', { encoding: 'utf-8' });
  console.log('Stacks in this app:');
  console.log(listOutput);

  // List deployed stacks via AWS CLI (if available) for current account/region
  try {
    const describe = execSync(
      'aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[*].[StackName,StackStatus,CreationTime]" --output text 2>/dev/null || true',
      { encoding: 'utf-8', cwd: INFRA_ROOT }
    );
    if (describe && describe.trim()) {
      console.log('--- Deployed CloudFormation stacks (this account/region) ---');
      const lines = describe.trim().split('\n');
      for (const line of lines) {
        const [name, status, time] = line.split(/\t/);
        if (name) console.log(`  ${name}\t${status || ''}\t${time || ''}`);
      }
    }
  } catch (_) {
    // AWS CLI not configured or no permission – rely on cdk list only
  }

  console.log('\nTip: Deploy first with "npm run create", then run "npm run list" again to see deployed stack resources.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
