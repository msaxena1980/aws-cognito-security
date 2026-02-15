/**
 * Standardized error handling for Lambda functions
 * Provides consistent error responses across all endpoints
 */

/**
 * Standard error codes
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
};

/**
 * Creates a standardized error response
 */
export function createErrorResponse(statusCode, code, message, details = null) {
  const body = {
    error: {
      code,
      message,
    },
  };

  if (details) {
    body.error.details = details;
  }

  return {
    statusCode,
    headers: getCorsHeaders(),
    body: JSON.stringify(body),
  };
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: getCorsHeaders(),
    body: JSON.stringify(data),
  };
}

/**
 * CORS headers for all responses
 */
export function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    'Content-Type': 'application/json',
  };
}

/**
 * Common error responses
 */
export const CommonErrors = {
  validationError: (message, details) => 
    createErrorResponse(400, ErrorCodes.VALIDATION_ERROR, message, details),
  
  notFound: (resource = 'Resource') => 
    createErrorResponse(404, ErrorCodes.NOT_FOUND, `${resource} not found`),
  
  unauthorized: (message = 'Unauthorized') => 
    createErrorResponse(401, ErrorCodes.UNAUTHORIZED, message),
  
  forbidden: (message = 'Forbidden') => 
    createErrorResponse(403, ErrorCodes.FORBIDDEN, message),
  
  conflict: (message) => 
    createErrorResponse(409, ErrorCodes.CONFLICT, message),
  
  internalError: (message = 'Internal server error') => 
    createErrorResponse(500, ErrorCodes.INTERNAL_ERROR, message),
  
  rateLimit: () => 
    createErrorResponse(429, ErrorCodes.RATE_LIMIT, 'Too many requests'),
};

/**
 * Wraps a Lambda handler with error handling
 */
export function withErrorHandling(handler) {
  return async (event, context) => {
    try {
      return await handler(event, context);
    } catch (error) {
      console.error('Unhandled error:', error);
      
      // Handle AWS SDK errors
      if (error.name === 'ConditionalCheckFailedException') {
        return CommonErrors.conflict('Resource already exists or condition not met');
      }
      
      if (error.name === 'ResourceNotFoundException') {
        return CommonErrors.notFound();
      }
      
      // Default to internal error
      return CommonErrors.internalError();
    }
  };
}
