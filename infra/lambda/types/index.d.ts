/**
 * TypeScript type definitions for Lambda functions
 * Provides type safety for the authentication system
 */

// DynamoDB Item Types
export interface UserProfile {
  pk: string;
  sk: 'PROFILE';
  email: string;
  cognitoSub: string;
  name?: string;
  phone?: string;
  userType: 'free' | 'premium';
  isVerified: boolean;
  twoFAEnabled: boolean;
  passkeyEnabled: boolean;
  vaultEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastGlobalLogin?: string;
  authMethods: AuthMethods;
}

export interface AuthMethods {
  password: boolean;
  emailOtp: boolean;
  mobileOtp: boolean;
  mfa: boolean;
  passphrase: boolean;
  passkeys: boolean;
}

export interface DeviceRecord {
  userSub: string;
  deviceId: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'web';
  fingerprint?: string;
  imei?: string;
  firstSeen: string;
  lastLogin: string;
  lastIp: string;
  isTrusted: boolean;
  os?: string;
  browser?: string;
}

export interface EmailMapping {
  email: string;
  sub: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultData {
  pk: string;
  sk: 'VAULT';
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
}

export interface PassphraseData {
  pk: string;
  sk: 'PASSPHRASE';
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
}

// API Request/Response Types
export interface ApiResponse<T = any> {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ValidationResult {
  valid: boolean;
  value?: string;
  error?: string;
}

// Lambda Event Types
export interface CognitoTriggerEvent {
  version: string;
  triggerSource: string;
  region: string;
  userPoolId: string;
  userName: string;
  callerContext: {
    awsSdkVersion: string;
    clientId: string;
  };
  request: {
    userAttributes: Record<string, string>;
    clientMetadata?: Record<string, string>;
    userContextData?: {
      ipAddress: string;
      deviceName: string;
    };
  };
  response: Record<string, any>;
}

export interface ApiGatewayEvent {
  httpMethod: string;
  path: string;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
  headers: Record<string, string>;
  body?: string;
  requestContext: {
    requestId: string;
    authorizer?: {
      claims: {
        sub: string;
        email: string;
        [key: string]: string;
      };
    };
    identity: {
      sourceIp: string;
      userAgent: string;
    };
  };
}

// Device Metadata Types
export interface DeviceMetadata {
  deviceId: string;
  fingerprint?: string;
  deviceType: string;
  os: string;
  browser: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
}

// Logger Types
export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  requestId?: string;
  function?: string;
  userSub?: string;
  [key: string]: any;
}

// Secrets Types
export interface SESConfig {
  senderEmail: string;
  senderName: string;
}

export interface AppConfig {
  devMode: boolean;
  maxLoginAttempts: number;
  sessionTimeoutMinutes: number;
}
