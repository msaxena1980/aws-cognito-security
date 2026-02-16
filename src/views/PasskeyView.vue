<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getCurrentUser } from 'aws-amplify/auth';
import { getCurrentDevicePasskey, deletePasskey, registerPasskey, isPasskeySupported } from '../services/passkey';
import { updateProfile, sendEmailOtp, verifyEmailOtp, verifyPassword } from '../services/profile';
import OtpInput from '../components/OtpInput.vue';

const router = useRouter();
const currentDevicePasskey = ref(null);
const loading = ref(true);
const error = ref('');
const success = ref('');
const isSupported = ref(false);
const showCreateDialog = ref(false);
const deviceName = ref('');
const deleting = ref(false);
const userEmail = ref('');
const passkeyDetailsRef = ref(null);

// Verification method selection
const showVerificationMethodDialog = ref(false);
const verificationMethod = ref(''); // 'email' or 'password'

// Email OTP verification for deletion
const showOtpDialog = ref(false);
const otpCode = ref('');
const sendingOtp = ref(false);
const verifyingOtp = ref(false);
const otpSent = ref(false);

// Password verification for deletion
const showPasswordDialog = ref(false);
const password = ref('');
const totpCode = ref('');
const verifyingPassword = ref(false);
const requiresMfa = ref(false);

const hasPasskey = computed(() => currentDevicePasskey.value !== null);

// Generate fixed passkey name based on user email
const passkeyName = computed(() => {
  return userEmail.value ? `CryptoJogi-${userEmail.value}` : 'CryptoJogi';
});

onMounted(async () => {
  isSupported.value = await isPasskeySupported();
  
  // Get user email
  try {
    const user = await getCurrentUser();
    userEmail.value = user?.signInDetails?.loginId || user?.username || '';
  } catch (e) {
    console.warn('Could not get user email:', e);
  }
  
  await loadPasskey();
});

async function loadPasskey() {
  loading.value = true;
  error.value = '';
  try {
    currentDevicePasskey.value = await getCurrentDevicePasskey();
  } catch (err) {
    console.error('Error loading passkey:', err);
    error.value = 'Failed to load passkey';
  } finally {
    loading.value = false;
  }
}

async function handleCreatePasskey() {
  loading.value = true;
  error.value = '';
  success.value = '';

  try {
    // Use passkey name based on user email
    await registerPasskey(passkeyName.value);
    success.value = 'Passkey created successfully!';
    showCreateDialog.value = false;
    await loadPasskey();
    
    // Update profile to mark passkey as enabled
    try {
      await updateProfile({ passkeyEnabled: true });
    } catch (e) {
      console.warn('Failed to update profile:', e);
    }
  } catch (err) {
    console.error('Error creating passkey:', err);
    
    // Check if it's a "passkey already exists" error
    if (err.code === 'PASSKEY_EXISTS' || (err.userMessage && err.userMessage.includes('already exists'))) {
      error.value = 'A passkey already exists for this device. Please scroll down and delete the existing passkey first, then try again.';
      showCreateDialog.value = false;
      
      // Scroll to the existing passkey section
      setTimeout(() => {
        if (passkeyDetailsRef.value) {
          passkeyDetailsRef.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add a highlight effect
          passkeyDetailsRef.value.style.animation = 'highlight 2s ease-in-out';
        }
      }, 100);
    } else {
      error.value = err.message || 'Failed to create passkey';
    }
  } finally {
    loading.value = false;
  }
}

function confirmDelete() {
  showVerificationMethodDialog.value = true;
}

function selectVerificationMethod(method) {
  verificationMethod.value = method;
  showVerificationMethodDialog.value = false;
  
  if (method === 'email') {
    startEmailVerification();
  } else if (method === 'password') {
    startPasswordVerification();
  }
}

function startPasswordVerification() {
  showPasswordDialog.value = true;
  password.value = '';
  totpCode.value = '';
  requiresMfa.value = false;
  error.value = '';
  success.value = '';
}

async function startEmailVerification() {
  sendingOtp.value = true;
  error.value = '';
  success.value = '';
  otpSent.value = false;
  otpCode.value = '';

  try {
    await sendEmailOtp();
    otpSent.value = true;
    showOtpDialog.value = true;
    success.value = `Verification code sent to ${userEmail.value}`;
  } catch (err) {
    console.error('Error sending OTP:', err);
    error.value = err.message || 'Failed to send verification code';
  } finally {
    sendingOtp.value = false;
  }
}

async function verifyAndDelete() {
  const code = (otpCode.value || '').trim().replace(/\D/g, '');
  
  if (!code || code.length !== 6) {
    error.value = 'Please enter the 6-digit verification code';
    return;
  }

  verifyingOtp.value = true;
  error.value = '';
  success.value = '';

  try {
    // Verify OTP
    await verifyEmailOtp(code);
    
    // OTP verified, now delete passkey
    await deletePasskey(currentDevicePasskey.value.credentialId);
    
    success.value = 'Passkey deleted successfully from server and browser cache. You can now create a new one.';
    showOtpDialog.value = false;
    otpCode.value = '';
    await loadPasskey();
    
    // Update profile to mark passkey as disabled
    try {
      await updateProfile({ passkeyEnabled: false });
    } catch (e) {
      console.warn('Failed to update profile:', e);
    }
    
    console.log('Passkey deleted from server and localStorage cleared');
  } catch (err) {
    console.error('Error verifying OTP or deleting passkey:', err);
    error.value = err.message || 'Verification failed. Please check your code and try again.';
  } finally {
    verifyingOtp.value = false;
  }
}

async function verifyAndDeleteWithPassword() {
  if (!password.value) {
    error.value = 'Please enter your password';
    return;
  }

  if (requiresMfa.value && !totpCode.value) {
    error.value = 'Please enter your 2FA code';
    return;
  }

  verifyingPassword.value = true;
  error.value = '';
  success.value = '';

  try {
    // Verify password (and TOTP if required)
    const result = await verifyPassword(userEmail.value, password.value, totpCode.value || null);
    
    if (result.requiresMfa && !totpCode.value) {
      // Password verified, but MFA is required
      requiresMfa.value = true;
      success.value = 'Password verified. Please enter your 2FA code.';
      verifyingPassword.value = false;
      return;
    }
    
    // Password (and optionally TOTP) verified, now delete passkey
    await deletePasskey(currentDevicePasskey.value.credentialId);
    
    success.value = 'Passkey deleted successfully from server and browser cache. You can now create a new one.';
    showPasswordDialog.value = false;
    password.value = '';
    totpCode.value = '';
    requiresMfa.value = false;
    await loadPasskey();
    
    // Update profile to mark passkey as disabled
    try {
      await updateProfile({ passkeyEnabled: false });
    } catch (e) {
      console.warn('Failed to update profile:', e);
    }
    
    console.log('Passkey deleted from server and localStorage cleared');
  } catch (err) {
    console.error('Error verifying password or deleting passkey:', err);
    error.value = err.message || 'Verification failed. Please check your credentials and try again.';
  } finally {
    verifyingPassword.value = false;
  }
}

function cancelPasswordDialog() {
  showPasswordDialog.value = false;
  password.value = '';
  totpCode.value = '';
  requiresMfa.value = false;
  error.value = '';
}

function cancelOtpDialog() {
  showOtpDialog.value = false;
  otpCode.value = '';
  otpSent.value = false;
  error.value = '';
}

async function resendOtp() {
  sendingOtp.value = true;
  error.value = '';
  success.value = '';

  try {
    await sendEmailOtp();
    success.value = 'Verification code resent!';
  } catch (err) {
    console.error('Error resending OTP:', err);
    error.value = err.message || 'Failed to resend verification code';
  } finally {
    sendingOtp.value = false;
  }
}

function formatDate(dateString) {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

async function openCreateDialog() {
  showCreateDialog.value = true;
  error.value = '';
  success.value = '';
}
</script>

<template>
  <div class="passkey-container">
    <div class="header">
      <button @click="router.push('/admin')" class="back-link">← Back to Admin</button>
      <h2>Passkeys</h2>
    </div>

    <div v-if="!isSupported" class="warning-message">
      Passkeys are not supported on this device or browser.
    </div>

    <div v-if="success" class="success-message">{{ success }}</div>
    <div v-if="error" class="error-message">{{ error }}</div>

    <div class="passkey-section">
      <div class="section-header">
        <div class="section-icon">🔑</div>
        <h3>Passkey for This Device</h3>
        <button 
          v-if="isSupported && !hasPasskey && !loading" 
          @click="openCreateDialog" 
          class="add-button"
        >
          Add Passkey
        </button>
      </div>

      <div v-if="loading" class="loading">Loading passkey...</div>

      <div v-else-if="!hasPasskey" class="empty-state">
        <p>No passkey registered for this device. Consider adding one for passwordless authentication.</p>
      </div>

      <div v-else class="passkey-details">
        <div ref="passkeyDetailsRef" class="passkey-item">
          <div class="passkey-icon">🔑</div>
          <div class="passkey-info">
            <div class="passkey-name">{{ currentDevicePasskey.deviceName }}</div>
            <div class="passkey-meta">
              <span>Added: {{ formatDate(currentDevicePasskey.createdAt) }}</span>
              <span v-if="currentDevicePasskey.lastUsed">Last used: {{ formatDate(currentDevicePasskey.lastUsed) }}</span>
              <span v-else>Last used: Never</span>
            </div>
          </div>
          <button 
            @click="confirmDelete" 
            :disabled="deleting"
            class="delete-button"
            title="Delete passkey"
          >
            🗑️ Delete
          </button>
        </div>
        <div class="passkey-note">
          <p>💡 Only one passkey per device is allowed. Delete this passkey to create a new one.</p>
          <p>🔒 Passkey credentials are stored securely by your browser/device and cannot be extracted or transferred.</p>
        </div>
      </div>
    </div>

    <!-- Create Passkey Dialog -->
    <div v-if="showCreateDialog" class="modal-overlay" @click.self="showCreateDialog = false">
      <div class="modal">
        <h3>Create Passkey</h3>
        <p class="info-text">A passkey will be created for this device with the name:</p>
        <div class="fixed-name-display">{{ passkeyName }}</div>
        <p class="help-text">This allows you to sign in using your device's biometric authentication (fingerprint, face recognition, etc.)</p>
        <div class="modal-actions">
          <button @click="handleCreatePasskey" :disabled="loading" class="primary-button">
            {{ loading ? 'Creating Passkey...' : 'Create Passkey' }}
          </button>
          <button @click="showCreateDialog = false" class="secondary-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Verification Method Selection Dialog -->
    <div v-if="showVerificationMethodDialog" class="modal-overlay" @click.self="showVerificationMethodDialog = false">
      <div class="modal verification-method-modal">
        <h3>Choose Verification Method</h3>
        <p class="info-text">To delete your passkey, please verify your identity using one of the following methods:</p>
        
        <div class="verification-methods">
          <button @click="selectVerificationMethod('email')" class="verification-method-button">
            <div class="method-icon">📧</div>
            <div class="method-info">
              <div class="method-title">Email Verification</div>
              <div class="method-description">Receive a code at {{ userEmail }}</div>
            </div>
          </button>
          
          <button @click="selectVerificationMethod('password')" class="verification-method-button">
            <div class="method-icon">🔒</div>
            <div class="method-info">
              <div class="method-title">Password Verification</div>
              <div class="method-description">Enter your account password</div>
            </div>
          </button>
        </div>

        <div class="modal-actions">
          <button @click="showVerificationMethodDialog = false" class="secondary-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Password Verification Dialog -->
    <div v-if="showPasswordDialog" class="modal-overlay" @click.self="cancelPasswordDialog">
      <div class="modal password-modal">
        <h3>Verify Your Password</h3>
        <p class="info-text">Enter your account password to delete the passkey</p>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Enter your password"
            @keyup.enter="requiresMfa ? null : verifyAndDeleteWithPassword()"
          />
        </div>

        <div v-if="requiresMfa" class="form-group">
          <label for="totpCode">2FA Code</label>
          <input
            id="totpCode"
            v-model="totpCode"
            type="text"
            placeholder="Enter your 6-digit 2FA code"
            maxlength="6"
            @keyup.enter="verifyAndDeleteWithPassword()"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-if="success" class="success-message">{{ success }}</div>

        <div class="modal-actions">
          <button @click="verifyAndDeleteWithPassword" :disabled="verifyingPassword || !password" class="danger-button">
            {{ verifyingPassword ? 'Verifying...' : 'Verify & Delete Passkey' }}
          </button>
          <button @click="cancelPasswordDialog" class="secondary-button">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Email OTP Verification Dialog -->
    <div v-if="showOtpDialog" class="modal-overlay" @click.self="cancelOtpDialog">
      <div class="modal otp-modal">
        <h3>Verify Your Email</h3>
        <p class="info-text">Enter the 6-digit code sent to <strong>{{ userEmail }}</strong></p>
        
        <div class="form-group">
          <label for="otpCode">Verification Code</label>
          <OtpInput
            id="otpCode"
            v-model="otpCode"
            :length="6"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-if="success" class="success-message">{{ success }}</div>

        <div class="modal-actions">
          <button @click="verifyAndDelete" :disabled="verifyingOtp || !otpCode" class="danger-button">
            {{ verifyingOtp ? 'Verifying...' : 'Verify & Delete Passkey' }}
          </button>
          <button @click="resendOtp" :disabled="sendingOtp" class="secondary-button">
            {{ sendingOtp ? 'Sending...' : 'Resend Code' }}
          </button>
          <button @click="cancelOtpDialog" class="secondary-button">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.passkey-container {
  max-width: 1000px;
  margin: 40px auto;
  padding: 2rem;
}

.header {
  margin-bottom: 2rem;
}

.back-link {
  background: none;
  border: none;
  color: var(--vt-c-green-1);
  cursor: pointer;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  padding: 0;
}

.warning-message {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  color: #856404;
}

.success-message {
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  color: #155724;
}

.error-message {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  color: #721c24;
}

.passkey-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.5rem;
  background: var(--color-background-soft);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.section-icon {
  font-size: 1.5rem;
}

.section-header h3 {
  flex: 1;
  margin: 0;
}

.add-button {
  padding: 0.5rem 1rem;
  background: var(--vt-c-green-1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-light);
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-text-light);
}

.passkey-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.passkey-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
}

.passkey-icon {
  font-size: 1.5rem;
}

.passkey-info {
  flex: 1;
}

.passkey-name {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.passkey-meta {
  font-size: 0.875rem;
  color: var(--color-text-light);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.delete-button {
  background: #dc3545;
  color: white;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-weight: 600;
  transition: background 0.2s;
}

.delete-button:hover {
  background: #c82333;
}

.delete-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.passkey-note {
  padding: 1rem;
  background: var(--color-background-soft);
  border-left: 3px solid var(--vt-c-green-1);
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--color-text-light);
}

.passkey-note p {
  margin: 0;
  margin-bottom: 0.5rem;
}

.passkey-note p:last-child {
  margin-bottom: 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-background);
  padding: 2rem;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.modal h3 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.info-text {
  margin-bottom: 1rem;
  color: var(--color-text-light);
  font-size: 0.875rem;
}

.fixed-name-display {
  padding: 1rem;
  background: var(--color-background-soft);
  border: 2px solid var(--vt-c-green-1);
  border-radius: 4px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 1rem;
  color: var(--vt-c-green-1);
}

.help-text {
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-bottom: 1.5rem;
  line-height: 1.4;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.primary-button {
  padding: 0.75rem;
  background: var(--vt-c-green-1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.primary-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.secondary-button {
  padding: 0.75rem;
  background: transparent;
  color: var(--vt-c-green-1);
  border: 1px solid var(--vt-c-green-1);
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.danger-button {
  padding: 0.75rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.danger-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.confirm-modal p {
  margin-bottom: 1.5rem;
  text-align: center;
}

.otp-modal {
  max-width: 450px;
}

.otp-modal .info-text {
  text-align: center;
  margin-bottom: 1.5rem;
}

.otp-modal .form-group {
  margin-bottom: 1.5rem;
}

.otp-modal .form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  text-align: center;
}

.verification-method-modal {
  max-width: 500px;
}

.verification-methods {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.verification-method-button {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--color-background-soft);
  border: 2px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
}

.verification-method-button:hover {
  border-color: var(--vt-c-green-1);
  background: var(--color-background);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.method-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.method-info {
  flex: 1;
}

.method-title {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 0.25rem;
  color: var(--color-text);
}

.method-description {
  font-size: 0.875rem;
  color: var(--color-text-light);
}

.password-modal {
  max-width: 450px;
}

.password-modal .form-group {
  margin-bottom: 1.5rem;
}

.password-modal .form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.password-modal .form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-soft);
  color: var(--color-text);
  font-size: 1rem;
}

.password-modal .form-group input:focus {
  outline: none;
  border-color: var(--vt-c-green-1);
}

@keyframes highlight {
  0%, 100% {
    background: var(--color-background);
  }
  50% {
    background: rgba(71, 209, 71, 0.2);
    box-shadow: 0 0 20px rgba(71, 209, 71, 0.3);
  }
}

</style>
