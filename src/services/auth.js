import { signUp, confirmSignUp, signIn, signOut, getCurrentUser, fetchAuthSession, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
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
        console.error('Error signing up:', error);
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

export async function handleSignIn(email, password) {
    try {
        const { isSignedIn, nextStep } = await signIn({ username: email, password });
        if (isSignedIn) {
            await checkAuth();
        }
        return { isSignedIn, nextStep };
    } catch (error) {
        console.error('Error signing in:', error);
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
