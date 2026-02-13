#!/usr/bin/env node

/**
 * 3) Remove infra on demand.
 * - Lists what will be destroyed.
 * - Asks for confirmation.
 * - Completely removes the stack(s) from AWS (cdk destroy).
 */

import { execSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = join(__dirname, '..');

function run(cmd, options = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: INFRA_ROOT,
    ...options,
  });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim().toLowerCase());
    });
  });
}

async function main() {
  console.log('\n--- Infra: Destroy (remove from AWS) ---\n');

  // 1) List stacks that would be destroyed
  let stackList = '';
  try {
    stackList = run('npx cdk list');
  } catch (e) {
    console.error('Could not list CDK stacks. Run from infra/ and ensure "npm install" was done.');
    process.exit(1);
  }

  const stacks = stackList.split('\n').filter(Boolean).map((s) => s.trim());
  if (stacks.length === 0) {
    console.log('No stacks defined in this app.');
    process.exit(0);
  }

  console.log('The following stack(s) will be completely removed from AWS:');
  stacks.forEach((s) => console.log('  -', s));
  console.log('\nThis will delete all resources in the stack (CloudFormation stack and its contents).\n');

  // 2) Ask confirmation
  const answer = await ask('Type "yes" to proceed with removal: ');
  if (answer !== 'yes') {
    console.log('Destroy cancelled.');
    process.exit(0);
  }

  // 3) Destroy
  console.log('\n--- Destroying stack(s) ---\n');
  try {
    execSync('npx cdk destroy --force', {
      stdio: 'inherit',
      cwd: INFRA_ROOT,
    });
  } catch (e) {
    process.exit(e.status ?? 1);
  }

  console.log('\nInfra removed from AWS.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
