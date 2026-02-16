<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import OtpInput from '../components/OtpInput.vue';
import { authState, handleForgotPassword, handleUpdatePassword, handleSignOut, updateNameEmail, sendEmailOtp, confirmEmailOtp, handleSignIn, getMfaStatus, startTotpSetup, completeTotpSetup, disableTotpMfa, verifyCredentials } from '../services/auth';
import { getProfile, updateProfile, startPhoneChange, verifyPhoneOld, verifyPhoneNew, startEmailChange, verifyEmailOld, verifyEmailNew } from '../services/profile';
import { getVaultMetadata, createEncryptedVaultPackage, saveVaultPackage, changePassphrase as rewrapPassphrase, generatePassphrase, saveEncryptedPassphrase, getPassphraseStatus, verifyPassphrase } from '../services/vault';
import { completeAccountDeletion, startDeleteOtp, verifyDeleteOtp } from '../services/account';
import { getCurrentDevicePasskey } from '../services/passkey';
import QRCode from 'qrcode';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const success = ref('');

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showUpdateForm = ref(false);

// Vault / Passphrase setup
const vaultExists = ref(true);
const passphraseStored = ref(false);
const passphrase = ref('');
const confirmPassphrase = ref('');
const passphraseSetting = ref(false);
const setupStep = ref('intro');
const generatedWords = ref([]);
const confirmIndex = ref(0);
const confirmInput = ref('');
const showPassphraseModal = ref(false);

// Profile state
const profileName = ref('');
const profileEmail = ref('');
const profilePhone = ref('');
const originalProfileName = ref('');
const hasTwoFAProfile = ref(false);
const hasPasskey = ref(false);
const hasVaultProfile = ref(false);
const currentDeviceHasPasskey = ref(false);
const phoneOtpSent = ref(false);
const phoneOtpCode = ref('');
const emailOtpSent = ref(false);
const emailOtpCode = ref('');
const userId = computed(() => authState.user?.userId || '');
const currentEmail = computed(() => authState.user?.signInDetails?.loginId || profileEmail.value || '');

const isTwoFAEnabled = ref(false);
const showTwoFAModal = ref(false);
const twoFAStep = ref('download');
const totpSecret = ref('');
const totpUri = ref('');
const totpQrDataUrl = ref('');
const totpCodeInput = ref('');
const disableTotpCodeInput = ref('');
const disablePasswordInput = ref('');
const disableTotpStep = ref('password'); // 'password' | 'totp'
const verifiedPassword = ref(''); // Store password temporarily for TOTP verification

// Email change flow
const showEmailChangeModal = ref(false);
const emailChangeStep = ref('new');
const newEmailInput = ref('');
const codeOldInput = ref('');
const codeNewInput = ref('');
const inlineOldCode = ref('');
const inlineNewCode = ref('');

// Phone change (modal)
const showPhoneChangeModal = ref(false);
const phoneChangeStep = ref('new'); // 'new' | 'verify-old' | 'verify-new'
const newPhoneInput = ref('');
const phoneOldCodeInput = ref('');
const phoneNewCodeInput = ref('');
const inlinePhoneOldCode = ref('');
const inlinePhoneNewCode = ref('');

// Password change (modal)
const showPasswordChangeModal = ref(false);

onMounted(async () => {
  try {
    // Load profile
    try {
      const prof = await getProfile();
      profileName.value = prof.name || '';
      originalProfileName.value = profileName.value;
      profileEmail.value = prof.email || authState.user?.signInDetails?.loginId || '';
      profilePhone.value = prof.phone || '';
      hasTwoFAProfile.value = !!prof.twoFAEnabled;
      hasPasskey.value = !!prof.passkeyEnabled;
      hasVaultProfile.value = !!prof.vaultEnabled;
      if (hasTwoFAProfile.value) {
        isTwoFAEnabled.value = true;
      }
    } catch (e) {
      console.warn('Profile fetch failed:', e);
    }
    
    // Check if current device has a passkey
    try {
      const devicePasskey = await getCurrentDevicePasskey();
      currentDeviceHasPasskey.value = devicePasskey !== null;
    } catch (e) {
      console.warn('Failed to check device passkey:', e);
      currentDeviceHasPasskey.value = false;
    }
    
    const meta = await getVaultMetadata();
    vaultExists.value = !!meta.exists;
    const status = await getPassphraseStatus();
    passphraseStored.value = !!status.stored;
    if (vaultExists.value && passphraseStored.value) {
      hasVaultProfile.value = true;
    }
    try {
      const mfa = await getMfaStatus();
      const hasTotp = !!mfa.hasTotp;
      if (hasTotp) {
        isTwoFAEnabled.value = true;
        if (!hasTwoFAProfile.value) {
          hasTwoFAProfile.value = true;
          try {
            await updateProfile({
              name: profileName.value,
              email: profileEmail.value,
              phone: profilePhone.value,
              twoFAEnabled: true
            });
          } catch (profileErr) {
            console.warn('Failed to persist 2FA status from MFA check:', profileErr);
          }
        }
      }
    } catch (mfaErr) {
      console.warn('MFA status fetch failed:', mfaErr);
    }
  } catch (e) {
    vaultExists.value = false;
    passphraseStored.value = false;
    console.warn('Vault metadata fetch failed:', e);
  }
});

const canSaveName = computed(() => {
  const current = (profileName.value || '').trim();
  const original = (originalProfileName.value || '').trim();
  return current.length > 0 && current !== original;
});

async function saveProfileNameEmail() {
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await updateNameEmail(profileName.value, undefined);
    await updateProfile({ name: profileName.value, email: profileEmail.value, phone: profilePhone.value });
    originalProfileName.value = (profileName.value || '').trim();
    success.value = 'Profile updated.';
  } catch (e) {
    error.value = e.message || 'Failed to update profile';
  } finally {
    loading.value = false;
  }
}

function openPhoneChange() {
  error.value = '';
  success.value = '';
  newPhoneInput.value = '';
  phoneOtpCode.value = '';
  inlinePhoneOldCode.value = '';
  inlinePhoneNewCode.value = '';
  phoneChangeStep.value = 'new';
  showPhoneChangeModal.value = true;
}

async function setPhoneAndSendOtp() {
  const e164 = /^\+[1-9]\d{1,14}$/;
  if (!e164.test((newPhoneInput.value || '').trim())) {
    error.value = 'Enter a valid mobile number e.g., +14155550123';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const res = await startPhoneChange(newPhoneInput.value);
    phoneChangeStep.value = 'verify-old';
    inlinePhoneOldCode.value = res?.codeOld || '';
    success.value = inlinePhoneOldCode.value
      ? `Dev mode: Code sent to current mobile is ${inlinePhoneOldCode.value}`
      : 'A verification code has been sent to your current contact (sandbox).';
  } catch (e) {
    error.value = e.message || 'Failed to send OTP';
  } finally {
    loading.value = false;
  }
}

async function verifyOldPhoneCode() {
  const raw = (phoneOldCodeInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your current mobile';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const resp = await verifyPhoneOld(code);
    inlinePhoneNewCode.value = resp?.codeNew || '';
    phoneChangeStep.value = 'verify-new';
    success.value = inlinePhoneNewCode.value
      ? `Dev mode: Code sent to new mobile is ${inlinePhoneNewCode.value}`
      : 'A verification code has been sent to your new mobile (sandbox).';
  } catch (e) {
    error.value = e.message || 'Current mobile verification failed';
  } finally {
    loading.value = false;
  }
}

async function verifyNewPhoneCode() {
  const raw = (phoneNewCodeInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your new mobile';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await verifyPhoneNew(code);
    profilePhone.value = (newPhoneInput.value || '').trim();
    await updateProfile({ name: profileName.value, email: profileEmail.value, phone: profilePhone.value });
    success.value = 'Mobile number updated and verified.';
    showPhoneChangeModal.value = false;
    newPhoneInput.value = '';
    phoneOldCodeInput.value = '';
    phoneNewCodeInput.value = '';
    inlinePhoneOldCode.value = '';
    inlinePhoneNewCode.value = '';
    phoneChangeStep.value = 'new';
  } catch (e) {
    error.value = e.message || 'New mobile verification failed';
  } finally {
    loading.value = false;
  }
}

async function sendEmailCode() {
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await sendEmailOtp();
    emailOtpSent.value = true;
    success.value = 'Verification code sent to your email.';
  } catch (e) {
    error.value = e.message || 'Failed to send email code';
  } finally {
    loading.value = false;
  }
}

async function confirmEmail() {
  const raw = (emailOtpCode.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your email';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await confirmEmailOtp(code);
    await updateProfile({ name: profileName.value, email: profileEmail.value, phone: profilePhone.value });
    success.value = 'Email verified.';
    emailOtpSent.value = false;
    emailOtpCode.value = '';
  } catch (e) {
    error.value = e.message || 'Failed to verify email';
  } finally {
    loading.value = false;
  }
}

async function updatePassword() {
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match';
    return;
  }

  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await handleUpdatePassword(oldPassword.value, newPassword.value);
    success.value = 'Password updated successfully! You are still logged in.';
    oldPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    showPasswordChangeModal.value = false;
  } catch (err) {
    error.value = err.message || 'Failed to update password';
  } finally {
    loading.value = false;
  }
}

async function setupPassphrase() {
  if (!passphrase.value) {
    error.value = 'Generate a passphrase first';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await saveEncryptedPassphrase(passphrase.value.trim());
    const pkg = await createEncryptedVaultPackage(passphrase.value.trim(), { entries: [] });
    await saveVaultPackage(pkg);
    success.value = 'Secure vault created and saved.';
    vaultExists.value = true;
    passphraseStored.value = true;
    hasVaultProfile.value = true;
    try {
      await updateProfile({
        name: profileName.value,
        email: profileEmail.value,
        phone: profilePhone.value,
        vaultEnabled: true
      });
    } catch (profileErr) {
      console.warn('Failed to persist vault status to profile:', profileErr);
    }
    passphraseSetting.value = false;
    showPassphraseModal.value = false;
    passphrase.value = '';
    confirmPassphrase.value = '';
    setupStep.value = 'intro';
  } catch (e) {
    error.value = e.message || 'Failed to create vault';
  } finally {
    loading.value = false;
  }
}

function startPassphraseWizard() {
  generatedWords.value = generatePassphrase(9).split(' ');
  passphrase.value = generatedWords.value.join(' ');
  confirmIndex.value = Math.floor(Math.random() * generatedWords.value.length);
  confirmInput.value = '';
  setupStep.value = 'show';
  showPassphraseModal.value = true;
}

function goToConfirmWord() {
  setupStep.value = 'confirm';
}

function backToShow() {
  setupStep.value = 'show';
}

async function verifyWordAndSave() {
  const expected = generatedWords.value[confirmIndex.value];
  if ((confirmInput.value || '').trim().toLowerCase() !== expected.toLowerCase()) {
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    error.value = `Please enter the ${ordinal(confirmIndex.value + 1)} word correctly`;
    return;
  }
  await setupPassphrase();
}

async function initiatePasswordReset() {
  const email = authState.user?.signInDetails?.loginId;
  if (!email) {
    error.value = 'User email not found. Please log in again.';
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const { nextStep } = await handleForgotPassword(email);
    if (nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
      success.value = 'A verification code has been sent to your email. Redirecting...';
      setTimeout(() => {
        router.push({
          path: '/reset-password',
          query: { email }
        });
      }, 2000);
    }
  } catch (err) {
    error.value = err.message || 'Failed to initiate password reset';
  } finally {
    loading.value = false;
  }
}
const showChangeModal = ref(false);
const changeStep = ref('verify');
const verifyWords = ref(Array(9).fill(''));
const oldPassphraseCollected = ref('');
const newPassphraseGenerated = ref('');
const newWords = ref([]);
const confirmIndexChange = ref(0);
const confirmInputChange = ref('');

function startChangePassphrase() {
  error.value = '';
  success.value = '';
  verifyWords.value = Array(9).fill('');
  oldPassphraseCollected.value = '';
  newPassphraseGenerated.value = '';
  newWords.value = [];
  confirmIndexChange.value = 0;
  confirmInputChange.value = '';
  changeStep.value = 'verify';
  showChangeModal.value = true;
}

async function submitVerify() {
  const joined = verifyWords.value
    .map(w => (w || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  if (joined.split(/\s+/).length !== 9) {
    error.value = 'Enter all 9 words';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const resp = await verifyPassphrase(joined);
    if (!resp.verified) {
      error.value = 'Passphrase incorrect';
      return;
    }
    oldPassphraseCollected.value = joined;
    newWords.value = generatePassphrase(9).split(' ');
    newPassphraseGenerated.value = newWords.value.join(' ');
    confirmIndexChange.value = Math.floor(Math.random() * newWords.value.length);
    confirmInputChange.value = '';
    changeStep.value = 'show';
  } catch (e) {
    error.value = e.message || 'Verification failed';
  } finally {
    loading.value = false;
  }
}

function goToConfirmNew() {
  changeStep.value = 'confirm';
}

function backToShowNew() {
  changeStep.value = 'show';
}

async function finalizeChange() {
  const expected = newWords.value[confirmIndexChange.value];
  if ((confirmInputChange.value || '').trim().toLowerCase() !== expected.toLowerCase()) {
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    error.value = `Please enter the ${ordinal(confirmIndexChange.value + 1)} word correctly`;
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await rewrapPassphrase(oldPassphraseCollected.value, newPassphraseGenerated.value);
    await saveEncryptedPassphrase(newPassphraseGenerated.value);
    success.value = 'Passphrase changed and saved.';
    showChangeModal.value = false;
  } catch (e) {
    error.value = e.message || 'Failed to change passphrase';
  } finally {
    loading.value = false;
  }
}

function downloadPassphrase(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cryptojogi_passphrase.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text, lbl) {
  try {
    if (typeof window !== 'undefined' && window.isSecureContext && window.navigator && window.navigator.clipboard) {
      await window.navigator.clipboard.writeText(text);
      success.value = lbl == null ? 'Passphrase copied to clipboard' : lbl + ' copied to clipboard';
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        success.value = 'Passphrase copied to clipboard';
      } else {
        throw new Error('Clipboard copy failed');
      }
    }
  } catch (e) {
    console.error('Clipboard error:', e);
    error.value = 'Could not copy to clipboard. Please copy manually.';
  }
}

function arrFromMaybeRef(maybe) {
  if (!maybe) return undefined;
  if (Array.isArray(maybe)) return maybe;
  if (typeof maybe === 'object') {
    if ('value' in maybe) {
      const v = maybe.value;
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && typeof v.length === 'number') return v;
    }
    if (typeof maybe.length === 'number') return maybe;
  }
  return undefined;
}

function distributeInto(arrRefOrArr, startIndex, words) {
  const arr = arrFromMaybeRef(arrRefOrArr);
  if (!arr) return;
  const max = arr.length;
  for (let i = 0; i < words.length && startIndex + i < max; i++) {
    arr[startIndex + i] = words[i];
  }
}

function handlePasteToWords(ev, arrRefOrArr, startIndex = 0) {
  try {
    const text =
      ev.clipboardData?.getData('text') ||
      (window.clipboardData && window.clipboardData.getData('Text')) ||
      '';
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      ev.preventDefault();
      distributeInto(arrRefOrArr, 0, words);
    } else if (words.length === 1) {
      ev.preventDefault();
      distributeInto(arrRefOrArr, 0, words);
    }
  } catch {}
}

function onChipInput(ev, arrRefOrArr, startIndex = 0) {
  const arr = arrFromMaybeRef(arrRefOrArr);
  if (!arr) return;
  const v = ev.target?.value ?? '';
  if (/\s/.test(v)) {
    const words = v.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      arr[0] = '';
      return;
    }
    distributeInto(arr, 0, words);
  } else {
    arr[startIndex] = v;
  }
}

const showDeleteModal = ref(false);
const deleteStep = ref('warning');
const deleteWords = ref(Array(9).fill(''));
const deleteOtpCode = ref('');
const inlineDeleteCode = ref('');
const deletePassword = ref('');
const deleteFallback = ref(false);

function startDeleteFlow() {
  error.value = '';
  success.value = '';
  deleteStep.value = 'warning';
  deleteWords.value = Array(9).fill('');
  deleteOtpCode.value = '';
  inlineDeleteCode.value = '';
  deletePassword.value = '';
  deleteFallback.value = false;
  showDeleteModal.value = true;
}

async function confirmDeleteWarning() {
  loading.value = true;
  error.value = '';
  try {
    try {
      const resp = await startDeleteOtp();
      inlineDeleteCode.value = resp?.code || '';
      success.value = inlineDeleteCode.value ? `Dev code: ${inlineDeleteCode.value}` : 'A verification code has been sent to your email.';
      deleteStep.value = 'otp';
    } catch (e) {
      const status = e?.response?.statusCode || e?.statusCode;
      if (status === 410) {
        deleteFallback.value = true;
        await sendEmailOtp();
        success.value = 'A verification code has been sent to your email.';
        deleteStep.value = 'otp';
      } else {
        throw e;
      }
    }
  } catch (e) {
    error.value = e.message || 'Failed to start deletion';
  } finally {
    loading.value = false;
  }
}

async function submitDeleteOtp() {
  const raw = (deleteOtpCode.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your email';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    try {
      await verifyDeleteOtp(code);
    } catch (e) {
      const status = e?.response?.statusCode || e?.statusCode;
      if (status === 410 || status === 404) {
        deleteFallback.value = true;
        await confirmEmailOtp(code);
      } else {
        throw e;
      }
    }
    try {
      // Refresh passphrase status to avoid stale state
      const status = await getPassphraseStatus();
      passphraseStored.value = !!status.stored;
    } catch {}
    success.value = 'Email verified.';
    deleteStep.value = 'password';
  } catch (e) {
    error.value = e.message || 'Code verification failed';
  } finally {
    loading.value = false;
  }
}

async function submitDeletePassword() {
  const pwd = (deletePassword.value || '').trim();
  if (!pwd) {
    error.value = 'Enter your password';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    try {
      await handleSignIn(currentEmail.value, pwd);
    } catch (err) {
      if (err?.name !== 'InvalidStateException' && err?.name !== 'UserAlreadyAuthenticatedException') {
        throw err;
      }
    }
    if (passphraseStored.value) {
      success.value = 'Password verified. Enter your 9-word passphrase.';
      deleteStep.value = 'passphrase';
    } else {
      try {
        await completeAccountDeletion(undefined);
        success.value = 'Account deleted';
        showDeleteModal.value = false;
        await handleSignOut();
        router.push('/');
      } catch (delErr) {
        // If backend requires passphrase anyway or additional verification,
        // pivot to passphrase step instead of failing the flow
        success.value = 'Password verified. Enter your 9-word passphrase.';
        deleteStep.value = 'passphrase';
      }
    }
  } catch (e) {
    error.value = e.message || 'Password verification failed';
  } finally {
    loading.value = false;
  }
}

async function submitDeletePassphrase() {
  const joined = deleteWords.value.map(w => (w || '').trim().toLowerCase()).filter(Boolean).join(' ');
  if (joined.split(/\s+/).length !== 9) {
    error.value = 'Enter all 9 words';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await completeAccountDeletion(joined);
    success.value = 'Account deleted';
    showDeleteModal.value = false;
    await handleSignOut();
    router.push('/');
  } catch (e) {
    error.value = e.message || 'Deletion failed';
  } finally {
    loading.value = false;
  }
}
 
function openEmailChange() {
  error.value = '';
  success.value = '';
  newEmailInput.value = '';
  codeOldInput.value = '';
  codeNewInput.value = '';
  inlineOldCode.value = '';
  inlineNewCode.value = '';
  emailChangeStep.value = 'new';
  showEmailChangeModal.value = true;
}

async function startEmailChangeFlow() {
  const email = (newEmailInput.value || '').trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    error.value = 'Enter a valid new email address';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const resp = await startEmailChange(email);
    inlineOldCode.value = resp?.codeOld || '';
    emailChangeStep.value = 'verify-old';
    if (inlineOldCode.value) {
      success.value = `Dev mode: Code sent to current email is ${inlineOldCode.value}`;
    } else {
      success.value = 'A verification code has been sent to your current email.';
    }
  } catch (e) {
    error.value = e.message || 'Failed to start email change';
  } finally {
    loading.value = false;
  }
}

async function verifyOldEmailCode() {
  const raw = (codeOldInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your current email';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const resp = await verifyEmailOld(code);
    inlineNewCode.value = resp?.codeNew || '';
    emailChangeStep.value = 'verify-new';
    if (inlineNewCode.value) {
      success.value = `Dev mode: Code sent to new email is ${inlineNewCode.value}`;
    } else {
      success.value = 'A verification code has been sent to your new email.';
    }
  } catch (e) {
    error.value = e.message || 'Old email verification failed';
  } finally {
    loading.value = false;
  }
}

async function verifyNewEmailCode() {
  const raw = (codeNewInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code sent to your new email';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await verifyEmailNew(code);
    profileEmail.value = (newEmailInput.value || '').trim();
    await updateProfile({ name: profileName.value, email: profileEmail.value, phone: profilePhone.value });
    success.value = 'Email updated and verified.';
    showEmailChangeModal.value = false;
    newEmailInput.value = '';
    codeOldInput.value = '';
    codeNewInput.value = '';
    inlineOldCode.value = '';
    inlineNewCode.value = '';
  } catch (e) {
    error.value = e.message || 'New email verification failed';
  } finally {
    loading.value = false;
  }
}

function copyUserId(text) {
  if (!userId.value) return;
  copyToClipboard(userId.value, text);
}

function enable2FA() {
  error.value = '';
  success.value = '';
  totpSecret.value = '';
  totpUri.value = '';
  totpCodeInput.value = '';
  disableTotpCodeInput.value = '';
  disablePasswordInput.value = '';
  verifiedPassword.value = ''; // Clear stored password
  disableTotpStep.value = 'password';
  if (!isTwoFAEnabled.value) {
    twoFAStep.value = 'download';
    showTwoFAModal.value = true;
  } else {
    twoFAStep.value = 'disable';
    showTwoFAModal.value = true;
  }
}

async function beginTotpSetupFlow() {
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const { secret, uri } = await startTotpSetup();
    totpSecret.value = secret;
    totpUri.value = uri;
    try {
      totpQrDataUrl.value = await QRCode.toDataURL(uri, { margin: 1, width: 192 });
    } catch (qrErr) {
      console.warn('QR code generation failed:', qrErr);
      totpQrDataUrl.value = '';
    }
    twoFAStep.value = 'scan';
  } catch (e) {
    error.value = e.message || 'Failed to start 2FA setup';
  } finally {
    loading.value = false;
  }
}

function goToBackupStep() {
  twoFAStep.value = 'backup';
}

function goToEnableCodeStep() {
  twoFAStep.value = 'enable';
}

async function confirmTotpSetup() {
  const raw = (totpCodeInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code from your authenticator app';
    return;
  }
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await completeTotpSetup(code);
    isTwoFAEnabled.value = true;
    hasTwoFAProfile.value = true;
    try {
      await updateProfile({
        name: profileName.value,
        email: profileEmail.value,
        phone: profilePhone.value,
        twoFAEnabled: true
      });
    } catch (profileErr) {
      console.warn('Failed to persist 2FA status to profile:', profileErr);
    }
    success.value = 'Two-factor authentication enabled.';
    showTwoFAModal.value = false;
  } catch (e) {
    error.value = e.message || 'Failed to verify code';
  } finally {
    loading.value = false;
  }
}

async function verifyPasswordStep() {
  const pwd = (disablePasswordInput.value || '').trim();
  
  if (!pwd) {
    error.value = 'Enter your password';
    return;
  }
  
  loading.value = true;
  error.value = '';
  success.value = '';
  
  try {
    // Verify password only (no TOTP code yet)
    await verifyCredentials(currentEmail.value, pwd, null);
    
    // Store password temporarily for TOTP verification step
    verifiedPassword.value = pwd;
    
    // Password verified, move to TOTP step
    disableTotpStep.value = 'totp';
    success.value = 'Password verified. Now enter your 2FA code.';
    disablePasswordInput.value = ''; // Clear input field for security
  } catch (e) {
    console.error('Password verification failed:', e);
    if (e?.statusCode === 401 || e?.field === 'password') {
      error.value = 'Incorrect password';
    } else if (e?.name === 'NotAuthorizedException' || e?.message?.toLowerCase().includes('incorrect')) {
      error.value = 'Incorrect password';
    } else {
      error.value = e.message || 'Password verification failed';
    }
  } finally {
    loading.value = false;
  }
}

async function confirmDisableTwoFA() {
  const raw = (disableTotpCodeInput.value || '').trim();
  const code = raw.replace(/\D/g, '');
  
  if (!code || code.length !== 6) {
    error.value = 'Enter the 6-digit code from your authenticator app';
    return;
  }
  
  loading.value = true;
  error.value = '';
  success.value = '';
  
  try {
    // Verify TOTP code with the stored password
    await verifyCredentials(currentEmail.value, verifiedPassword.value, code);
    
    // Both password and TOTP verified, now disable 2FA
    await disableTotpMfa();
    
    // Update state
    isTwoFAEnabled.value = false;
    hasTwoFAProfile.value = false;
    
    try {
      await updateProfile({
        name: profileName.value,
        email: profileEmail.value,
        phone: profilePhone.value,
        twoFAEnabled: false
      });
    } catch (profileErr) {
      console.warn('Failed to persist 2FA disabled status to profile:', profileErr);
    }
    
    success.value = 'Two-factor authentication disabled successfully. You are still logged in.';
    showTwoFAModal.value = false;
    disableTotpCodeInput.value = '';
    disablePasswordInput.value = '';
    verifiedPassword.value = ''; // Clear stored password
    disableTotpStep.value = 'password';
  } catch (e) {
    console.error('Error disabling 2FA:', e);
    if (e?.statusCode === 401 || e?.field === 'totpCode') {
      error.value = 'Incorrect 2FA code. Please try again.';
    } else if (e?.name === 'CodeMismatchException') {
      error.value = 'Incorrect 2FA code. Please try again.';
    } else {
      error.value = e.message || 'Failed to disable 2FA';
    }
  } finally {
    loading.value = false;
  }
}

function backToPasswordStep() {
  disableTotpStep.value = 'password';
  verifiedPassword.value = ''; // Clear stored password
  error.value = '';
  success.value = '';
}

async function registerPasskey() {
  router.push('/passkey');
}
</script>



<template>
  <div class="admin-page">
    <h1>Admin Page</h1>
    <p>This page is only visible to logged-in users.</p>
    
    <div class="admin-content">
      
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      
      <section class="profile-section">
        <h2 class="section-title">Profile</h2>
        <div class="profile-card">
          <div class="profile-fields">
            <div class="field-row">
              <div class="field-inline">
                <input type="text" id="profileName" v-model="profileName" placeholder="Add Your Name" />
                <button type="button" class="primary-button" :disabled="loading || !canSaveName" @click="saveProfileNameEmail">
                  {{ loading ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
            <div class="field-row">
              <div class="id-row">
                <label>Account ID : {{ userId }}</label>
                <button type="button" class="secondary-button" @click="copyUserId('AccountId')" :disabled="!userId">Copy</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="security-section">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Email</div>
            <div class="feature-sub">Current: {{ profileEmail }}</div>
          </div>
          <button class="primary-button" @click="openEmailChange">Change Email</button>
        </div>
      </section>

      <section class="security-section">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Mobile Number</div>
            <div class="feature-sub">Current: {{ profilePhone || 'Not set' }}</div>
          </div>
          <button v-if="profilePhone" class="primary-button" @click="openPhoneChange">Change Mobile</button>
          <button v-else class="primary-button" @click="openPhoneChange">Add Mobile</button>
        </div>
      </section>

      <section class="security-section">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Authenticator App</div>
            <div class="feature-sub">Enabled multi factor security on your account</div>
          </div>
          <button class="primary-button" @click="enable2FA">{{ (isTwoFAEnabled || hasTwoFAProfile) ? 'Disable 2FA' : 'Enable 2FA' }}</button>
        </div>
      </section>

      <section class="security-section">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Passkeys</div>
            <div class="feature-sub" v-if="!currentDeviceHasPasskey">Consider registering a passkey on your account</div>
            <div class="feature-sub" v-else>Passkey is already registered for this device</div>
          </div>
          <button v-if="!currentDeviceHasPasskey" class="primary-button" @click="registerPasskey">Add Passkeys</button>
          <button v-else class="primary-button" @click="registerPasskey">Manage Passkey</button>
        </div>
      </section>

      <section class="security-section" v-if="!vaultExists || !passphraseStored">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Secure Vault</div>
            <div class="feature-sub">Create a vault to protect your keys</div>
          </div>
          <button type="button" class="primary-button" @click="() => { setupStep = 'intro'; showPassphraseModal = true; }">Create Vault</button>
        </div>
      </section>
      <section class="security-section" v-if="vaultExists && passphraseStored">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Secure Vault</div>
            <div class="feature-sub">Change your vault passphrase</div>
          </div>
        <button class="primary-button" @click="startChangePassphrase">Change Vault</button>
        </div>
      </section>
      <section class="security-section">
        <div class="feature-card">
          <div class="feature-info">
            <div class="feature-title">Password</div>
            <div class="feature-sub">Update your account password</div>
          </div>
          <button class="primary-button" @click="showPasswordChangeModal = true">Change Password</button>
        </div>
      </section>
    </div>

    <section class="danger-section">
      <div class="danger-card">
        <div class="danger-body">
          <p>Click here to delete your account.<br/>
          When you delete your account, all your data in this application will be removed.<br/>
          You cannot reset your trial by deleting your account.</p>
        </div>
        <div class="danger-actions">
          <button @click="startDeleteFlow" class="danger-button">Delete account</button>
        </div>
      </div>
    </section>

  <div v-if="showDeleteModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="deleteStep==='warning'">Delete account</span>
          <span v-else-if="deleteStep==='otp'">Verify Email</span>
          <span v-else-if="deleteStep==='password'">Verify Password</span>
          <span v-else>Verify passphrase</span>
        </div>
        <button class="modal-close" @click="showDeleteModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="deleteStep==='warning'">
          <div class="callout-title">This action is permanent</div>
          <div class="callout-text">All your data will be removed from this application. This cannot be undone.</div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showDeleteModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="confirmDeleteWarning">{{ loading ? 'Working...' : 'Yes, delete my account' }}</button>
          </div>
        </div>
        <div v-else-if="deleteStep==='otp'">
          <div v-if="inlineDeleteCode" class="info-inline">Dev code: {{ inlineDeleteCode }}</div>
          <div class="form-group">
            <label for="delCode">Code from Email</label>
            <OtpInput
              id="delCode"
              v-model="deleteOtpCode"
              :length="6"
            />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showDeleteModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="submitDeleteOtp">{{ loading ? 'Verifying...' : 'Verify Email' }}</button>
          </div>
        </div>
        <div v-else-if="deleteStep==='password'">
          <div class="form-group">
            <label for="delPwd">Password</label>
            <input id="delPwd" type="password" v-model="deletePassword" placeholder="Enter your password" />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showDeleteModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="submitDeletePassword">{{ loading ? 'Verifying...' : 'Verify Password' }}</button>
          </div>
        </div>
        <div v-else>
          <div class="callout-title">Enter your 9-word passphrase</div>
          <div class="word-chip-row inline-input-row">
            <span v-for="(w,i) in deleteWords" :key="i" class="chip">
              <input v-model="deleteWords[i]" class="chip-input" :placeholder="`word ${i+1}`" @paste="(e) => handlePasteToWords(e, deleteWords, 0)" @input="(e) => onChipInput(e, deleteWords, i)" autocomplete="off" autocapitalize="none" spellcheck="false" />
            </span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showDeleteModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="submitDeletePassphrase">{{ loading ? 'Deleting...' : 'Delete Account' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  </div>
  <div v-if="showPasswordChangeModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Change Password</div>
        <button class="modal-close" @click="showPasswordChangeModal = false">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="oldPassword">Current Password</label>
          <input type="password" id="oldPassword" v-model="oldPassword" required />
        </div>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input type="password" id="newPassword" v-model="newPassword" required />
        </div>
        <div class="form-group">
          <label for="confirmPassword">Confirm New Password</label>
          <input type="password" id="confirmPassword" v-model="confirmPassword" required />
        </div>
        <div class="modal-actions">
          <button class="secondary-button" @click="showPasswordChangeModal = false">Cancel</button>
          <button class="primary-button" :disabled="loading" @click="updatePassword">{{ loading ? 'Updating...' : 'Save New Password' }}</button>
        </div>
      </div>
    </div>
  </div>
  <div v-if="showEmailChangeModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="emailChangeStep==='new'">Change Email</span>
          <span v-else-if="emailChangeStep==='verify-old'">Verify Current Email</span>
          <span v-else>Verify New Email</span>
        </div>
        <button class="modal-close" @click="showEmailChangeModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="emailChangeStep==='new'">
          <div class="form-group">
            <label for="newEmail">New Email</label>
            <input id="newEmail" type="email" v-model="newEmailInput" placeholder="new@email.com" />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showEmailChangeModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="startEmailChangeFlow">{{ loading ? 'Working...' : 'Send Code to Current Email' }}</button>
          </div>
        </div>
        <div v-else-if="emailChangeStep==='verify-old'">
          <div v-if="inlineOldCode" class="info-inline">Dev code: {{ inlineOldCode }}</div>
          <div class="form-group">
            <label for="oldCode">Code from Current Email</label>
            <OtpInput
              id="oldCode"
              v-model="codeOldInput"
              :length="6"
            />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showEmailChangeModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="verifyOldEmailCode">{{ loading ? 'Verifying...' : 'Verify Current Email' }}</button>
          </div>
        </div>
        <div v-else>
          <div v-if="inlineNewCode" class="info-inline">Dev code: {{ inlineNewCode }}</div>
          <div class="form-group">
            <label for="newCode">Code from New Email</label>
            <OtpInput
              id="newCode"
              v-model="codeNewInput"
              :length="6"
            />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showEmailChangeModal=false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="verifyNewEmailCode">{{ loading ? 'Updating…' : 'Verify New Email & Update' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="showPhoneChangeModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="phoneChangeStep==='new'">Change Mobile Number</span>
          <span v-else-if="phoneChangeStep==='verify-old'">Verify Current Mobile</span>
          <span v-else>Verify New Mobile</span>
        </div>
        <button class="modal-close" @click="showPhoneChangeModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="phoneChangeStep==='new'">
          <div class="form-group">
            <label for="newPhone">New Mobile Number</label>
            <input id="newPhone" type="tel" v-model="newPhoneInput" placeholder="+1XXXXXXXXXX" />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showPhoneChangeModal=false">Cancel</button>
            <button class="primary-button" @click="setPhoneAndSendOtp">Send Code to Current Mobile</button>
          </div>
        </div>
        <div v-else-if="phoneChangeStep==='verify-old'">
          <div v-if="inlinePhoneOldCode" class="info-inline">Dev code: {{ inlinePhoneOldCode }}</div>
          <div class="form-group">
            <label for="oldPhoneCode">Code from Current Mobile</label>
            <OtpInput
              id="oldPhoneCode"
              v-model="phoneOldCodeInput"
              :length="6"
            />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showPhoneChangeModal=false">Cancel</button>
            <button class="primary-button" @click="verifyOldPhoneCode">Verify Current Mobile</button>
          </div>
        </div>
        <div v-else>
          <div v-if="inlinePhoneNewCode" class="info-inline">Dev code: {{ inlinePhoneNewCode }}</div>
          <div class="form-group">
            <label for="newPhoneCode">Code from New Mobile</label>
            <OtpInput
              id="newPhoneCode"
              v-model="phoneNewCodeInput"
              :length="6"
            />
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showPhoneChangeModal=false">Cancel</button>
            <button class="primary-button" @click="verifyNewPhoneCode">Verify New Mobile & Update</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="showTwoFAModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span>Google authenticator</span>
        </div>
        <button class="modal-close" @click="showTwoFAModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="twoFAStep !== 'disable'">
          <div class="twofa-tabs">
            <div class="twofa-tab" :class="{ active: twoFAStep === 'download' }">Download App</div>
            <div class="twofa-tab" :class="{ active: twoFAStep === 'scan' }">Scan QR Code</div>
            <div class="twofa-tab" :class="{ active: twoFAStep === 'backup' }">Backup Key</div>
            <div class="twofa-tab" :class="{ active: twoFAStep === 'enable' }">Enable 2FA</div>
          </div>
          <div class="twofa-step-body">
            <div v-if="twoFAStep === 'download'">
              <h2 class="twofa-step-title">Step 1</h2>
              <p class="twofa-step-subtitle">Download and install the Google Authenticator app</p>
              <div class="store-buttons-row">
                <a
                  class="store-pill"
                  href="https://apps.apple.com/app/google-authenticator/id388497605"
                  target="_blank"
                  rel="noopener"
                >
                  <span class="store-pill-label">Download on</span>
                  <span class="store-pill-name">App Store</span>
                </a>
                <a
                  class="store-pill"
                  href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
                  target="_blank"
                  rel="noopener"
                >
                  <span class="store-pill-label">Download on</span>
                  <span class="store-pill-name">Google Play</span>
                </a>
              </div>
              <div class="modal-actions">
                <button class="primary-button" :disabled="loading" @click="beginTotpSetupFlow">
                  {{ loading ? 'Starting...' : 'Next step' }}
                </button>
              </div>
            </div>
            <div v-else-if="twoFAStep === 'scan'">
              <h2 class="twofa-step-title">Step 2</h2>
              <p class="twofa-step-subtitle">Scan this QR code in the Google Authenticator app</p>
              <div v-if="totpQrDataUrl" class="qr-wrapper">
                <img :src="totpQrDataUrl" alt="Authenticator QR code" class="qr-image" />
              </div>
              <p class="twofa-inline-text">If you are unable to scan the QR code, please enter this code manually into the app.</p>
              <div class="backup-key-box">{{ totpSecret }}</div>
              <div class="modal-actions">
                <button class="primary-button" @click="goToBackupStep">Next step</button>
              </div>
            </div>
            <div v-else-if="twoFAStep === 'backup'">
              <h2 class="twofa-step-title">Step 3</h2>
              <p class="twofa-step-subtitle">Please save this Key on paper.</p>
              <p class="twofa-paragraph">
                This Key will allow you to recover your Google Authenticator in case of phone loss.
              </p>
              <p class="twofa-paragraph">
                Resetting your Google Authenticator requires opening a support ticket and takes at least 7 days to process
              </p>
              <div class="backup-key-box">{{ totpSecret }}</div>
              <div class="modal-actions">
                <button class="primary-button" @click="goToEnableCodeStep">Next step</button>
              </div>
            </div>
            <div v-else-if="twoFAStep === 'enable'">
              <h2 class="twofa-step-title">Step 4</h2>
              <p class="twofa-step-subtitle">Enter your 6-digit Google Authenticator code</p>
              <OtpInput
                v-model="totpCodeInput"
                :length="6"
                :autofocus="true"
                wrapper-class="code-input-row"
                input-class="code-input-box"
              />
              <div class="modal-actions">
                <button class="primary-button" :disabled="loading" @click="confirmTotpSetup">
                  {{ loading ? 'Enabling...' : 'Enable 2FA' }}
                </button>
              </div>
            </div>
          </div>
          <div class="twofa-back-link" @click="showTwoFAModal = false">
            Back. I will setup 2FA later
          </div>
        </div>
        <div v-else>
          <div v-if="disableTotpStep === 'password'">
            <h2 class="twofa-step-title">Disable 2FA - Step 1</h2>
            <p class="twofa-step-subtitle">Enter your password to continue</p>
            <div class="form-group">
              <label for="disablePassword">Password</label>
              <input
                id="disablePassword"
                type="password"
                v-model="disablePasswordInput"
                placeholder="Enter your password"
                @keyup.enter="verifyPasswordStep"
              />
            </div>
            <div class="modal-actions">
              <button class="secondary-button" @click="showTwoFAModal = false">Cancel</button>
              <button class="primary-button" :disabled="loading" @click="verifyPasswordStep">
                {{ loading ? 'Verifying...' : 'Next' }}
              </button>
            </div>
          </div>
          <div v-else>
            <h2 class="twofa-step-title">Disable 2FA - Step 2</h2>
            <p class="twofa-step-subtitle">Enter the 6-digit code from your Google Authenticator app</p>
            <OtpInput
              v-model="disableTotpCodeInput"
              :length="6"
              :autofocus="true"
              wrapper-class="code-input-row"
              input-class="code-input-box"
            />
            <div class="modal-actions">
              <button class="secondary-button" @click="backToPasswordStep">Back</button>
              <button class="primary-button" :disabled="loading" @click="confirmDisableTwoFA">
                {{ loading ? 'Disabling...' : 'Disable 2FA' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-if="showPassphraseModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="setupStep === 'intro'">Create 9-word passphrase</span>
          <span v-else-if="setupStep === 'show'">Create 9-word passphrase</span>
          <span v-else>Confirm 9-word passphrase</span>
        </div>
        <button class="modal-close" @click="showPassphraseModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="setupStep === 'intro'" class="callout">
          <div class="callout-title">9-word passphrase</div>
          <div class="callout-text">A 9-word passphrase will be created. You will need this passphrase to unlock your keys on another device. It only works for your account.</div>
        </div>
        <div v-else-if="setupStep === 'show'">
          <div class="callout-title">9-word passphrase has been generated!</div>
          <div class="callout-text">Write down your 9-word passphrase</div>
          <div class="word-chip-row">
            <span v-for="(w,i) in generatedWords" :key="i" class="chip big">{{ w }}</span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="copyToClipboard(passphrase, 'Passphrase')">Copy</button>
            <button class="secondary-button" @click="downloadPassphrase(passphrase)">Download .txt</button>
            <button class="primary-button" @click="goToConfirmWord">Continue</button>
          </div>
        </div>
        <div v-else>
          <div class="callout-title">Make sure the password is written down</div>
          <div class="callout-text">To confirm, enter the {{ confirmIndex + 1 }} word from your 9-word passphrase.</div>
          <div class="word-chip-row muted inline-input-row">
            <span
              v-for="(w,i) in generatedWords"
              :key="i"
              class="chip"
              :class="{active:i===confirmIndex}"
            >
              <template v-if="i !== confirmIndex">{{ w }}</template>
              <input
                v-else
                v-model="confirmInput"
                class="chip-input"
                placeholder="enter word"
                autofocus
              />
            </span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="backToShow">Previous Step</button>
            <button class="primary-button" :disabled="loading" @click="verifyWordAndSave">{{ loading ? 'Saving...' : 'Continue' }}</button>
          </div>
        </div>
      </div>
      <div class="modal-footer" v-if="setupStep === 'intro'">
        <button class="secondary-button" @click="showPassphraseModal = false">Cancel</button>
        <button class="primary-button" @click="startPassphraseWizard">Start</button>
      </div>
    </div>
  </div>
  <div v-if="showChangeModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="changeStep === 'verify'">Verify current passphrase</span>
          <span v-else-if="changeStep === 'show'">New 9-word passphrase</span>
          <span v-else>Confirm new passphrase</span>
        </div>
        <button class="modal-close" @click="showChangeModal = false">×</button>
      </div>
      <div class="modal-body">
        <div v-if="changeStep === 'verify'">
          <div class="callout-title">Enter your 9 words</div>
          <div class="word-chip-row inline-input-row">
            <span v-for="(w,i) in verifyWords" :key="i" class="chip">
              <input v-model="verifyWords[i]" class="chip-input" :placeholder="`word ${i+1}`" @paste="(e) => handlePasteToWords(e, verifyWords, 0)" @input="(e) => onChipInput(e, verifyWords, i)" autocomplete="off" autocapitalize="none" spellcheck="false" />
            </span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="showChangeModal = false">Cancel</button>
            <button class="primary-button" :disabled="loading" @click="submitVerify">{{ loading ? 'Verifying...' : 'Verify' }}</button>
          </div>
        </div>
        <div v-else-if="changeStep === 'show'">
          <div class="callout-title">Write down your new passphrase</div>
          <div class="word-chip-row">
            <span v-for="(w,i) in newWords" :key="i" class="chip big">{{ w }}</span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="copyToClipboard(newPassphraseGenerated, 'New Passphrase')">Copy</button>
            <button class="secondary-button" @click="downloadPassphrase(newPassphraseGenerated)">Download .txt</button>
            <button class="primary-button" @click="goToConfirmNew">Continue</button>
          </div>
        </div>
        <div v-else>
          <div class="callout-title">Confirm the {{ confirmIndexChange + 1 }} word</div>
          <div class="word-chip-row muted inline-input-row">
            <span v-for="(w,i) in newWords" :key="i" class="chip" :class="{active:i===confirmIndexChange}">
              <template v-if="i !== confirmIndexChange">{{ w }}</template>
              <input v-else v-model="confirmInputChange" class="chip-input" placeholder="enter word" />
            </span>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" @click="backToShowNew">Previous Step</button>
            <button class="primary-button" :disabled="loading" @click="finalizeChange">{{ loading ? 'Saving...' : 'Continue' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.admin-content {
  margin-top: 2rem;
  padding: 1.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
}

h3 {
  margin-bottom: 1rem;
  color: var(--vt-c-green-1);
}

p {
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

ul {
  list-style-type: disc;
  padding-left: 1.5rem;
}

li {
  margin-bottom: 0.5rem;
}

.reset-button, .action-button, .submit-button {
  padding: 0.75rem 1.5rem;
  background: var(--vt-c-green-1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}

.cancel-button {
  padding: 0.75rem 1.5rem;
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.reset-button:disabled, .action-button:disabled, .submit-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.update-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 400px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group input {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
}

.form-actions {
  display: flex;
  gap: 1rem;
}

.helper-text {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-light);
}

.helper-text a {
  color: var(--vt-c-green-1);
  text-decoration: underline;
}

.error-message {
  color: #ff4d4f;
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.success-message {
  color: #52c41a;
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}
.chip {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 0.25rem 0.5rem;
}
.chip.big {
  padding: 0.5rem 0.75rem;
  font-weight: 600;
}
.actions-row {
  display: flex;
  justify-content: flex-end;
}
.primary-button,
.secondary-button,
.danger-button {
  padding: 0.7rem 1.5rem;
  min-width: 200px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
}
.primary-button {
  background: #2f54eb;
  color: white;
  border: none;
}
.secondary-button {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
.profile-section {
  margin-bottom: 2rem;
}
.profile-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
}
.profile-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.field-row {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}
.field-inline {
  display: flex;
  gap: .75rem;
  align-items: center;
}
.field-inline input[type="text"] {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
}
.id-row {
  display: flex;
  gap: .75rem;
  align-items: center;
}
.id-value {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  word-break: break-all;
}
.security-section {
  margin: 2rem 0;
}
.section-title {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0 0 1rem 0;
  color: var(--color-heading);
}
.feature-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
}
.feature-info {
  display: flex;
  flex-direction: column;
  gap: .25rem;
}
.feature-title {
  font-size: 1.1rem;
  font-weight: 800;
}
.feature-sub {
  color: var(--color-text-light);
}
.form-inline {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.5rem;
}
.form-inline > label {
  min-width: 140px;
  font-weight: 600;
}
.form-inline input[type="text"],
.form-inline input[type="email"],
.form-inline input[type="tel"] {
  flex: 1;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: 640px;
  max-width: 95vw;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}
.modal-header, .modal-footer {
  padding: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title {
  font-size: 1.25rem;
  font-weight: 800;
}
.modal-close {
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 1.5rem;
  cursor: pointer;
}
.modal-body {
  padding: 1rem 1.25rem 1.25rem;
}
.twofa-tabs {
  display: flex;
  gap: 1.5rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--color-border);
}
.twofa-tab {
  padding: 0.75rem 0;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-text-light);
  border-bottom: 2px solid transparent;
}
.twofa-tab.active {
  color: #ffffff;
  border-bottom-color: #2563eb;
}
.twofa-step-body {
  padding: 2rem 1.5rem 1.5rem;
  text-align: center;
}
.twofa-step-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}
.twofa-step-subtitle {
  margin-bottom: 1.75rem;
  color: var(--color-text-light);
}
.store-buttons-row {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
}
.store-pill {
  background: #000000;
  color: #ffffff;
  border-radius: 999px;
  padding: 0.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 150px;
  text-decoration: none;
}
.store-pill-label {
  font-size: 0.7rem;
  opacity: 0.85;
}
.store-pill-name {
  font-size: 1rem;
  font-weight: 600;
}
.backup-key-box {
  margin: 1.5rem auto 2rem;
  padding: 0.75rem 1rem;
  max-width: 320px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: #111827;
  color: #f9fafb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  word-break: break-all;
}
.twofa-paragraph {
  margin: 0.25rem 0;
}
.code-input-row {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin: 1.5rem 0 2rem;
}
.code-input-box {
  width: 2.75rem;
  height: 3rem;
  text-align: center;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  font-size: 1.25rem;
}
.twofa-inline-text {
  margin-top: 1rem;
  color: var(--color-text-light);
}
.twofa-back-link {
  margin-top: 1rem;
  padding: 0 1.5rem 0.5rem;
  text-align: center;
  font-size: 0.9rem;
  color: #60a5fa;
  cursor: pointer;
}
.callout {
  padding: 1rem;
  border: 1px solid rgba(128,0,255,0.4);
  border-radius: 8px;
  background: rgba(128,0,255,0.08);
}
.callout-title {
  font-weight: 800;
  margin-bottom: .5rem;
}
.callout-text {
  opacity: .9;
}
.auth-app-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
}
.auth-app-card {
  flex: 1 1 240px;
  min-width: 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.auth-app-name {
  font-weight: 700;
}
.auth-app-stores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.store-button {
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: #111827;
  color: #f9fafb;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
.qr-wrapper {
  display: flex;
  justify-content: center;
  padding: 0.75rem 0;
}
.qr-image {
  width: 192px;
  height: 192px;
  image-rendering: pixelated;
}
.word-chip-row {
  display: flex;
  gap: .5rem;
  flex-wrap: wrap;
  margin: 1rem 0;
}
.word-chip-row.muted .chip {
  opacity: .6;
}
.word-chip-row .chip.active {
  border-color: var(--vt-c-green-1);
}
.inline-input-row .chip-input {
  border: none;
  background: transparent;
  outline: none;
  width: 10ch;
  font: inherit;
  color: var(--color-text);
  padding: 0.1rem 0.2rem;
}
.modal-actions {
  display: flex;
  gap: .75rem;
  justify-content: flex-end;
}
.danger-zone {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
.danger-section {
  margin-top: 2rem;
}
.danger-card {
  border: 2px solid #d32029;
  border-radius: 10px;
  background: var(--color-background);
}
.danger-title {
  padding: .75rem 1rem;
  font-weight: 800;
  border-bottom: 1px solid rgba(211,32,41,.45);
}
.danger-body {
  padding: 1rem;
  color: var(--color-text);
  opacity: .95;
}
.danger-actions {
  padding: 0 1rem 1rem;
}
.danger-button {
  background: #d32029;
  color: white;
  border: none;
}
</style>
