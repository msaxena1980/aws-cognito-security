<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authState, handleForgotPassword, handleUpdatePassword, handleSignOut } from '../services/auth';
import { getVaultMetadata, createEncryptedVaultPackage, saveVaultPackage, changePassphrase as rewrapPassphrase, generatePassphrase, saveEncryptedPassphrase, getPassphraseStatus, verifyPassphrase } from '../services/vault';
import { completeAccountDeletion } from '../services/account';

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

onMounted(async () => {
  try {
    const meta = await getVaultMetadata();
    vaultExists.value = !!meta.exists;
    const status = await getPassphraseStatus();
    passphraseStored.value = !!status.stored;
  } catch (e) {
    vaultExists.value = false;
    passphraseStored.value = false;
    console.warn('Vault metadata fetch failed:', e);
  }
});

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
    setTimeout(() => {
      showUpdateForm.value = false;
      success.value = '';
    }, 3000);
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

function verifyWordAndSave() {
  const expected = generatedWords.value[confirmIndex.value];
  if ((confirmInput.value || '').trim().toLowerCase() !== expected.toLowerCase()) {
    error.value = `Please enter the ${confirmIndex.value + 1} word correctly`;
    return;
  }
  setupPassphrase();
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
    error.value = `Please enter the ${confirmIndexChange.value + 1} word correctly`;
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

async function copyToClipboard(text) {
  try {
    if (typeof window !== 'undefined' && window.isSecureContext && window.navigator && window.navigator.clipboard) {
      await window.navigator.clipboard.writeText(text);
      success.value = 'Passphrase copied to clipboard';
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

function startDeleteFlow() {
  error.value = '';
  success.value = '';
  deleteStep.value = 'warning';
  deleteWords.value = Array(9).fill('');
  showDeleteModal.value = true;
}

async function confirmDeleteWarning() {
  loading.value = true;
  error.value = '';
  try {
    success.value = 'Enter your 9-word passphrase to confirm deletion.';
    deleteStep.value = 'passphrase';
  } catch (e) {
    error.value = e.message || 'Failed to start deletion';
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
</script>


<template>
  <div class="admin-page">
    <h1>Admin Page</h1>
    <p>This page is only visible to logged-in users.</p>
    
    <div class="admin-content">
      
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      
      
      <div v-if="!vaultExists || !passphraseStored">
        <div class="actions-row">
          <button type="button" class="primary-button" @click="() => { setupStep = 'intro'; showPassphraseModal = true; }">Create Vault</button>
        </div>
      </div>
      <div v-if="vaultExists && passphraseStored">
        <div class="actions-row">
          <button class="action-button" @click="startChangePassphrase">Change Passphrase</button>
        </div>
        <hr />
      </div>
      <div v-if="!showUpdateForm">
        <button @click="showUpdateForm = true" class="action-button">Change Password</button>
      </div>

      <form v-else @submit.prevent="updatePassword" class="update-form">
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
        <div class="form-actions">
          <button type="submit" :disabled="loading" class="submit-button">
            {{ loading ? 'Updating...' : 'Save New Password' }}
          </button>
          <button type="button" @click="showUpdateForm = false" class="cancel-button">Cancel</button>
        </div>
      </form>
    </div>

    <div class="danger-zone">
      <h3>Danger Zone</h3>
      <button @click="startDeleteFlow" class="danger-button">Delete Account</button>
    </div>

  <div v-if="showDeleteModal" class="modal-backdrop">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">
          <span v-if="deleteStep==='warning'">Delete account</span>
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
            <button class="secondary-button" @click="copyToClipboard(passphrase)">Copy</button>
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
            <button class="secondary-button" @click="copyToClipboard(newPassphraseGenerated)">Copy</button>
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
.primary-button {
  padding: 0.6rem 1rem;
  background: #2f54eb;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
}
.secondary-button {
  padding: 0.6rem 1rem;
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
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
.danger-button {
  padding: 0.6rem 1rem;
  background: #d32029;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
}
</style>
