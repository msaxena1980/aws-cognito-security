/**
 * Device fingerprinting service
 * Provides robust device identification for security tracking
 * 
 * Note: For production, consider using @fingerprintjs/fingerprintjs-pro
 * This implementation uses the open-source version as a starting point
 */

/**
 * Generates a device fingerprint using browser APIs
 * This is a simplified implementation - for production use FingerprintJS library
 */
export async function generateDeviceFingerprint() {
  const components = [];

  // Screen resolution
  components.push(`screen:${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`);

  // Timezone
  components.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  // Language
  components.push(`lang:${navigator.language}`);

  // Platform
  components.push(`platform:${navigator.platform}`);

  // Hardware concurrency
  components.push(`cores:${navigator.hardwareConcurrency || 'unknown'}`);

  // Device memory (if available)
  if (navigator.deviceMemory) {
    components.push(`memory:${navigator.deviceMemory}`);
  }

  // Canvas fingerprint
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('fingerprint', 2, 2);
    const canvasData = canvas.toDataURL();
    const canvasHash = await simpleHash(canvasData);
    components.push(`canvas:${canvasHash}`);
  }

  // WebGL fingerprint
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      components.push(`webgl:${vendor}|${renderer}`);
    }
  }

  // Combine all components and hash
  const fingerprintString = components.join('|');
  return await simpleHash(fingerprintString);
}

/**
 * Simple hash function using SubtleCrypto
 */
async function simpleHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Gets or creates a persistent device ID
 * Combines localStorage with fingerprint for better tracking
 */
export async function getDeviceId() {
  const storageKey = 'app_device_id';
  let deviceId = localStorage.getItem(storageKey);

  if (!deviceId) {
    // Generate new device ID combining UUID and fingerprint
    const uuid = crypto.randomUUID();
    const fingerprint = await generateDeviceFingerprint();
    deviceId = `${uuid}-${fingerprint}`;
    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}

/**
 * Gets comprehensive device metadata
 */
export async function getDeviceMetadata() {
  const userAgent = navigator.userAgent;
  let deviceType = 'desktop';

  if (/mobile/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/tablet/i.test(userAgent)) {
    deviceType = 'tablet';
  }

  const deviceId = await getDeviceId();
  const fingerprint = await generateDeviceFingerprint();

  return {
    deviceId,
    fingerprint,
    deviceType,
    os: navigator.platform,
    browser: getBrowserInfo(),
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

/**
 * Extracts browser information from user agent
 */
function getBrowserInfo() {
  const ua = navigator.userAgent;
  
  if (ua.includes('Firefox/')) {
    return 'Firefox';
  } else if (ua.includes('Edg/')) {
    return 'Edge';
  } else if (ua.includes('Chrome/')) {
    return 'Chrome';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    return 'Safari';
  }
  
  return 'Unknown';
}

/**
 * Checks if device fingerprinting is supported
 */
export function isFingerprintingSupported() {
  return !!(
    window.crypto &&
    window.crypto.subtle &&
    window.crypto.randomUUID &&
    document.createElement
  );
}
