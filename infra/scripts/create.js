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
  console.log('\n--- Infra: Create/Recreate ---\n');

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

  const stacks = stackList.split('\n').filter(Boolean).map((s) => s.trim());
  
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

  // 2) Parse discovered and deleted resources for reference
  console.log('\n[Step 2] Parsing existing and deleted resources from state...');
  const createJsPath = join(__dirname, 'create.js');
  const createJsContent = readFileSync(createJsPath, 'utf-8');
  
  const discoveredLines = createJsContent.split('\n')
    .filter(line => line.trim().startsWith('// [') && line.includes('] arn:aws:') && !line.includes('DELETED'));

  const deletedLines = createJsContent.split('\n')
    .filter((line, i, arr) => {
      const isResource = line.trim().startsWith('// [') && line.includes('] arn:aws:');
      if (!isResource) return false;
      // Check if it's inside the deleted block
      let inDeletedBlock = false;
      for (let j = i; j >= 0; j--) {
        if (arr[j].includes('DELETED RESOURCES START')) { inDeletedBlock = true; break; }
        if (arr[j].includes('DELETED RESOURCES END')) break;
      }
      return inDeletedBlock;
    });

  const deletedResources = deletedLines.map(line => {
    const match = line.match(/\/\/ \[(.*?)\] (.*)/);
    return match ? { region: match[1], arn: match[2] } : null;
  }).filter(Boolean);

  if (discoveredLines.length > 0) {
    console.log('\n--- Discovered Existing Resources (Reference) ---');
    discoveredLines.forEach(line => console.log(line.replace('// ', '  ')));
  }

  if (deletedResources.length > 0) {
    console.log('\n--- Previously Deleted Resources (Available to Recreate) ---');
    deletedResources.forEach((r, i) => {
      console.log(`  R${i + 1}. [${r.region}] ${r.arn}`);
    });
  }

  console.log('\nNote: This script manages the project CDK infrastructure.');
  console.log('To recreate a stack or a previously deleted resource, select it from the list.\n');

  // 3) Automatically determine what needs to be created
  const stacksToDeploy = stacks.filter(s => stackStatus[s] !== 'Already Available');
  const resourcesToRecreate = deletedResources;

  if (stacksToDeploy.length === 0 && resourcesToRecreate.length === 0) {
    console.log('\nAll resources are already available. Nothing to create.');
    process.exit(0);
  }

  console.log('\n--- Automatic Creation Plan ---');
  if (stacksToDeploy.length > 0) {
    console.log('Stacks to Deploy/Update:');
    stacksToDeploy.forEach(s => console.log(`  - [${stackStatus[s]}] ${s}`));
  }
  if (resourcesToRecreate.length > 0) {
    console.log('Resources to Recreate:');
    resourcesToRecreate.forEach(r => console.log(`  - [Deleted] ${r.arn}`));
  }

  // 4) Confirm and Execute
  const confirm = await ask('\nProceed with automatic creation? (yes/no): ');
  if (confirm !== 'yes' && confirm !== 'y') {
    console.log('Cancelled.');
    process.exit(0);
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
    // Note: list.js was deleted and merged into destroy.js
    execSync('node scripts/destroy.js --list-only', { cwd: INFRA_ROOT });
  } catch (e) {
    // If list-only is not implemented, just run the full destroy which will scan anyway
    console.log('Scan refresh skipped or redirected to destroy script.');
  }

  console.log('\nAutomatic creation complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
