#!/usr/bin/env node

/**
 * Destroy AWS Infrastructure
 * Simple script to destroy the CDK stack
 */

import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFRA_DIR = __dirname;

function ask(question) {
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim().toLowerCase());
    });
  });
}

async function main() {
  console.log('\n⚠️  Destroy AWS Infrastructure\n');
  console.log('This will delete:');
  console.log('  - Cognito User Pool');
  console.log('  - 3 DynamoDB Tables (UserSecurity, EmailMapping, DeviceTracking)');
  console.log('  - 9 Lambda Functions');
  console.log('  - API Gateway');
  console.log('  - All associated IAM roles and policies\n');

  const confirm = await ask('Are you sure you want to destroy everything? Type "yes" to confirm: ');
  
  if (confirm !== 'yes') {
    console.log('\n❌ Destroy cancelled.\n');
    process.exit(0);
  }

  console.log('\n🗑️  Destroying stack...\n');

  try {
    execSync('npx cdk destroy --force --app "node stack.js"', {
      stdio: 'inherit',
      cwd: INFRA_DIR,
    });

    console.log('\n✅ Stack destroyed successfully!\n');

  } catch (error) {
    console.error('\n❌ Destroy failed:', error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
