<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authState, handleForgotPassword, handleUpdatePassword } from '../services/auth';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const success = ref('');

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const showUpdateForm = ref(false);

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
</script>

<template>
  <div class="admin-page">
    <h1>Admin Page</h1>
    <p>This page is only visible to logged-in users.</p>
    
    <div class="admin-content">
      <h3>Security Settings</h3>
      <p>Need to update your security? You can change your password below.</p>
      
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      
      <div v-if="!showUpdateForm">
        <button @click="showUpdateForm = true" class="action-button">Change Password</button>
        <p class="helper-text">Forgot your old password? <a href="#" @click.prevent="initiatePasswordReset">Reset via email code</a></p>
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
</style>
