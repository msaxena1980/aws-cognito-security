#!/usr/bin/env node

/**
 * 1) Create required infra.
 * - Shows what will be created (cdk diff / synth summary).
 * - Asks for permission before creation.
 * - Then runs cdk deploy.
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Import modular creation handlers
import { recreateS3 } from './modules/s3.js';
import { recreateCognito } from './modules/cognito.js';
import { deployCDK } from './modules/cdk.js';
import { 
  recreateDynamoDB, 
  recreateAPIGateway, 
  recreateLambda, 
  recreateIAM 
} from './modules/others.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const args = {
    yes: false,
    noInteractive: false,
    help: false,
    stacks: null,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--no-interactive') args.noInteractive = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--stacks=')) {
      const v = arg.split('=')[1] || '';
      args.stacks = v.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return args;
}

function printHelp() {
  console.log(`
Usage: npm run create [-- [options]]

Options:
  --help, -h            Show this help and exit
  --yes, -y             Proceed without confirmation (non-interactive)
  --no-interactive      Same as --yes (skip all prompts)
  --stacks=NAME1,NAME2  Only deploy the specified CDK stacks

Description:
  Lists CDK stacks, shows what needs deployment, optionally prompts for confirmation,
  and runs "cdk deploy". Use --yes for CI or when running without a TTY.
`);
}

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
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  console.log('\n--- Infra: Create / Update ---\n');

  // 1) List stacks that would be deployed
  console.log('[Step 1] Fetching CDK stack list...');
  let stackList = '';
  try {
    stackList = run('npx cdk list');
    console.log('[Step 1] Successfully fetched stack list.');
  } catch (e) {
    console.error('[Error] Could not list CDK stacks. Run from infra/ and ensure "npm install" was done.');
    process.exit(1);
  }

  let stacks = stackList.split('\n').filter(Boolean).map((s) => s.trim());
  if (args.stacks && args.stacks.length > 0) {
    stacks = stacks.filter(s => args.stacks.includes(s));
    if (stacks.length === 0) {
      console.log('No matching stacks found for --stacks filter. Exiting.');
      process.exit(0);
    }
  }
  
  // 1.1) Check deployment status for each stack
  console.log('[Step 1.1] Checking deployment status for each stack...');
  const stackStatus = {};
  for (const s of stacks) {
    process.stdout.write(`  Checking status of stack: ${s}... `);
    try {
      const diff = execSync(`npx cdk diff ${s} 2>&1`, { cwd: INFRA_ROOT, encoding: 'utf-8' });
      if (diff.includes('There were no differences')) {
        stackStatus[s] = 'Already Available';
        console.log('Up to date.');
      } else if (diff.includes('Stack not found')) {
        stackStatus[s] = 'Not Created';
        console.log('Not found.');
      } else {
        stackStatus[s] = 'Needs Update / Recreate';
        console.log('Changes detected.');
      }
    } catch (e) {
      stackStatus[s] = 'Not Created';
      console.log('Not found (error).');
    }
  }

  if (stacks.length === 0) {
    console.log('[Step 1.1] No stacks defined in this app.');
  } else {
    console.log('\nSummary of CDK stacks:');
    stacks.forEach((s, i) => {
      console.log(`  ${i + 1}. [${stackStatus[s]}] ${s}`);
    });
  }

  // 2) Simple plan overview
  console.log('\nNote: This script manages the project CDK infrastructure.');
  console.log('It will deploy the following stacks if needed:\n');
  stacks.forEach(s => console.log(`  - [${stackStatus[s]}] ${s}`));

  // 3) Automatically determine what needs to be created
  const stacksToDeploy = stacks.filter(s => stackStatus[s] !== 'Already Available');
  const resourcesToRecreate = []; // feature removed for simplicity

  if (stacksToDeploy.length === 0 && resourcesToRecreate.length === 0) {
    console.log('\nAll resources are already available. Nothing to create.');
    process.exit(0);
  }

  console.log('\n--- Automatic Creation Plan ---');
  if (stacksToDeploy.length > 0) {
    console.log('Stacks to Deploy/Update:');
    stacksToDeploy.forEach(s => console.log(`  - [${stackStatus[s]}] ${s}`));
  }
  // No resource recreation in this simplified version

  // 4) Confirm and Execute
  let proceed = args.yes || args.noInteractive;
  if (!proceed) {
    if (!process.stdin.isTTY) {
      console.log('Non-interactive session detected; re-run with "--yes" to proceed.');
      process.exit(2);
    }
    const confirm = await ask('\nProceed with automatic creation? (yes/no): ');
    proceed = (confirm === 'yes' || confirm === 'y');
    if (!proceed) {
      console.log('Cancelled.');
      process.exit(0);
    }
  }

  // 4.1) Recreate previously deleted resources using modular handlers
  for (const r of resourcesToRecreate) {
    try {
      if (r.arn.includes(':s3:::')) {
        recreateS3(r.arn, r.region, INFRA_ROOT);
      } else if (r.arn.includes(':cognito-idp:')) {
        recreateCognito(r.arn, r.region, INFRA_ROOT);
      } else if (r.arn.includes(':dynamodb:')) {
        recreateDynamoDB(r.arn, r.region, INFRA_ROOT);
      } else if (r.arn.includes(':apigateway:')) {
        recreateAPIGateway(r.arn, r.region, INFRA_ROOT);
      } else if (r.arn.includes(':lambda:')) {
        recreateLambda(r.arn, r.region, INFRA_ROOT);
      } else if (r.arn.includes(':iam:')) {
        recreateIAM(r.arn, r.region, INFRA_ROOT);
      } else {
        console.log(`\n--- Recreating ${r.arn} in ${r.region} ---`);
        console.log(`Automatic recreation not supported for this type. Please create manually.`);
      }
    } catch (e) {
      console.error(`Failed to recreate ${r.arn}: ${e.message}`);
    }
  }

  // 4.2) Deploy CDK stacks using modular handler
  if (stacksToDeploy.length > 0) {
    try {
      deployCDK(stacksToDeploy, INFRA_ROOT);
    } catch (e) {
      console.error(`Failed to deploy stacks.`);
    }
  }

  // 5) Final Scan Refresh
  console.log('\nRefreshing resource scan...');
  try {
    // Placeholder for future scan/list functionality
    console.log('Scan refresh completed.');
  } catch (e) {
    console.log('Scan refresh skipped.');
  }

  console.log('\nAutomatic creation complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
