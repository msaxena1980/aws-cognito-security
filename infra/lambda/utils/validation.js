/**
 * Input validation utilities for Lambda functions
 * Provides simple, reusable validation functions
 */

/**
 * Validates and normalizes an email address
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  const normalized = email.trim().toLowerCase();
  
  // Simple but effective email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(normalized)) {
    return { valid: false, error: 'Invalid email format' };
  }

  if (normalized.length > 254) {
    return { valid: false, error: 'Email too long' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates a phone number (E.164 format)
 */
export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  const normalized = phone.trim();
  
  // E.164 format: +[country code][number]
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  
  if (!phoneRegex.test(normalized)) {
    return { valid: false, error: 'Invalid phone format (use E.164: +1234567890)' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates a device ID
 */
export function validateDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: 'Device ID is required' };
  }

  const normalized = deviceId.trim();
  
  // UUID format or alphanumeric with hyphens
  const deviceIdRegex = /^[a-zA-Z0-9-]{8,64}$/;
  
  if (!deviceIdRegex.test(normalized)) {
    return { valid: false, error: 'Invalid device ID format' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates a passphrase
 */
export function validatePassphrase(passphrase) {
  if (!passphrase || typeof passphrase !== 'string') {
    return { valid: false, error: 'Passphrase is required' };
  }

  if (passphrase.length < 12) {
    return { valid: false, error: 'Passphrase must be at least 12 characters' };
  }

  if (passphrase.length > 256) {
    return { valid: false, error: 'Passphrase too long (max 256 characters)' };
  }

  return { valid: true, value: passphrase };
}

/**
 * Validates a verification code (6 digits)
 */
export function validateCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Verification code is required' };
  }

  const normalized = code.trim();
  
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, error: 'Code must be 6 digits' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates JSON body size
 */
export function validateBodySize(body, maxSizeKB = 100) {
  if (!body) {
    return { valid: false, error: 'Request body is required' };
  }

  const sizeKB = Buffer.byteLength(JSON.stringify(body), 'utf8') / 1024;
  
  if (sizeKB > maxSizeKB) {
    return { valid: false, error: `Request body too large (max ${maxSizeKB}KB)` };
  }

  return { valid: true };
}

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove control characters and limit length
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, maxLength)
    .trim();
}
