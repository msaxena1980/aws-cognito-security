# 2FA Disable Flow Fix

## Changes Made

### 1. Backend - New Lambda Function
Created `infra/lambda/verifyCredentials.js` that:
- Verifies user password using Cognito's `InitiateAuth` API
- Verifies TOTP code using Cognito's `RespondToAuthChallenge` API
- Returns specific error messages for password vs TOTP failures
- Does NOT create a new session (user stays logged in)

### 2. Infrastructure - CDK Stack Update
Updated `infra/stack.js` to:
- Add the new `verifyCredentialsLambda` function
- Create API endpoint `/verify-credentials` (POST)
- Grant necessary Cognito permissions (`cognito-idp:InitiateAuth`, `cognito-idp:RespondToAuthChallenge`)

### 3. Frontend - Auth Service
Updated `src/services/auth.js` to:
- Import `post` from AWS Amplify API
- Add `verifyCredentials(email, password, totpCode)` function
- Parse error responses with field-specific error information

### 4. Frontend - Admin View
Updated `src/views/AdminView.vue` to:
- Import `verifyCredentials` function
- Update `confirmDisableTwoFA()` to call verification endpoint first
- Show specific error messages:
  - "Incorrect password" if password is wrong
  - "Incorrect 2FA code" if TOTP code is wrong
- User remains logged in throughout the process

## How It Works

1. User enters password and 2FA code in the disable 2FA modal
2. Frontend calls `/verify-credentials` API endpoint
3. Backend Lambda:
   - Attempts to authenticate with password
   - If password is correct and 2FA is enabled, verifies TOTP code
   - Returns success or specific error (password/TOTP)
4. If verification succeeds, frontend calls `disableTotpMfa()`
5. 2FA is disabled, user stays logged in

## Deployment Steps

1. Deploy the updated infrastructure:
   ```bash
   cd infra
   node create.js
   ```

2. The frontend will automatically use the new endpoint (no rebuild needed if using dev server)

3. Test the flow:
   - Enable 2FA on an account
   - Try to disable with wrong password → Should show "Incorrect password"
   - Try to disable with wrong 2FA code → Should show "Incorrect 2FA code"
   - Disable with correct credentials → Should succeed without logout

## Error Handling

The implementation provides clear error messages:
- **400**: Missing required fields (email, password, or TOTP code)
- **401**: Incorrect password or incorrect 2FA code (with `field` indicator)
- **500**: Server error

Frontend displays user-friendly messages based on the error type.
