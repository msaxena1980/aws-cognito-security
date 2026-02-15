# 2FA Disable Flow - Implementation Summary

## Problem
The disable 2FA flow was failing with a 401 Unauthorized error because it was trying to verify both password and TOTP code in a single step, which wasn't working correctly.

## Solution
Refactored the disable 2FA flow into two separate verification steps:

### Step 1: Password Verification
- User enters their password
- Frontend calls `verifyCredentials(email, password, null)` 
- Backend verifies password only and returns success if password is correct
- Password is stored temporarily in `verifiedPassword` ref for the next step
- User sees success message and moves to Step 2

### Step 2: TOTP Code Verification
- User enters their 6-digit 2FA code
- Frontend calls `verifyCredentials(email, storedPassword, totpCode)`
- Backend verifies both password and TOTP code
- If successful, frontend calls `disableTotpMfa()` to disable 2FA
- Profile is updated to reflect 2FA disabled status
- User remains logged in throughout the process

## Changes Made

### 1. Frontend (src/views/AdminView.vue)
- Added `verifiedPassword` ref to temporarily store the verified password
- Updated `verifyPasswordStep()` to:
  - Call `verifyCredentials` with password only (null TOTP)
  - Store password temporarily on success
  - Show clear success message and move to TOTP step
  - Handle password-specific errors

- Updated `confirmDisableTwoFA()` to:
  - Use stored password with TOTP code for verification
  - Call `disableTotpMfa()` only after both verifications pass
  - Clear stored password after completion
  - Handle TOTP-specific errors

- Updated `backToPasswordStep()` to clear stored password
- Updated `enable2FA()` to clear stored password when modal opens
- Added `verifyCredentials` to imports

### 2. Backend (infra/lambda/verifyCredentials.js)
- Modified to handle password-only verification when `totpCode` is null/undefined
- Returns `requiresMfa: true` when password is verified but MFA is pending
- Returns `requiresMfa: false` when both password and TOTP are verified
- Provides clear error messages with `field` indicator for better error handling

### 3. Auth Service (src/services/auth.js)
- Updated `verifyCredentials()` to explicitly pass `totpCode: totpCode || null`
- Ensures null is sent when TOTP code is not provided

## User Experience Flow

1. User clicks "Disable 2FA"
2. Modal opens showing "Step 1: Enter your password"
3. User enters password and clicks "Next"
4. If password is correct: Success message + move to Step 2
5. If password is wrong: Clear error message "Incorrect password"
6. Step 2 shows: "Enter your 2FA code"
7. User enters 6-digit code and clicks "Disable 2FA"
8. If code is correct: 2FA is disabled, success message shown, user stays logged in
9. If code is wrong: Clear error message "Incorrect 2FA code. Please try again."
10. User can go back to Step 1 at any time

## Security Considerations

- Password is stored temporarily in memory only during the 2FA disable flow
- Password is cleared immediately after use or when going back
- Password is cleared when modal is closed
- User remains authenticated throughout the process
- Both password and TOTP must be verified before 2FA can be disabled

## Error Handling

- Password errors show: "Incorrect password"
- TOTP errors show: "Incorrect 2FA code. Please try again."
- Network errors show: Generic error message
- All errors are displayed clearly in the UI
- Each step validates input before making API calls
