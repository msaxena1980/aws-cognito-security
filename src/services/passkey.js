import { get, post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { generateUUID } from './uuid.js';

async function authHeaders() {
  let tries = 0;
  while (tries < 12) {
    const { tokens } = await fetchAuthSession();
    const idToken = tokens?.idToken?.toString();
    if (idToken) return { Authorization: `Bearer ${idToken}` };
    tries += 1;
    await new Promise(r => setTimeout(r, 350 * tries));
  }
  return {};
}

function getDeviceId() {
  let deviceId = localStorage.getItem('app_device_id');
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem('app_device_id', deviceId);
  }
  return deviceId;
}

// Helper to convert base64url to ArrayBuffer
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert ArrayBuffer to base64url
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function isPasskeySupported() {
  if (!window.PublicKeyCredential) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerPasskey(deviceName) {
  try {
    const deviceId = getDeviceId();

    // Get registration options from server
    const optionsOp = post({
      apiName: 'AuthApi',
      path: '/passkey/register-options',
      options: {
        authMode: 'userPool',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: { deviceId, deviceName }
      }
    });
    const optionsRes = await optionsOp.response;
    const options = await optionsRes.body.json();

    if (optionsRes.statusCode >= 300) {
      const error = new Error(options.message || 'Failed to get registration options');
      error.code = 'PASSKEY_EXISTS';
      error.userMessage = options.message;
      throw error;
    }

    // Convert challenge to ArrayBuffer
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rp: options.rp,
      user: {
        id: base64urlToBuffer(options.user.id),
        name: options.user.name,
        displayName: options.user.displayName
      },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      timeout: options.timeout,
      attestation: options.attestation
    };

    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    });

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    // Extract credential data
    const credentialId = bufferToBase64url(credential.rawId);
    
    // Try to get public key - some authenticators provide it directly
    let publicKeyBuffer = credential.response.getPublicKey ? credential.response.getPublicKey() : null;
    
    // If not available, extract from attestation object (CBOR encoded)
    if (!publicKeyBuffer && credential.response.attestationObject) {
      try {
        // For simplicity, we'll send the entire attestation object
        // The server can extract the public key from it if needed
        publicKeyBuffer = credential.response.attestationObject;
      } catch (e) {
        console.error('Failed to get attestation object:', e);
      }
    }
    
    if (!publicKeyBuffer) {
      throw new Error('Failed to extract public key from credential. Your authenticator may not be supported.');
    }
    
    const publicKey = bufferToBase64url(publicKeyBuffer);
    const attestationObject = credential.response.attestationObject 
      ? bufferToBase64url(credential.response.attestationObject) 
      : null;
    const clientDataJSON = credential.response.clientDataJSON
      ? bufferToBase64url(credential.response.clientDataJSON)
      : null;

    // Register with server
    const registerOp = post({
      apiName: 'AuthApi',
      path: '/passkey/register',
      options: {
        authMode: 'userPool',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: {
          credentialId,
          publicKey,
          attestationObject,
          clientDataJSON,
          deviceId,
          deviceName: deviceName || options.user.name
        }
      }
    });
    const registerRes = await registerOp.response;
    const result = await registerRes.body.json();

    if (registerRes.statusCode >= 300) {
      throw new Error(result.message || 'Failed to register passkey');
    }

    // Store passkey state in localStorage
    localStorage.setItem(`passkey_${deviceId}`, JSON.stringify({
      credentialId,
      deviceName: deviceName || options.user.name,
      createdAt: new Date().toISOString()
    }));
    localStorage.setItem('passkey_enabled', 'true');
    
    console.log('Passkey registered and saved to localStorage');

    return result;
  } catch (error) {
    console.error('Error registering passkey:', error);
    throw error;
  }
}

export async function authenticateWithPasskey(email) {
  try {
    // Get authentication options from server
    const optionsOp = post({
      apiName: 'AuthApi',
      path: '/passkey/authenticate-options',
      options: {
        headers: { 'Content-Type': 'application/json' },
        body: { email }
      }
    });
    const optionsRes = await optionsOp.response;
    const options = await optionsRes.body.json();

    if (optionsRes.statusCode >= 300) {
      throw new Error(options.message || 'Failed to get authentication options');
    }

    // Convert challenge to ArrayBuffer
    const publicKeyOptions = {
      challenge: base64urlToBuffer(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification
    };

    // Get credential
    const credential = await navigator.credentials.get({
      publicKey: publicKeyOptions
    });

    if (!credential) {
      throw new Error('Failed to get credential');
    }

    // Extract authentication data
    const credentialId = bufferToBase64url(credential.rawId);
    const signature = bufferToBase64url(credential.response.signature);
    const authenticatorData = bufferToBase64url(credential.response.authenticatorData);
    const clientDataJSON = bufferToBase64url(credential.response.clientDataJSON);

    // Authenticate with server
    const authOp = post({
      apiName: 'AuthApi',
      path: '/passkey/authenticate',
      options: {
        headers: { 'Content-Type': 'application/json' },
        body: {
          credentialId,
          sessionId: options.sessionId,
          signature,
          authenticatorData,
          clientDataJSON
        }
      }
    });
    const authRes = await authOp.response;
    const result = await authRes.body.json();

    if (authRes.statusCode >= 300) {
      throw new Error(result.message || 'Authentication failed');
    }

    return result;
  } catch (error) {
    console.error('Error authenticating with passkey:', error);
    throw error;
  }
}
export async function listPasskeys() {
  try {
    const op = get({
      apiName: 'AuthApi',
      path: '/passkey/list',
      options: {
        authMode: 'userPool',
        headers: await authHeaders()
      }
    });
    const res = await op.response;
    const body = await res.body.json();

    if (res.statusCode >= 300) {
      throw new Error(body.message || 'Failed to list passkeys');
    }

    return body.passkeys || [];
  } catch (error) {
    console.error('Error listing passkeys:', error);
    throw error;
  }
}

export async function getCurrentDevicePasskey() {
  try {
    const deviceId = getDeviceId();
    const allPasskeys = await listPasskeys();
    return allPasskeys.find(pk => pk.deviceId === deviceId) || null;
  } catch (error) {
    console.error('Error getting current device passkey:', error);
    throw error;
  }
}

export async function deletePasskey(credentialId) {
  try {
    const op = post({
      apiName: 'AuthApi',
      path: '/passkey/delete',
      options: {
        authMode: 'userPool',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: { credentialId }
      }
    });
    const res = await op.response;
    const body = await res.body.json();

    if (res.statusCode >= 300) {
      throw new Error(body.message || 'Failed to delete passkey');
    }

    // Clear passkey state from localStorage
    const deviceId = getDeviceId();
    localStorage.removeItem(`passkey_${deviceId}`);
    localStorage.removeItem('passkey_enabled');
    
    console.log('Passkey deleted and localStorage cleared');

    return body;
  } catch (error) {
    console.error('Error deleting passkey:', error);
    throw error;
  }
}

// Check if passkey is enabled for this device (from localStorage)
export function isPasskeyEnabledLocally() {
  const deviceId = getDeviceId();
  const passkeyData = localStorage.getItem(`passkey_${deviceId}`);
  return passkeyData !== null;
}
