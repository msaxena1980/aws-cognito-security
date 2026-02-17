#!/usr/bin/env node

/**
 * Deploy with Environment Configuration
 * Usage: npm run deploy:dev | deploy:test | deploy:prod
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

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
  console.error(`   Create it from: config/.env.example`);
  process.exit(1);
}

console.log(`🚀 Deploying with ${env.toUpperCase()} configuration`);
console.log(`📄 Loading config from: config/${env}.env`);
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

// Display configuration
console.log('📋 Configuration:');
Object.entries(envConfig).forEach(([key, value]) => {
  if (key.includes('SECRET') || key.includes('PASSWORD')) {
    console.log(`   ${key}: ********`);
  } else {
    console.log(`   ${key}: ${value || '(empty)'}`);
  }
});
console.log('');

// Production safety check
if (env === 'prod') {
  console.log('⚠️  PRODUCTION DEPLOYMENT');
  console.log('');
  console.log('Before proceeding, ensure:');
  console.log('  ✓ SNS production access approved');
  console.log('  ✓ SNS spending limit configured');
  console.log('  ✓ CloudWatch cost alarms enabled');
  console.log('  ✓ SES sender email verified');
  console.log('  ✓ Tested in test environment');
  console.log('');
  
  // Check if DEV_SMS_MODE is empty (production mode)
  if (envConfig.DEV_SMS_MODE) {
    console.error('❌ ERROR: DEV_SMS_MODE should be empty for production');
    console.error('   Current value:', envConfig.DEV_SMS_MODE);
    console.error('   Edit config/prod.env and set: DEV_SMS_MODE=');
    process.exit(1);
  }
  
  console.log('💰 SMS costs will apply: ~$0.00645 per message');
  console.log('');
}

// Install Lambda dependencies if needed
console.log('📦 Checking Lambda dependencies...');
const lambdaPath = join(__dirname, '..', 'lambda');
if (!existsSync(join(lambdaPath, 'node_modules', '@aws-sdk', 'client-sns'))) {
  console.log('📦 Installing @aws-sdk/client-sns...');
  const npmInstall = spawn('npm', ['install', '@aws-sdk/client-sns'], {
    cwd: lambdaPath,
    stdio: 'inherit',
    shell: true
  });
  
  await new Promise((resolve, reject) => {
    npmInstall.on('close', code => {
      if (code !== 0) reject(new Error(`npm install failed with code ${code}`));
      else resolve();
    });
  });
}

console.log('');
console.log('🏗️  Starting CDK deployment...');
console.log('');

// Run CDK deploy with environment variables
const cdkProcess = spawn('node', ['create.js'], {
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
    console.log('✅ Deployment successful!');
    console.log('');
    
    // Show environment-specific next steps
    if (env === 'dev') {
      console.log('📝 Development mode active:');
      console.log('   - SMS codes returned in API responses');
      console.log('   - No actual SMS sent (zero cost)');
      console.log('   - Check CloudWatch logs for codes');
    } else if (env === 'prod') {
      console.log('📝 Production mode active:');
      console.log('   - Real SMS via AWS SNS');
      console.log('   - Costs apply: ~$0.00645 per SMS');
      console.log('   - Monitor costs in AWS Billing Dashboard');
      console.log('');
      console.log('📊 Monitor SMS usage:');
      console.log('   aws cloudwatch get-metric-statistics \\');
      console.log('     --namespace AWS/SNS \\');
      console.log('     --metric-name NumberOfMessagesPublished \\');
      console.log('     --start-time $(date -u -d "1 day ago" +%Y-%m-%dT%H:%M:%S) \\');
      console.log('     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \\');
      console.log('     --period 3600 \\');
      console.log('     --statistics Sum');
    }
  } else {
    console.error('');
    console.error('❌ Deployment failed with code:', code);
    process.exit(code);
  }
});
