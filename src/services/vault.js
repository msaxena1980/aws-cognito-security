import { get, put } from 'aws-amplify/api';
import { post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { WORDS } from './wordlist';

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

function b64encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64decodeToArray(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function randomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}

async function deriveKek(passphrase, saltB64, iterations = 600000) {
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const salt = b64decodeToArray(saltB64);
  const kek = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return kek;
}

async function generateDek() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function encryptWithAesGcm(key, plaintextBytes) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );
  return { ivB64: b64encode(iv), ctB64: b64encode(new Uint8Array(ciphertext)) };
}

async function decryptWithAesGcm(key, ivB64, ctB64) {
  const iv = b64decodeToArray(ivB64);
  const ct = b64decodeToArray(ctB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct
  );
  return new Uint8Array(pt);
}

async function encryptVaultPayload(dek, dataObj) {
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(JSON.stringify(dataObj));
  return encryptWithAesGcm(dek, payloadBytes);
}

async function wrapDek(kek, dek) {
  const rawDek = await crypto.subtle.exportKey('raw', dek);
  return encryptWithAesGcm(kek, new Uint8Array(rawDek));
}

export async function createEncryptedVaultPackage(passphrase, initialVault = { entries: [] }) {
  const salt = randomBytes(16);
  const saltB64 = b64encode(salt);
  const kek = await deriveKek(passphrase, saltB64);
  const dek = await generateDek();

  const { ivB64: vaultNonce, ctB64: vaultCiphertext } = await encryptVaultPayload(dek, initialVault);
  const { ivB64: dekNonce, ctB64: encDek } = await wrapDek(kek, dek);

  const pkg = {
    vaultCiphertext,
    vaultNonce,
    encDek,
    dekNonce,
    kdf: {
      name: 'PBKDF2',
      salt: saltB64,
      iterations: 600000,
      hash: 'SHA-256'
    },
    version: 1
  };
  return pkg;
}

export async function saveVaultPackage(pkg) {
  const op = put({
    apiName: 'AuthApi',
    path: '/vault',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: pkg
    }
  });
  const res = await op.response;
  if (res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Vault save failed: ${res.statusCode} ${body}`);
  }
  return res.body.json();
}

export async function getVaultMetadata() {
  try {
    const op = get({
      apiName: 'AuthApi',
      path: '/vault',
      options: {
        authMode: 'userPool',
        headers: await authHeaders()
      }
    });
    const res = await op.response;
    if (res.statusCode === 404) {
      return { exists: false };
    }
    if (res.statusCode >= 300) {
      const body = await res.body.text();
      throw new Error(`Vault metadata failed: ${res.statusCode} ${body}`);
    }
    return res.body.json();
  } catch (error) {
    const status = error?.response?.statusCode;
    if (status === 404) {
      return { exists: false };
    }
    console.error('Error in getVaultMetadata:', error);
    return { exists: false };
  }
}

export async function getVaultPackageFull() {
  const op = get({
    apiName: 'AuthApi',
    path: '/vault',
    options: {
      authMode: 'userPool',
      queryParams: { full: '1' },
      headers: await authHeaders()
    }
  });
  const res = await op.response;
  if (res.statusCode === 404) {
    return { exists: false };
  }
  if (res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Vault fetch failed: ${res.statusCode} ${body}`);
  }
  return res.body.json();
}

export async function changePassphrase(oldPassphrase, newPassphrase) {
  const pkg = await getVaultPackageFull();
  if (!pkg.exists) throw new Error('Vault not found');
  const oldKek = await deriveKek(oldPassphrase, pkg.kdf.salt, pkg.kdf.iterations || 600000);
  const rawDekBytes = await decryptWithAesGcm(oldKek, pkg.dekNonce, pkg.encDek);
  const dek = await crypto.subtle.importKey(
    'raw',
    rawDekBytes,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
  const newSalt = randomBytes(16);
  const newSaltB64 = b64encode(newSalt);
  const newKek = await deriveKek(newPassphrase, newSaltB64);
  const { ivB64: newDekNonce, ctB64: newEncDek } = await wrapDek(newKek, dek);

  const updated = {
    vaultCiphertext: pkg.vaultCiphertext,
    vaultNonce: pkg.vaultNonce,
    encDek: newEncDek,
    dekNonce: newDekNonce,
    kdf: {
      name: 'PBKDF2',
      salt: newSaltB64,
      iterations: 600000,
      hash: 'SHA-256'
    },
    version: (pkg.version || 1) + 1
  };
  return saveVaultPackage(updated);
}

export function generatePassphrase(count = 9) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length;
    out.push(WORDS[idx]);
  }
  return out.join(' ');
}

export async function saveEncryptedPassphrase(passphrase) {
  const op = post({
    apiName: 'AuthApi',
    path: '/passphrase',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { passphrase }
    }
  });
  const res = await op.response;
  if (res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Passphrase save failed: ${res.statusCode} ${body}`);
  }
  return res.body.json();
}

export async function getPassphraseStatus() {
  const op = get({
    apiName: 'AuthApi',
    path: '/passphrase',
    options: {
      authMode: 'userPool',
      headers: await authHeaders()
    }
  });
  const res = await op.response;
  if (res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Passphrase status failed: ${res.statusCode} ${body}`);
  }
  return res.body.json();
}

export async function verifyPassphrase(passphrase) {
  const op = post({
    apiName: 'AuthApi',
    path: '/passphrase/verify',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { passphrase }
    }
  });
  const res = await op.response;
  const body = await res.body.json();
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Passphrase verify failed: ${res.statusCode}`);
  }
  return body;
}
