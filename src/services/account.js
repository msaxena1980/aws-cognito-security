import { post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';

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

export async function startDeleteOtp() {
  const op = post({
    apiName: 'AuthApi',
    path: '/account/delete/start',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: {}
    }
  });
  const res = await op.response;
  if (res.statusCode >= 300) {
    const body = await res.body.text();
    throw new Error(`Start delete failed: ${res.statusCode} ${body}`);
  }
  return res.body.json();
}

export async function verifyDeleteOtp(code) {
  const op = post({
    apiName: 'AuthApi',
    path: '/account/delete/verify',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { code }
    }
  });
  const res = await op.response;
  const body = await res.body.json();
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Verify code failed: ${res.statusCode}`);
  }
  return body;
}

export async function completeAccountDeletion(passphrase = null) {
  const op = post({
    apiName: 'AuthApi',
    path: '/account/delete/complete',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: passphrase ? { passphrase } : {}
    }
  });
  const res = await op.response;
  const body = await res.body.json();
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Delete failed: ${res.statusCode}`);
  }
  return body;
}
