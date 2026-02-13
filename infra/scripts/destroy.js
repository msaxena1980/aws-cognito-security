#!/usr/bin/env node

/**
 * 3) Remove infra on demand.
 * - Lists what will be destroyed.
 * - Asks for confirmation.
 * - Completely removes the stack(s) from AWS (cdk destroy).
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
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
  console.log('\n--- Infra: Scanning all AWS regions and services ---\n');

  // 1) Get all regions
  console.log('[Step 1] Fetching all AWS regions...');
  const regions = run('aws ec2 describe-regions --region us-east-1 --query "Regions[].RegionName" --output text')
    .trim()
    .split(/\s+/);

  console.log(`[Step 1] Scanning ${regions.length} regions...`);

  const discoveredResources = [];

  for (const region of regions) {
    process.stdout.write(`  Scanning ${region}... `);
    try {
      const resourcesJson = run(`aws resourcegroupstaggingapi get-resources --region ${region} --output json`);
      const resources = JSON.parse(resourcesJson).ResourceTagMappingList;
      if (resources && resources.length > 0) {
        console.log(`found ${resources.length} resources`);
        resources.forEach(r => {
          discoveredResources.push({
            region,
            arn: r.ResourceARN,
            tags: r.Tags
          });
        });
      } else {
        console.log('0 resources');
      }
    } catch (e) {
      console.log('failed (skipping)');
    }
  }

  // 2) List CDK stacks
  console.log('\n[Step 2] Listing project CDK stacks...');
  let cdkStacks = [];
  try {
    const stackList = run('npx cdk list');
    cdkStacks = stackList.split('\n').filter(Boolean).map((s) => s.trim());
    console.log(`[Step 2] Found ${cdkStacks.length} stacks.`);
  } catch (e) {
    console.warn('[Step 2] Warning: Could not list CDK stacks.');
  }

  console.log('\n--- Available resources to destroy ---\n');
  let index = 1;

  if (discoveredResources.length > 0) {
    console.log('Existing AWS Resources:');
    discoveredResources.forEach(r => {
      console.log(`${index++}. [${r.region}] ${r.arn}`);
    });
  }

  if (cdkStacks.length > 0) {
    console.log('\nProject CDK Stacks:');
    cdkStacks.forEach(s => {
      console.log(`${index++}. [Stack] ${s}`);
    });
  }

  if (index === 1) {
    console.log('No resources found.');
    process.exit(0);
  }

  // Support for --list-only flag used by create.js
  if (process.argv.includes('--list-only')) {
    console.log('\nScan refresh complete (list-only mode).');
    process.exit(0);
  }

  // 3) Ask which ones to destroy
  const selection = await ask('\nEnter the numbers of resources to destroy (e.g., 1,3,4) or "all": ');
  
  let targets = [];
  if (selection === 'all') {
    targets = [
      ...discoveredResources.map(r => ({ type: 'aws', ...r })), 
      ...cdkStacks.map(s => ({ type: 'cdk', name: s }))
    ];
  } else {
    const nums = selection.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0 && n < index);
    nums.forEach(n => {
      if (n <= discoveredResources.length) {
        targets.push({ type: 'aws', ...discoveredResources[n - 1] });
      } else {
        targets.push({ type: 'cdk', name: cdkStacks[n - discoveredResources.length - 1] });
      }
    });
  }

  if (targets.length === 0) {
    console.log('No valid selection made.');
    process.exit(0);
  }

  console.log('\n--- Destruction Plan ---');
  targets.forEach(t => {
    if (t.type === 'aws') console.log(`  - [AWS] ${t.arn}`);
    else console.log(`  - [CDK Stack] ${t.name}`);
  });

  const confirm = await ask('\nAre you absolutely sure? Type "yes" to proceed: ');
  if (confirm !== 'yes') {
    console.log('Destroy cancelled.');
    process.exit(0);
  }

  // 4) Execute destruction
  const successfullyDeleted = [];

  for (const t of targets) {
    let success = false;
    if (t.type === 'aws') {
      console.log(`\n--- Deleting ${t.arn} in ${t.region} ---`);
      try {
        if (t.arn.includes(':s3:::')) {
          const bucket = t.arn.split(':::')[1];
          run(`aws s3 rb s3://${bucket} --force --region ${t.region}`, { stdio: 'inherit' });
          success = true;
        } else if (t.arn.includes(':cloudformation:')) {
          const stackName = t.arn.split('/')[1];
          run(`aws cloudformation delete-stack --stack-name ${stackName} --region ${t.region}`, { stdio: 'inherit' });
          success = true;
        } else if (t.arn.includes(':cognito-idp:')) {
          const poolId = t.arn.split('/')[1];
          run(`aws cognito-idp delete-user-pool --user-pool-id ${poolId} --region ${t.region}`, { stdio: 'inherit' });
          success = true;
        } else {
          console.log(`Manual deletion required for resource type: ${t.arn}`);
        }
      } catch (e) {
        console.error(`Failed to delete ${t.arn}: ${e.message}`);
      }
    } else {
      console.log(`\n--- Destroying CDK Stack: ${t.name} ---`);
      try {
        execSync(`npx cdk destroy ${t.name} --force`, { stdio: 'inherit', cwd: INFRA_ROOT });
        success = true;
      } catch (e) {
        console.error(`Failed to destroy stack ${t.name}`);
      }
    }

    if (success) successfullyDeleted.push(t);
  }

  // 5) Update create.js state
  const createJsPath = join(__dirname, 'create.js');
  if (successfullyDeleted.length > 0) {
    console.log('\nUpdating resource list in create.js...');
    let currentContent = readFileSync(createJsPath, 'utf8');
    
    const deletedMarker = '// --- DELETED RESOURCES START ---';
    const deletedEndMarker = '// --- DELETED RESOURCES END ---';
    
    for (const item of successfullyDeleted) {
      if (item.type === 'aws') {
        const regex = new RegExp(`// \\[${item.region}\\] ${item.arn}.*\\n?`, 'g');
        currentContent = currentContent.replace(regex, '');
        
        const deletedLine = `// [${item.region}] ${item.arn}\n`;
        if (currentContent.includes(deletedMarker)) {
          currentContent = currentContent.replace(deletedMarker, `${deletedMarker}\n${deletedLine}`);
        } else {
          currentContent = currentContent.replace('// --- DISCOVERED RESOURCES START ---', `${deletedMarker}\n${deletedLine}${deletedEndMarker}\n\n// --- DISCOVERED RESOURCES START ---`);
        }
      }
    }
    
    writeFileSync(createJsPath, currentContent);
    console.log('Resource list updated.');
  }

  console.log('\nCleanup complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
