<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { handleForgotPassword } from '../services/auth';

const email = ref('');
const error = ref('');
const success = ref('');
const loading = ref(false);
const router = useRouter();

async function forgotPassword() {
  loading.value = true;
  error.value = '';
  success.value = '';
  try {
    const { nextStep } = await handleForgotPassword(email.value);
    if (nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
      success.value = 'A verification code has been sent to your email.';
      setTimeout(() => {
        router.push({
          path: '/reset-password',
          query: { email: email.value }
        });
      }, 2000);
    }
  } catch (err) {
    if (err.name === 'InvalidParameterException' && err.message.includes('verified')) {
      error.value = 'Cannot reset password for unverified accounts. Please login to verify your email first. Redirecting to login...';
      setTimeout(() => {
        router.push({
          path: '/login',
          query: { email: email.value }
        });
      }, 3000);
    } else {
      error.value = err.message || 'Failed to send reset code';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>Forgot Password</h2>
    <p>Enter your email address and we'll send you a code to reset your password.</p>
    <form @submit.prevent="forgotPassword" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <div v-if="success" class="success-message">{{ success }}</div>
      <button type="submit" :disabled="loading" class="auth-button">
        {{ loading ? 'Sending...' : 'Send Reset Code' }}
      </button>
    </form>
    <p class="auth-link">
      Remembered your password? <router-link to="/login">Login</router-link>
    </p>
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

.auth-link {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.875rem;
}

.auth-link a {
  color: var(--vt-c-green-1);
  text-decoration: none;
}
</style>
