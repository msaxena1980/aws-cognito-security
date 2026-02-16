<script setup>
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { handleSignUp } from '../services/auth';

const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

import { onMounted } from 'vue';

onMounted(() => {
  if (route.query.email) {
    email.value = route.query.email;
  }
});

// Check if passwords match
const passwordsMatch = computed(() => {
  if (!confirmPassword.value) return true; // Don't show error until user types
  return password.value === confirmPassword.value;
});

// Check if form is valid
const isFormValid = computed(() => {
  return email.value && password.value && confirmPassword.value && passwordsMatch.value;
});

async function signup() {
  // Validate passwords match
  if (!passwordsMatch.value) {
    error.value = 'Passwords do not match';
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const { nextStep } = await handleSignUp(email.value, password.value);
    if (nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
      router.push({
        path: '/confirm-signup',
        query: { email: email.value }
      });
    }
  } catch (err) {
    if (err.name === 'UsernameExistsException') {
      error.value = 'This email is already registered. Please login to your account.';
    } else {
      error.value = err.message || 'Failed to signup';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>Signup</h2>
    <div v-if="route.query.redirect" class="info-message">
      Please login or signup to access the requested page.
    </div>
    <form @submit.prevent="signup" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" v-model="password" required />
        <span class="password-hint">Min 8 characters with uppercase, lowercase, number & symbol</span>
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input 
          type="password" 
          id="confirmPassword" 
          v-model="confirmPassword" 
          required 
          :class="{ 'input-error': confirmPassword && !passwordsMatch }"
        />
        <span v-if="confirmPassword && !passwordsMatch" class="error-hint">Passwords do not match</span>
      </div>
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      <button type="submit" :disabled="loading || !isFormValid" class="auth-button">
        {{ loading ? 'Signing up...' : 'Signup' }}
      </button>
    </form>
    <p class="auth-link">
      Already have an account? <router-link :to="{ name: 'login', query: { ...route.query, email: email } }">Login</router-link>
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

.form-group input.input-error {
  border-color: #ff4d4f;
}

.password-hint {
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-top: 0.25rem;
}

.error-hint {
  font-size: 0.75rem;
  color: #ff4d4f;
  margin-top: 0.25rem;
}

.error-message {
  color: #ff4d4f;
  font-size: 0.875rem;
}

.action-link {
  color: var(--vt-c-green-1);
  text-decoration: underline;
  cursor: pointer;
  margin-top: 0.5rem;
  font-weight: 600;
}

.info-message {
  background-color: #e6f7ff;
  border: 1px solid #91d5ff;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: #0050b3;
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
