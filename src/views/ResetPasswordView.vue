<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { handleResetPassword } from '../services/auth';

const email = ref('');
const code = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const success = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

onMounted(() => {
  if (route.query.email) {
    email.value = route.query.email;
  }
});

async function resetPassword() {
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    await handleResetPassword(email.value, code.value, newPassword.value);
    success.value = 'Password reset successfully! Redirecting to login...';
    setTimeout(() => {
      router.push('/login');
    }, 2000);
  } catch (err) {
    error.value = err.message || 'Failed to reset password';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>Reset Password</h2>
    <p>Enter the code sent to your email and your new password.</p>
    <form @submit.prevent="resetPassword" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="code">Verification Code</label>
        <input type="text" id="code" v-model="code" required />
      </div>
      <div class="form-group">
        <label for="newPassword">New Password</label>
        <input type="password" id="newPassword" v-model="newPassword" required />
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirm New Password</label>
        <input type="password" id="confirmPassword" v-model="confirmPassword" required />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      <button type="submit" :disabled="loading" class="auth-button">
        {{ loading ? 'Resetting...' : 'Reset Password' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.auth-container {
  max-width: 400px;
  margin: 40px auto;
  padding: 2rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1rem;
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

.error-message {
  color: #ff4d4f;
  font-size: 0.875rem;
}

.success-message {
  color: #52c41a;
  font-size: 0.875rem;
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  padding: 0.75rem;
  border-radius: 4px;
}

.auth-button {
  padding: 0.75rem;
  background: var(--vt-c-green-1);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.auth-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
