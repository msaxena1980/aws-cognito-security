#!/usr/bin/env node

/**
 * Destroy with Environment Configuration
 * Usage: npm run destroy:dev | destroy:test | destroy:prod
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get environment from command line
const env = process.argv[2] || 'dev';
const validEnvs = ['dev', 'prod'];

if (!validEnvs.includes(env)) {
  console.error(`❌ Invalid environment: ${env}`);
  console.error(`   Valid options: ${validEnvs.join(', ')}`);
  process.exit(1);
}

// Load environment configuration
const configPath = join(__dirname, '..', 'config', `${env}.env`);

if (!existsSync(configPath)) {
  console.error(`❌ Configuration file not found: ${configPath}`);
  process.exit(1);
}

console.log(`🗑️  Destroying ${env.toUpperCase()} environment`);
console.log('');

// Parse .env file
const envConfig = {};
const envFile = readFileSync(configPath, 'utf-8');
envFile.split('\n').forEach(line => {
  line = line.trim();
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=').trim();
    if (key && value !== undefined) {
      envConfig[key.trim()] = value;
    }
  }
});

// Production safety check
if (env === 'prod') {
  console.log('⚠️  WARNING: PRODUCTION ENVIRONMENT');
  console.log('');
  console.log('This will destroy:');
  console.log('  - Cognito User Pool (all users will be deleted)');
  console.log('  - DynamoDB tables (all data will be lost)');
  console.log('  - Lambda functions');
  console.log('  - API Gateway');
  console.log('  - All user data and configurations');
  console.log('');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('Type "destroy-production" to confirm: ', resolve);
  });
  
  rl.close();
  
  if (answer !== 'destroy-production') {
    console.log('❌ Destruction cancelled');
    process.exit(0);
  }
}

console.log('🏗️  Starting CDK destroy...');
console.log('');

// Run CDK destroy with environment variables
const cdkProcess = spawn('node', ['destroy.js'], {
  cwd: join(__dirname, '..'),
  env: {
    ...process.env,
    ...envConfig,
    DEPLOYMENT_ENV: env
  },
  stdio: 'inherit',
  shell: true
});

cdkProcess.on('close', (code) => {
  if (code === 0) {
    console.log('');
    console.log('✅ Destruction complete!');
  } else {
    console.error('');
    console.error('❌ Destruction failed with code:', code);
    process.exit(code);
  }
});
