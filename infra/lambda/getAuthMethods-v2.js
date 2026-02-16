/**
 * Get Auth Methods Lambda - Optimized Version
 * Demonstrates usage of validation, error handling, and structured logging
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

import { validateEmail } from './utils/validation.js';
import { createSuccessResponse, CommonErrors, withErrorHandling } from './utils/errors.js';
import { createLogger, logRequest, logResponse } from './utils/logger.js';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const EMAIL_MAPPING_TABLE = process.env.EMAIL_MAPPING_TABLE || 'EmailMapping';
const USER_TABLE = process.env.TABLE_NAME || 'UserSecurity';
const PASSKEYS_TABLE = process.env.PASSKEYS_TABLE || 'Passkeys';
const USER_POOL_ID = process.env.USER_POOL_ID;

async function handleRequest(event, context) {
  const startTime = Date.now();
  const logger = createLogger(event, { function: 'getAuthMethods' });
  
  logRequest(logger, event);

  // Validate email parameter
  const email = event.queryStringParameters?.email;
  if (!email) {
    logger.warn('Missing email parameter');
    return CommonErrors.validationError('Email parameter is required');
  }

  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    logger.warn('Invalid email format', { email });
    return CommonErrors.validationError(emailValidation.error);
  }

  const normalizedEmail = emailValidation.value;
  logger.info('Looking up auth methods', { email: normalizedEmail });

  try {
    // Step 1: Check EmailMapping table for user sub
    const mappingResult = await docClient.send(new GetCommand({
      TableName: EMAIL_MAPPING_TABLE,
      Key: { email: normalizedEmail },
    }));

    if (mappingResult.Item) {
      const userSub = mappingResult.Item.sub;
      logger.info('Found email mapping', { userSub });

      // Step 2: Get user profile from UserSecurity table
      const profileResult = await docClient.send(new GetCommand({
        TableName: USER_TABLE,
        Key: {
          pk: `USER#${userSub}`,
          sk: 'PROFILE',
        },
      }));

      if (profileResult.Item) {
        const authMethods = profileResult.Item.authMethods || { password: true };
        
        // Step 2.5: Check if user actually has passkeys registered
        // This ensures we return accurate auth methods even if profile is stale
        if (authMethods.passkeys) {
          try {
            const passkeyQuery = await docClient.send(new QueryCommand({
              TableName: PASSKEYS_TABLE,
              KeyConditionExpression: 'userSub = :sub',
              ExpressionAttributeValues: { ':sub': userSub },
              Limit: 1
            }));
            
            // Filter out temporary challenge records
            const hasRealPasskey = passkeyQuery.Items && passkeyQuery.Items.some(
              item => !item.userSub.startsWith('CHALLENGE#') && 
                      !item.userSub.startsWith('AUTH_CHALLENGE#') &&
                      !item.userSub.startsWith('PASSKEY_VERIFIED#')
            );
            
            if (!hasRealPasskey) {
              // User has no passkeys, remove from auth methods
              authMethods.passkeys = false;
              logger.info('No passkeys found, removing from auth methods');
            }
          } catch (passkeyError) {
            logger.warn('Error checking passkeys, assuming none exist', { error: passkeyError.message });
            authMethods.passkeys = false;
          }
        }
        
        logger.info('Returning auth methods from profile', { authMethods });
        
        const duration = Date.now() - startTime;
        logResponse(logger, 200, duration);
        
        return createSuccessResponse({ authMethods });
      }
    }

    // Step 3: Fallback to Cognito if not in DynamoDB
    logger.info('User not in DynamoDB, checking Cognito');
    
    const cognitoResponse = await cognitoClient.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${normalizedEmail}"`,
      Limit: 1,
    }));

    if (cognitoResponse.Users && cognitoResponse.Users.length > 0) {
      const user = cognitoResponse.Users[0];
      logger.info('Found user in Cognito', { status: user.UserStatus });

      if (user.UserStatus === 'UNCONFIRMED') {
        const duration = Date.now() - startTime;
        logResponse(logger, 200, duration);
        
        return createSuccessResponse({
          status: 'UNCONFIRMED',
          message: 'User is unconfirmed',
        });
      }

      // User exists but not in DynamoDB yet - return default
      const duration = Date.now() - startTime;
      logResponse(logger, 200, duration);
      
      return createSuccessResponse({
        authMethods: { password: true },
      });
    }

    // Step 4: User not found
    logger.info('User not found', { email: normalizedEmail });
    return CommonErrors.notFound('User');

  } catch (error) {
    logger.error('Error fetching auth methods', error);
    throw error; // Will be caught by withErrorHandling wrapper
  }
}

export const handler = withErrorHandling(handleRequest);
