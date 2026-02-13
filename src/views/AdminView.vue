<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { authState, handleForgotPassword } from '../services/auth';

const router = useRouter();
const loading = ref(false);
const error = ref(false);
const success = ref('');

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
      <p>Need to update your security? You can change your password below. A verification code will be sent to your registered email.</p>
      
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      
      <button 
        @click="initiatePasswordReset" 
        :disabled="loading" 
        class="reset-button"
      >
        {{ loading ? 'Sending Code...' : 'Change Password' }}
      </button>
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

.reset-button {
  padding: 0.75rem 1.5rem;
  background: var(--vt-c-green-1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}

.reset-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
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
