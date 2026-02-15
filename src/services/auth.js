import { signUp, confirmSignUp, resendSignUpCode, signIn, signOut, getCurrentUser, fetchAuthSession, resetPassword, confirmResetPassword, updatePassword, updateUserAttributes, sendUserAttributeVerificationCode, confirmUserAttribute, fetchMFAPreference, setUpTOTP, verifyTOTPSetup, updateMFAPreference, confirmSignIn } from 'aws-amplify/auth';
import { get, post } from 'aws-amplify/api';
import { reactive } from 'vue';

export const authState = reactive({
    user: null,
    isAuthenticated: false,
    loading: true
});

export async function checkAuth() {
    try {
        const user = await getCurrentUser();
        authState.user = user;
        authState.isAuthenticated = true;
    } catch (error) {
        authState.user = null;
        authState.isAuthenticated = false;
    } finally {
        authState.loading = false;
    }
}

export async function handleSignUp(email, password) {
    try {
        const { isSignUpComplete, userId, nextStep } = await signUp({
            username: email,
            password,
            options: {
                userAttributes: {
                    email
                }
            }
        });
        return { isSignUpComplete, userId, nextStep };
    } catch (error) {
        console.error('Error signing up:', {
            name: error.name,
            message: error.message,
            recoverySuggestion: error.recoverySuggestion,
            underlyingError: error
        });
        throw error;
    }
}

export async function handleConfirmSignUp(email, code) {
    try {
        const { isSignUpComplete, nextStep } = await confirmSignUp({
            username: email,
            confirmationCode: code
        });
        return { isSignUpComplete, nextStep };
    } catch (error) {
        console.error('Error confirming sign up:', error);
        throw error;
    }
}

export async function handleResendSignUpCode(email) {
    try {
        console.log('Resending signup code to:', email);
        const output = await resendSignUpCode({ username: email });
        console.log('Resend output:', output);
        return output;
    } catch (error) {
        console.error('Detailed Resend Error:', {
            name: error.name,
            code: error.code,
            message: error.message,
            underlying: error
        });
        throw error;
    }
}

// Device Fingerprinting Logic
function getDeviceId() {
    let deviceId = localStorage.getItem('app_device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('app_device_id', deviceId);
    }
    return deviceId;
}

function getDeviceMetadata() {
    const userAgent = navigator.userAgent;
    let deviceType = 'web';
    
    if (/mobile/i.test(userAgent)) deviceType = 'mobile';
    else if (/tablet/i.test(userAgent)) deviceType = 'tablet';
    else deviceType = 'desktop';

    return {
        deviceId: getDeviceId(),
        deviceType,
        os: navigator.platform,
        browser: navigator.vendor || 'Unknown',
        // In a real mobile app, you would bridge to get IMEI here.
        // For web, we can only provide placeholders.
        imei: 'N/A' 
    };
}

export async function getAuthMethods(email) {
    try {
        const restOperation = get({
            apiName: 'AuthApi',
            path: '/auth-methods',
            options: {
                queryParams: {
                    email: email
                }
            }
        });
        const response = await restOperation.response;
        
        if (response.statusCode === 404) {
            const body = await response.body.json();
            throw { name: 'UserNotFoundException', message: body.message || 'User not found' };
        }
        
        const body = await response.body.json();
        
        if (body.status === 'UNCONFIRMED') {
            return { isUnconfirmed: true };
        }
        
        return body.authMethods;
    } catch (error) {
        console.error('Error fetching auth methods:', error);
        // Rethrow if it's a UserNotFoundException
        if (error.name === 'UserNotFoundException' || error.response?.statusCode === 404) {
            throw error;
        }
        // Default to password for other errors to avoid blocking login if API is down
        return { password: true };
    }
}

export async function handleSignIn(email, password) {
    try {
        console.log('Attempting sign-in for:', email);
        const { isSignedIn, nextStep } = await signIn({ 
            username: email, 
            password
        });
        
        if (isSignedIn) {
            await checkAuth();
        }
        return { isSignedIn, nextStep };
    } catch (error) {
        console.error('Error signing in:', {
            name: error.name,
            message: error.message,
            recoverySuggestion: error.recoverySuggestion,
            underlyingError: error
        });
        throw error;
    }
}

export async function handleConfirmMfa(code) {
    try {
        const { isSignedIn, nextStep } = await confirmSignIn({
            challengeResponse: code
        });
        if (isSignedIn) {
            await checkAuth();
        }
        return { isSignedIn, nextStep };
    } catch (error) {
        console.error('Error confirming MFA:', {
            name: error.name,
            message: error.message,
            recoverySuggestion: error.recoverySuggestion,
            underlyingError: error
        });
        throw error;
    }
}

export async function handleSignOut() {
    try {
        await signOut();
        authState.user = null;
        authState.isAuthenticated = false;
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

export async function handleForgotPassword(email) {
    try {
        const output = await resetPassword({ username: email });
        return output;
    } catch (error) {
        console.error('Error initiating forgot password:', error);
        throw error;
    }
}

export async function handleResetPassword(email, code, newPassword) {
    try {
        await confirmResetPassword({
            username: email,
            confirmationCode: code,
            newPassword
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        throw error;
    }
}

export async function handleUpdatePassword(oldPassword, newPassword) {
    try {
        await updatePassword({ oldPassword, newPassword });
    } catch (error) {
        console.error('Error updating password:', error);
        throw error;
    }
}

// Profile attribute management
export async function updateNameEmail(name, email) {
    try {
        const attrs = {};
        if (name !== undefined && name !== null) attrs.name = String(name);
        if (email !== undefined && email !== null) attrs.email = String(email);
        await updateUserAttributes({ userAttributes: attrs });
        await checkAuth();
    } catch (error) {
        console.error('Error updating name/email:', error);
        throw error;
    }
}

export async function setPhoneNumber(phone) {
    try {
        await updateUserAttributes({ userAttributes: { phone_number: String(phone) } });
        await checkAuth();
    } catch (error) {
        console.error('Error setting phone number:', error);
        throw error;
    }
}

export async function sendPhoneOtp() {
    try {
        const res = await sendUserAttributeVerificationCode({ userAttributeKey: 'phone_number' });
        return res;
    } catch (error) {
        console.error('Error sending phone OTP:', error);
        throw error;
    }
}

export async function confirmPhoneOtp(code) {
    try {
        await confirmUserAttribute({ userAttributeKey: 'phone_number', confirmationCode: code });
        await checkAuth();
    } catch (error) {
        console.error('Error confirming phone OTP:', error);
        throw error;
    }
}

export async function sendEmailOtp() {
    try {
        const res = await sendUserAttributeVerificationCode({ userAttributeKey: 'email' });
        return res;
    } catch (error) {
        console.error('Error sending email OTP:', error);
        throw error;
    }
}

export async function confirmEmailOtp(code) {
    try {
        await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code });
        await checkAuth();
    } catch (error) {
        console.error('Error confirming email OTP:', error);
        throw error;
    }
}

export async function getMfaStatus() {
    try {
        const { enabled, preferred } = await fetchMFAPreference();
        const totpStatus = (enabled && enabled.totp) || (preferred && preferred.totp);
        const hasTotp = totpStatus === 'ENABLED' || totpStatus === 'PREFERRED';
        return { hasTotp, enabled, preferred };
    } catch (error) {
        console.error('Error fetching MFA status:', error);
        return { hasTotp: false };
    }
}

export async function startTotpSetup() {
    try {
        const details = await setUpTOTP();
        const secret = details.sharedSecret;
        let label = 'user';
        try {
            const user = await getCurrentUser();
            label = user?.signInDetails?.loginId || user?.username || label;
        } catch {}
        const issuer = 'AWS Cognito Security';
        const encodedIssuer = encodeURIComponent(issuer);
        const encodedLabel = encodeURIComponent(label);
        const encodedSecret = encodeURIComponent(secret);
        const uri = `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${encodedSecret}&issuer=${encodedIssuer}`;
        return { secret, uri };
    } catch (error) {
        console.error('Error starting TOTP setup:', error);
        throw error;
    }
}

export async function completeTotpSetup(code) {
    try {
        await verifyTOTPSetup({ code });
        await updateMFAPreference({ totp: 'PREFERRED' });
        await checkAuth();
    } catch (error) {
        console.error('Error completing TOTP setup:', error);
        throw error;
    }
}

export async function disableTotpMfa() {
    try {
        await updateMFAPreference({ totp: 'DISABLED' });
        await checkAuth();
    } catch (error) {
        console.error('Error disabling TOTP MFA:', error);
        throw error;
    }
}

export async function verifyCredentials(email, password, totpCode) {
    try {
        const restOperation = post({
            apiName: 'AuthApi',
            path: '/verify-credentials',
            options: {
                body: {
                    email,
                    password,
                    totpCode: totpCode || null
                }
            }
        });
        const response = await restOperation.response;
        const body = await response.body.json();
        return body;
    } catch (error) {
        console.error('Error verifying credentials:', error);
        
        // Handle Amplify API errors
        if (error.response) {
            try {
                const errorBody = await error.response.body.json();
                const err = new Error(errorBody.message || 'Verification failed');
                err.field = errorBody.field;
                err.statusCode = error.response.statusCode;
                throw err;
            } catch (parseError) {
                // If parsing fails, throw original error with status code
                const err = new Error('Verification failed');
                err.statusCode = error.response.statusCode;
                throw err;
            }
        }
        
        // For other errors, throw as is
        throw error;
    }
}
