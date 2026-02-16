<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import OtpInput from '../components/OtpInput.vue';
import { handleSignIn, handleResendSignUpCode, getAuthMethods, handleConfirmMfa, handlePasskeySignIn } from '../services/auth';
import { updateProfile } from '../services/profile';
import { isPasskeyEnabledLocally } from '../services/passkey';

const email = ref('');
const password = ref('');
const otpCode = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const route = useRoute();

const step = ref('email'); // 'email', 'methods', 'auth'
const supportedMethods = ref({});
const selectedMethod = ref('');
const isUnconfirmed = ref(false);
const needsMfa = ref(false);

onMounted(() => {
  if (route.query.email) {
    email.value = route.query.email;
  }
});

async function nextStep() {
  if (!email.value) {
    error.value = 'Email is required.';
    return;
  }

  loading.value = true;
  error.value = '';
  
  try {
    console.log('Fetching auth methods for:', email.value);
    const result = await getAuthMethods(email.value);
    console.log('Auth methods received from server:', JSON.stringify(result, null, 2));
    
    if (result.isUnconfirmed) {
      console.log('User is unconfirmed, triggering auto-resend and redirect...');
      await handleUnconfirmed(email.value);
      return;
    }

    supportedMethods.value = result;
    
    // Check localStorage first - if passkey was deleted locally, don't show it
    const passkeyEnabledLocally = isPasskeyEnabledLocally();
    console.log('Passkey enabled in localStorage:', passkeyEnabledLocally);
    
    // Define valid login methods (Password and Passkeys only)
    const validLoginMethods = ['password', 'passkeys'];
    const activeMethods = Object.keys(result).filter(k => {
      // If it's passkeys, also check localStorage
      if (k === 'passkeys') {
        const isActive = result[k] && validLoginMethods.includes(k) && passkeyEnabledLocally;
        console.log(`Method ${k}: serverValue=${result[k]}, localStorage=${passkeyEnabledLocally}, isActive=${isActive}`);
        return isActive;
      }
      const isActive = result[k] && validLoginMethods.includes(k);
      console.log(`Method ${k}: value=${result[k]}, isActive=${isActive}`);
      return isActive;
    });
    
    console.log('Active methods after filtering:', activeMethods);
    
    // Check if Passkey is supported on this device
    const isPasskeySupported = window.PublicKeyCredential && 
                               await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    
    console.log('Passkey supported on device:', isPasskeySupported);
    
    // Refined active methods: only include passkeys if supported by device
    const deviceActiveMethods = activeMethods.filter(m => {
      const include = m !== 'passkeys' || isPasskeySupported;
      console.log(`Method ${m}: include=${include}`);
      return include;
    });

    console.log('Final device active methods:', deviceActiveMethods);

    if (deviceActiveMethods.length <= 1) {
      // If only password or nothing (default to password), go straight to auth
      selectedMethod.value = deviceActiveMethods.length === 1 ? deviceActiveMethods[0] : 'password';
      console.log('Going straight to auth with method:', selectedMethod.value);
      step.value = 'auth';
    } else {
      // Multiple options available (Password and Passkeys on this device)
      console.log('Multiple methods available, showing selection');
      step.value = 'methods';
    }
  } catch (err) {
    console.error('Error fetching auth methods:', err);
    if (err.name === 'UserNotFoundException' || err.message?.includes('not found')) {
      error.value = 'No account found with this email. Please sign up.';
    } else {
      error.value = 'Could not fetch authentication methods. Please try again later.';
    }
  } finally {
    loading.value = false;
  }
}

function selectMethod(method) {
  selectedMethod.value = method;
  
  // If passkey is selected, start authentication immediately
  if (method === 'passkeys') {
    login();
  } else {
    step.value = 'auth';
  }
}

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

function back() {
  if (step.value === 'auth') {
    const activeMethods = Object.keys(supportedMethods.value).filter(k => supportedMethods.value[k]);
    if (activeMethods.length > 1) {
      step.value = 'methods';
    } else {
      step.value = 'email';
    }
  } else if (step.value === 'methods') {
    step.value = 'email';
  }
}

async function login() {
  if (!needsMfa.value && selectedMethod.value === 'password' && !password.value) {
    error.value = 'Password is required.';
    return;
  }

  if (needsMfa.value) {
    const raw = (otpCode.value || '').trim();
    const code = raw.replace(/\D/g, '');
    if (!code || code.length !== 6) {
      error.value = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    otpCode.value = code;
  }

  loading.value = true;
  error.value = '';
  isUnconfirmed.value = false;
  
  try {
    console.log('--- Login Attempt Start ---');
    console.log('Email:', email.value);
    console.log('Method:', selectedMethod.value);
    
    let isSignedIn = false;
    let nextStep;

    if (needsMfa.value) {
      const result = await handleConfirmMfa(otpCode.value);
      isSignedIn = result.isSignedIn;
      nextStep = result.nextStep;
      if (isSignedIn) {
        try {
          await updateProfile({ twoFAEnabled: true });
        } catch (e) {
          console.warn('Failed to persist 2FA flag from login:', e);
        }
      }
    } else {
      let result;
      if (selectedMethod.value === 'password') {
        result = await handleSignIn(email.value, password.value);
      } else if (selectedMethod.value === 'passkeys') {
        // Authenticate with passkey
        result = await handlePasskeySignIn(email.value);
      } else {
        error.value = `Authentication method '${selectedMethod.value}' is not yet implemented in this demo. Please use password.`;
        loading.value = false;
        return;
      }
      isSignedIn = result.isSignedIn;
      nextStep = result.nextStep;
    }
    
    console.log('Login successful? ', isSignedIn);
    console.log('Next step:', nextStep);
    
    if (isSignedIn) {
      const redirectPath = route.query.redirect || '/admin';
      router.push(redirectPath);
    } else if (nextStep && nextStep.signInStep === 'CONFIRM_SIGN_UP') {
      console.log('Detected unconfirmed account via nextStep');
      await handleUnconfirmed(email.value);
    } else if (nextStep && nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
      needsMfa.value = true;
      error.value = '';
    } else {
      error.value = 'Login successful but further action required: ' + (nextStep?.signInStep || 'Unknown step');
    }
  } catch (err) {
    console.error('--- Login Attempt Error ---');
    console.error('Full Error Object:', err);
    
    const errorName = err.name || err.code || '';
    const errorMessage = err.message || '';
    
    if (errorName === 'UserNotConfirmedException' || errorMessage.toLowerCase().includes('confirm') || errorMessage.toLowerCase().includes('verify')) {
      console.log('Detected unconfirmed account via error catch');
      await handleUnconfirmed(email.value);
    } else if (errorName === 'NotAuthorizedException') {
      error.value = needsMfa.value ? 'Invalid authentication code. Please try again.' : 'Incorrect email or password.';
    } else if (errorName === 'UserNotFoundException') {
      error.value = 'No account found with this email.';
    } else if (errorName === 'CodeMismatchException') {
      error.value = 'Invalid authentication code. Please try again.';
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

    <!-- Step 1: Email -->
    <form v-if="step === 'email'" @submit.prevent="nextStep" class="auth-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" v-model="email" required placeholder="Enter your email" />
      </div>
      <div v-if="error" class="error-message">{{ error }}</div>
      <button type="submit" :disabled="loading" class="auth-button">
        {{ loading ? 'Checking...' : 'Next' }}
      </button>
    </form>

    <!-- Step 2: Choose Method -->
    <div v-else-if="step === 'methods'" class="auth-form">
      <p>Choose your authentication method for <strong>{{ email }}</strong>:</p>
      <div class="method-list">
        <button v-if="supportedMethods.password" @click="selectMethod('password')" :disabled="loading" class="method-button">
          Use Password
        </button>
        <button v-if="supportedMethods.passkeys" @click="selectMethod('passkeys')" :disabled="loading" class="method-button">
          {{ loading ? 'Authenticating...' : 'Passkey (Biometric)' }}
        </button>
      </div>
      <button @click="back" :disabled="loading" class="back-button">Back</button>
      <div v-if="error" class="error-message">{{ error }}</div>
    </div>

    <!-- Step 3: Authenticate -->
    <form v-else-if="step === 'auth'" @submit.prevent="login" class="auth-form">
      <p><strong>{{ email }}</strong></p>
      
      <div v-if="selectedMethod === 'password'" class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" v-model="password" required placeholder="Enter your password" />
      </div>

      <div v-if="selectedMethod === 'password' && needsMfa" class="form-group">
        <label for="otp">Authenticator code</label>
        <OtpInput
          id="otp"
          v-model="otpCode"
          :length="6"
        />
      </div>

      <div v-else-if="selectedMethod === 'passkeys'" class="form-group">
        <p class="info-text">Please use your device's biometric or security key to sign in.</p>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
        <div v-if="isUnconfirmed" class="action-link" @click="goToVerification">
          Click here to verify your account
        </div>
      </div>

      <div class="button-group">
        <button type="submit" :disabled="loading" class="auth-button">
          {{
            loading
              ? (needsMfa ? 'Verifying...' : 'Authenticating...')
              : (selectedMethod === 'passkeys'
                  ? 'Sign in with Passkey'
                  : (needsMfa ? 'Verify & Login' : 'Login'))
          }}
        </button>
        <button type="button" @click="back" class="back-button">Back</button>
      </div>
    </form>

    <p v-if="step === 'email'" class="auth-link">
      <router-link :to="{ path: '/forgot-password', query: { email: email } }">Forgot Password?</router-link>
    </p>
    <p class="auth-link">
      Don't have an account? <router-link :to="{ name: 'signup', query: { ...route.query, email: email } }">Signup</router-link>
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
  transition: opacity 0.2s;
}

.method-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.method-button {
  padding: 0.75rem;
  border: 1px solid var(--vt-c-green-1);
  border-radius: 4px;
  background-color: transparent;
  color: var(--vt-c-green-1);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.method-button:hover {
  background-color: var(--vt-c-green-1);
  color: white;
}

.back-button {
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background-color: transparent;
  color: var(--color-text);
  font-weight: 600;
  cursor: pointer;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.help-text {
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-top: 0.25rem;
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
