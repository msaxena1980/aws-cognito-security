/**
 * Lambda function to verify user password and TOTP code without logging them out
 * This is used for sensitive operations like disabling 2FA
 */

import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ 
  region: process.env.AWS_REGION || 'us-east-1' 
});

export const handler = async (event) => {
  console.log('Verify credentials request:', JSON.stringify(event, null, 2));
  console.log('Environment - Client ID:', process.env.COGNITO_CLIENT_ID);
  console.log('Environment - Region:', process.env.AWS_REGION);

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS for CORS
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { email, password, totpCode } = body;

    // Validate required fields
    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Email and password are required' })
      };
    }

    // Step 1: Initiate auth with password
    const initiateAuthParams = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    let authResponse;
    try {
      const initiateAuthCommand = new InitiateAuthCommand(initiateAuthParams);
      authResponse = await cognitoClient.send(initiateAuthCommand);
    } catch (error) {
      console.error('Password verification failed:', error);
      if (error.name === 'NotAuthorizedException' || error.name === 'UserNotFoundException') {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            message: 'Incorrect password',
            field: 'password'
          })
        };
      }
      throw error;
    }

    // Step 2: Handle MFA challenge
    if (authResponse.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      // If totpCode is null/undefined, return success indicating password is verified
      // but MFA is required for full verification
      if (totpCode === null || totpCode === undefined || totpCode === '') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            verified: true,
            requiresMfa: true,
            message: 'Password verified successfully. MFA required for full verification.',
            session: authResponse.Session // Store session for later MFA verification
          })
        };
      }

      // If totpCode is provided, verify it
      const respondToAuthParams = {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ClientId: process.env.COGNITO_CLIENT_ID,
        ChallengeResponses: {
          USERNAME: email,
          SOFTWARE_TOKEN_MFA_CODE: totpCode
        },
        Session: authResponse.Session
      };

      try {
        const respondCommand = new RespondToAuthChallengeCommand(respondToAuthParams);
        const mfaResponse = await cognitoClient.send(respondCommand);
        
        // Both password and TOTP verified successfully
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            verified: true,
            requiresMfa: false,
            message: 'Credentials verified successfully'
          })
        };
      } catch (error) {
        console.error('TOTP verification failed:', error);
        if (error.name === 'CodeMismatchException' || error.name === 'NotAuthorizedException') {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ 
              message: 'Incorrect 2FA code',
              field: 'totpCode'
            })
          };
        }
        throw error;
      }
    } else {
      // No MFA required, password is correct
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          verified: true,
          requiresMfa: false,
          message: 'Password verified successfully'
        })
      };
    }

  } catch (error) {
    console.error('Error verifying credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        message: error.message || 'Failed to verify credentials'
      })
    };
  }
};
