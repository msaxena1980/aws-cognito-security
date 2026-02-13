#!/usr/bin/env node

/**
 * 1) Create required infra.
 * - Shows what will be created (cdk diff / synth summary).
 * - Asks for permission before creation.
 * - Then runs cdk deploy.
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

function runAllowFailure(cmd) {
  const r = spawnSync(cmd, [], {
    encoding: 'utf-8',
    cwd: INFRA_ROOT,
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
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
  console.log('\n--- Infra: Create (with confirmation) ---\n');

  // 1) List stacks that would be deployed
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

  console.log('Stacks that will be created/updated:');
  stacks.forEach((s) => console.log('  -', s));
  console.log('');

  // 2) Show diff (what will change)
  console.log('--- What will be created/changed (cdk diff) ---\n');
  const diffResult = runAllowFailure('npx cdk diff');
  if (diffResult.stdout) process.stdout.write(diffResult.stdout);
  if (diffResult.stderr) process.stderr.write(diffResult.stderr);
  console.log('');

  // 3) Ask permission
  const answer = await ask('Proceed with creation? (yes/no): ');
  if (answer !== 'yes' && answer !== 'y') {
    console.log('Creation cancelled.');
    process.exit(0);
  }

  // 4) Deploy
  console.log('\n--- Deploying ---\n');
  try {
    execSync('npx cdk deploy --require-approval never', {
      stdio: 'inherit',
      cwd: INFRA_ROOT,
    });
  } catch (e) {
    process.exit(e.status ?? 1);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
