#!/usr/bin/env node

/**
 * Environment Variable Loader
 * Loads and validates environment configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load environment configuration from file
 * @param {string} env - Environment name (dev, test, prod)
 * @returns {object} Environment configuration
 */
export function loadEnvConfig(env = 'dev') {
  const configPath = join(__dirname, '..', 'config', `${env}.env`);
  
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }
  
  const envConfig = {};
  const envFile = readFileSync(configPath, 'utf-8');
  
  envFile.split('\n').forEach(line => {
    line = line.trim();
    // Skip comments and empty lines
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value !== undefined) {
        envConfig[key.trim()] = value;
      }
    }
  });
  
  return envConfig;
}

/**
 * Get environment configuration with defaults
 * @param {string} env - Environment name
 * @returns {object} Configuration with defaults applied
 */
export function getEnvConfig(env = 'dev') {
  const config = loadEnvConfig(env);
  
  // Apply defaults for missing values
  return {
    // SMS & Email
    DEV_SMS_MODE: config.DEV_SMS_MODE ?? 'inline',
    DEV_EMAIL_MODE: config.DEV_EMAIL_MODE ?? 'inline',
    SES_SENDER_EMAIL: config.SES_SENDER_EMAIL ?? 'noreply@example.com',
    SES_SENDER_NAME: config.SES_SENDER_NAME ?? 'CryptoJogi',
    
    // Cost Protection
    SNS_SPENDING_LIMIT: config.SNS_SPENDING_LIMIT ?? '10',
    
    // Logging
    LOG_LEVEL: config.LOG_LEVEL ?? 'info',
    
    // Feature Flags
    ENABLE_SMS_MFA: config.ENABLE_SMS_MFA ?? 'false',
    ENABLE_RATE_LIMITING: config.ENABLE_RATE_LIMITING ?? 'true',
    ENABLE_DEVICE_TRACKING: config.ENABLE_DEVICE_TRACKING ?? 'true',
    ENABLE_PASSKEYS: config.ENABLE_PASSKEYS ?? 'true',
    
    // Security Settings
    MAX_OTP_ATTEMPTS: config.MAX_OTP_ATTEMPTS ?? '3',
    OTP_EXPIRY_MINUTES: config.OTP_EXPIRY_MINUTES ?? '10',
    MAX_LOGIN_ATTEMPTS: config.MAX_LOGIN_ATTEMPTS ?? '5',
    SESSION_TIMEOUT_MINUTES: config.SESSION_TIMEOUT_MINUTES ?? '30',
    
    // AWS Configuration
    AWS_REGION: config.AWS_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID ?? process.env.AWS_ACCOUNT_ID,
    
    // Passkey Configuration
    RP_ID: config.RP_ID ?? 'localhost',
    RP_NAME: config.RP_NAME ?? 'CryptoJogi',
    
    // Monitoring
    ALERT_EMAIL: config.ALERT_EMAIL,
    ENABLE_DETAILED_METRICS: config.ENABLE_DETAILED_METRICS ?? 'false',
    
    // Advanced
    COGNITO_USER_POOL_NAME: config.COGNITO_USER_POOL_NAME ?? 'aws-cognito-security-user-pool',
    API_THROTTLE_RATE: config.API_THROTTLE_RATE ?? '100',
    API_THROTTLE_BURST: config.API_THROTTLE_BURST ?? '200',
    
    // Deployment metadata
    DEPLOYMENT_ENV: env,
  };
}

/**
 * Validate environment configuration
 * @param {object} config - Configuration to validate
 * @param {string} env - Environment name
 * @throws {Error} If validation fails
 */
export function validateEnvConfig(config, env) {
  const errors = [];
  
  // Required fields
  if (!config.SES_SENDER_EMAIL || config.SES_SENDER_EMAIL === 'noreply@example.com') {
    errors.push('SES_SENDER_EMAIL must be set to a verified email address');
  }
  
  // Production-specific validations
  if (env === 'prod') {
    if (config.DEV_SMS_MODE !== '') {
      errors.push('DEV_SMS_MODE must be empty for production (real SMS)');
    }
    
    if (config.ENABLE_SMS_MFA !== 'true') {
      console.warn('⚠️  Warning: ENABLE_SMS_MFA is false in production');
    }
    
    if (parseInt(config.SNS_SPENDING_LIMIT) < 10) {
      console.warn('⚠️  Warning: SNS_SPENDING_LIMIT is very low for production');
    }
  }
  
  // Validate numeric values
  const numericFields = [
    'SNS_SPENDING_LIMIT',
    'MAX_OTP_ATTEMPTS',
    'OTP_EXPIRY_MINUTES',
    'MAX_LOGIN_ATTEMPTS',
    'SESSION_TIMEOUT_MINUTES',
    'API_THROTTLE_RATE',
    'API_THROTTLE_BURST',
  ];
  
  numericFields.forEach(field => {
    if (config[field] && isNaN(parseInt(config[field]))) {
      errors.push(`${field} must be a number, got: ${config[field]}`);
    }
  });
  
  // Validate boolean values
  const booleanFields = [
    'ENABLE_SMS_MFA',
    'ENABLE_RATE_LIMITING',
    'ENABLE_DEVICE_TRACKING',
    'ENABLE_PASSKEYS',
    'ENABLE_DETAILED_METRICS',
  ];
  
  booleanFields.forEach(field => {
    if (config[field] && !['true', 'false'].includes(config[field])) {
      errors.push(`${field} must be 'true' or 'false', got: ${config[field]}`);
    }
  });
  
  // Validate LOG_LEVEL
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.LOG_LEVEL)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
  
  // Validate DEV_SMS_MODE
  const validSmsMode = ['inline', 'email', ''];
  if (!validSmsMode.includes(config.DEV_SMS_MODE)) {
    errors.push(`DEV_SMS_MODE must be one of: 'inline', 'email', or empty`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * Display configuration summary
 * @param {object} config - Configuration to display
 */
export function displayConfig(config) {
  console.log('📋 Configuration:');
  
  const sensitiveKeys = ['SECRET', 'PASSWORD', 'KEY', 'TOKEN'];
  
  Object.entries(config).forEach(([key, value]) => {
    const isSensitive = sensitiveKeys.some(k => key.includes(k));
    const displayValue = isSensitive ? '********' : (value || '(empty)');
    console.log(`   ${key}: ${displayValue}`);
  });
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.argv[2] || 'dev';
  
  try {
    const config = getEnvConfig(env);
    validateEnvConfig(config, env);
    displayConfig(config);
    console.log('\n✅ Configuration is valid');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}
