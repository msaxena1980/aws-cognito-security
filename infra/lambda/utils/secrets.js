import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Secrets Manager utility for Lambda functions
 * Provides caching and easy access to secrets
 */

const client = new SecretsManagerClient({});
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieves a secret from Secrets Manager with caching
 */
export async function getSecret(secretArn) {
  // Check cache
  const cached = cache.get(secretArn);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);
    
    const secretValue = response.SecretString 
      ? JSON.parse(response.SecretString)
      : response.SecretBinary;

    // Cache the result
    cache.set(secretArn, {
      value: secretValue,
      timestamp: Date.now(),
    });

    return secretValue;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
}

/**
 * Gets SES configuration from Secrets Manager
 */
export async function getSESConfig() {
  const secretArn = process.env.SES_SECRET_ARN;
  
  if (!secretArn) {
    // Fallback to environment variables for backward compatibility
    return {
      senderEmail: process.env.SES_SENDER_EMAIL || 'noreply@example.com',
      senderName: process.env.SES_SENDER_NAME || 'Security Alerts',
    };
  }

  const secret = await getSecret(secretArn);
  return {
    senderEmail: secret.senderEmail,
    senderName: secret.senderName || 'Security Alerts',
  };
}

/**
 * Gets application configuration from Secrets Manager
 */
export async function getAppConfig() {
  const secretArn = process.env.APP_CONFIG_SECRET_ARN;
  
  if (!secretArn) {
    // Fallback to defaults
    return {
      devMode: process.env.DEV_MODE === 'true',
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
      sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30'),
    };
  }

  const secret = await getSecret(secretArn);
  return {
    devMode: secret.devMode === 'true',
    maxLoginAttempts: parseInt(secret.maxLoginAttempts || '5'),
    sessionTimeoutMinutes: parseInt(secret.sessionTimeoutMinutes || '30'),
  };
}

/**
 * Clears the secrets cache (useful for testing)
 */
export function clearCache() {
  cache.clear();
}
