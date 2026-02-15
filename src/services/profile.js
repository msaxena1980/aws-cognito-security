import { get, put } from 'aws-amplify/api';
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

export async function getProfile() {
  const op = get({
    apiName: 'AuthApi',
    path: '/profile',
    options: {
      authMode: 'userPool',
      headers: await authHeaders()
    }
  });
  const res = await op.response;
  const body = await res.body.json();
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Profile fetch failed: ${res.statusCode}`);
  }
  return body;
}

export async function updateProfile({ name, email, phone }) {
  const op = put({
    apiName: 'AuthApi',
    path: '/profile',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { name, email, phone }
    }
  });
  const res = await op.response;
  const body = await res.body.json();
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Profile update failed: ${res.statusCode}`);
  }
  return body;
}

export async function startPhoneOtp(phone) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/phone/start',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { phone }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to start phone OTP: ${res.statusCode}`);
  }
  return body;
}

export async function verifyPhoneOtp({ phone, code }) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/phone/verify', // legacy single-step
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { phone, code }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to verify phone: ${res.statusCode}`);
  }
  return body;
}

export async function startPhoneChange(newPhone) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/phone/start',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { newPhone }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to start phone change: ${res.statusCode}`);
  }
  return body;
}

export async function verifyPhoneOld(code) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/phone/verify-old',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { code }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to verify old phone: ${res.statusCode}`);
  }
  return body;
}

export async function verifyPhoneNew(code) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/phone/verify-new',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { code }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to verify new phone: ${res.statusCode}`);
  }
  return body;
}
export async function startEmailChange(newEmail) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/email/start',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { newEmail }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to start email change: ${res.statusCode}`);
  }
  return body;
}

export async function verifyEmailOld(code) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/email/verify-old',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { code }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to verify old email: ${res.statusCode}`);
  }
  return body;
}

export async function verifyEmailNew(code) {
  const op = post({
    apiName: 'AuthApi',
    path: '/profile/email/verify-new',
    options: {
      authMode: 'userPool',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: { code }
    }
  });
  const res = await op.response;
  const body = await res.body.json().catch(() => ({}));
  if (res.statusCode >= 300) {
    throw new Error(body.message || `Failed to verify new email: ${res.statusCode}`);
  }
  return body;
}
