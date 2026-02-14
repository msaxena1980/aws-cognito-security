import { signUp, confirmSignUp, resendSignUpCode, signIn, signOut, getCurrentUser, fetchAuthSession, resetPassword, confirmResetPassword, updatePassword } from 'aws-amplify/auth';
import { get } from 'aws-amplify/api';
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
