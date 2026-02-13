<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { handleConfirmSignUp } from '../services/auth';

const email = ref('');
const code = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

onMounted(() => {
  if (route.query.email) {
    email.value = route.query.email;
  }
});

async function confirm() {
  loading.value = true;
  error.value = '';
  try {
    const { isSignUpComplete } = await handleConfirmSignUp(email.value, code.value);
    if (isSignUpComplete) {
      router.push('/login');
    }
  } catch (err) {
    error.value = err.message || 'Failed to confirm account';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>Confirm Account</h2>
    <p>Please enter the verification code sent to {{ email }}</p>
    <form @submit.prevent="confirm" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="code">Verification Code</label>
        <input type="text" id="code" v-model="code" required />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <button type="submit" :disabled="loading" class="auth-button">
        {{ loading ? 'Confirming...' : 'Confirm' }}
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
