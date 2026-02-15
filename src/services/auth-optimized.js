/**
 * Optimized authentication service
 * Reduces API call chains by batching and caching operations
 */

import { signIn, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { get } from 'aws-amplify/api';

// Cache for auth methods to avoid repeated calls
const authMethodsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Gets auth methods with caching
 */
export async function getAuthMethodsCached(email) {
  const cacheKey = email.toLowerCase();
  const cached = authMethodsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const restOperation = get({
      apiName: 'AuthApi',
      path: '/auth-methods',
      options: {
        queryParams: { email },
      },
    });

    const { body } = await restOperation.response;
    const data = await body.json();

    // Cache the result
    authMethodsCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    return data;
  } catch (error) {
    console.error('Error fetching auth methods:', error);
    throw error;
  }
}

/**
 * Clears auth methods cache for an email
 */
export function clearAuthMethodsCache(email) {
  authMethodsCache.delete(email.toLowerCase());
}

/**
 * Optimized sign-in that combines authentication and user info fetch
 */
export async function signInOptimized(email, password, deviceMetadata) {
  try {
    // Sign in with device metadata
    const signInResult = await signIn({
      username: email,
      password,
      options: {
        clientMetadata: deviceMetadata,
      },
    });

    // If sign-in is complete, fetch user info in parallel with session
    if (signInResult.isSignedIn) {
      const [user, session] = await Promise.all([
        getCurrentUser(),
        fetchAuthSession(),
      ]);

      return {
        success: true,
        user,
        session,
        nextStep: null,
      };
    }

    // Handle MFA or other challenges
    return {
      success: false,
      nextStep: signInResult.nextStep,
    };
  } catch (error) {
    console.error('Sign-in error:', error);
    throw error;
  }
}

/**
 * Batch operation to check auth status and fetch profile
 */
export async function getAuthStateWithProfile() {
  try {
    const [user, session] = await Promise.all([
      getCurrentUser(),
      fetchAuthSession(),
    ]);

    // If authenticated, fetch profile in the same call
    if (user && session.tokens) {
      try {
        const restOperation = get({
          apiName: 'AuthApi',
          path: '/profile',
        });

        const { body } = await restOperation.response;
        const profile = await body.json();

        return {
          isAuthenticated: true,
          user,
          session,
          profile,
        };
      } catch (profileError) {
        // Profile fetch failed, but user is still authenticated
        console.warn('Failed to fetch profile:', profileError);
        return {
          isAuthenticated: true,
          user,
          session,
          profile: null,
        };
      }
    }

    return {
      isAuthenticated: false,
      user: null,
      session: null,
      profile: null,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      user: null,
      session: null,
      profile: null,
    };
  }
}

/**
 * Prefetch auth methods for faster login
 */
export function prefetchAuthMethods(email) {
  // Fire and forget - cache will be ready when needed
  getAuthMethodsCached(email).catch(() => {
    // Ignore errors in prefetch
  });
}
