<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { handleSignIn, handleResendSignUpCode } from '../services/auth';

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

const isUnconfirmed = ref(false);

onMounted(() => {
  if (route.query.email) {
    email.value = route.query.email;
  }
});

async function handleUnconfirmed(emailValue) {
  if (!emailValue) {
    console.error('handleUnconfirmed called without email');
    error.value = 'Email is missing. Please enter your email and try again.';
    return;
  }

  isUnconfirmed.value = true;
  error.value = 'Account unverified. Sending a new verification code...';
  
  try {
    console.log('Attempting auto-resend for:', emailValue);
    const resendResult = await handleResendSignUpCode(emailValue);
    console.log('Auto-resend successful:', resendResult);
    error.value = 'Verification code sent to your inbox! Redirecting...';
  } catch (resendErr) {
    console.error('Auto-resend failed during login:', resendErr);
    // If resend fails (e.g. limit reached), we still want to redirect
    error.value = `Account unverified. ${resendErr.message || 'Could not send new code.'} Redirecting to verification...`;
  } finally {
    console.log('Scheduling redirection to /confirm-signup');
    setTimeout(() => {
      router.push({
        path: '/confirm-signup',
        query: { email: emailValue, resent: 'true' }
      });
    }, 3000);
  }
}

async function login() {
  if (!email.value || !password.value) {
    error.value = 'Email and password are required.';
    return;
  }

  loading.value = true;
  error.value = '';
  isUnconfirmed.value = false;
  
  try {
    console.log('--- Login Attempt Start ---');
    console.log('Email:', email.value);
    
    const { isSignedIn, nextStep } = await handleSignIn(email.value, password.value);
    console.log('Login successful? ', isSignedIn);
    console.log('Next step:', nextStep);
    
    if (isSignedIn) {
      const redirectPath = route.query.redirect || '/admin';
      router.push(redirectPath);
    } else if (nextStep && nextStep.signInStep === 'CONFIRM_SIGN_UP') {
      console.log('Detected unconfirmed account via nextStep');
      await handleUnconfirmed(email.value);
    } else {
      error.value = 'Login successful but further action required: ' + (nextStep?.signInStep || 'Unknown step');
    }
  } catch (err) {
    console.error('--- Login Attempt Error ---');
    console.error('Full Error Object:', err);
    console.error('Error Name:', err.name);
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    
    const errorName = err.name || err.code || '';
    const errorMessage = err.message || '';
    
    // Check for unconfirmed status by name OR by message content
    if (errorName === 'UserNotConfirmedException' || errorMessage.toLowerCase().includes('confirm') || errorMessage.toLowerCase().includes('verify')) {
      console.log('Detected unconfirmed account via error catch');
      await handleUnconfirmed(email.value);
    } else if (errorName === 'NotAuthorizedException') {
      error.value = 'Incorrect email or password.';
    } else if (errorName === 'UserNotFoundException') {
      error.value = 'No account found with this email.';
    } else {
      error.value = `Login failed: ${errorMessage} (${errorName})`;
    }
  } finally {
    loading.value = false;
    console.log('--- Login Attempt End ---');
  }
}

function goToVerification() {
  router.push({
    path: '/confirm-signup',
    query: { email: email.value }
  });
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
      <div v-if="error" class="error-message">
        {{ error }}
        <div v-if="isUnconfirmed" class="action-link" @click="goToVerification">
          Click here to verify your account
        </div>
      </div>
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
