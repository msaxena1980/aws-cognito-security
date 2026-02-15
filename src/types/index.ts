/**
 * TypeScript type definitions for frontend
 */

// Auth State Types
export interface AuthState {
  user: CognitoUser | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export interface CognitoUser {
  username: string;
  userId: string;
  signInDetails?: {
    loginId: string;
    authFlowType: string;
  };
}

// Auth Methods Types
export interface AuthMethods {
  password: boolean;
  emailOtp: boolean;
  mobileOtp: boolean;
  mfa: boolean;
  passphrase: boolean;
  passkeys: boolean;
}

export interface AuthMethodsResponse {
  authMethods?: AuthMethods;
  status?: 'UNCONFIRMED';
  message?: string;
}

// Profile Types
export interface UserProfile {
  email: string;
  name?: string;
  phone?: string;
  userType: 'free' | 'premium';
  twoFAEnabled: boolean;
  passkeyEnabled: boolean;
  vaultEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Device Types
export interface DeviceMetadata {
  deviceId: string;
  fingerprint?: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
}

// API Response Types
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

// Vault Types
export interface VaultData {
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
}

export interface PassphraseStatus {
  exists: boolean;
  createdAt?: string;
}

// MFA Types
export interface TOTPSetup {
  secret: string;
  qrCode: string;
}

export interface MFAPreference {
  enabled: boolean;
  preferred: 'TOTP' | 'SMS' | 'EMAIL' | null;
}

// Sign In Types
export interface SignInResult {
  success: boolean;
  user?: CognitoUser;
  session?: any;
  nextStep?: {
    signInStep: string;
    [key: string]: any;
  };
}

// Phone/Email Change Types
export interface VerificationFlow {
  step: 'start' | 'verify-old' | 'verify-new' | 'complete';
  code?: string;
  newValue?: string;
}

export interface VerificationResponse {
  success: boolean;
  message: string;
  code?: string; // For dev mode
}
