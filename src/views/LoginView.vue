<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { handleSignIn } from '../services/auth';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

async function login() {
  loading.value = true;
  error.value = '';
  try {
    const { isSignedIn } = await handleSignIn(email.value, password.value);
    if (isSignedIn) {
      const redirectPath = route.query.redirect || '/admin';
      router.push(redirectPath);
    }
  } catch (err) {
    error.value = err.message || 'Failed to login';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-container">
    <h2>Login</h2>
    <div v-if="route.query.redirect" class="info-message">
      Please login or signup to access the requested page.
    </div>
    <form @submit.prevent="login" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" v-model="password" required />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <button type="submit" :disabled="loading" class="auth-button">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
    </form>
    <p class="auth-link">
      <router-link to="/forgot-password">Forgot Password?</router-link>
    </p>
    <p class="auth-link">
      Don't have an account? <router-link :to="{ name: 'signup', query: route.query }">Signup</router-link>
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

.error-message {
  color: #ff4d4f;
  font-size: 0.875rem;
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
