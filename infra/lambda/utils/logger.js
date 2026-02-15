/**
 * Structured logging utility for Lambda functions
 * CloudWatch Logs Insights compatible
 */

/**
 * Log levels
 */
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * Creates a structured log entry
 */
function createLogEntry(level, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  };

  // Add AWS context if available
  if (process.env.AWS_REQUEST_ID) {
    entry.requestId = process.env.AWS_REQUEST_ID;
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    entry.function = process.env.AWS_LAMBDA_FUNCTION_NAME;
  }

  return entry;
}

/**
 * Logger class with structured logging methods
 */
export class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  debug(message, metadata = {}) {
    const entry = createLogEntry(LogLevel.DEBUG, message, { ...this.context, ...metadata });
    console.log(JSON.stringify(entry));
  }

  info(message, metadata = {}) {
    const entry = createLogEntry(LogLevel.INFO, message, { ...this.context, ...metadata });
    console.log(JSON.stringify(entry));
  }

  warn(message, metadata = {}) {
    const entry = createLogEntry(LogLevel.WARN, message, { ...this.context, ...metadata });
    console.warn(JSON.stringify(entry));
  }

  error(message, error = null, metadata = {}) {
    const entry = createLogEntry(LogLevel.ERROR, message, {
      ...this.context,
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
    console.error(JSON.stringify(entry));
  }

  /**
   * Creates a child logger with additional context
   */
  child(additionalContext) {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

/**
 * Creates a logger instance for a Lambda function
 */
export function createLogger(event, context = {}) {
  const baseContext = {
    userSub: event.requestContext?.authorizer?.claims?.sub,
    sourceIp: event.requestContext?.identity?.sourceIp,
    userAgent: event.requestContext?.identity?.userAgent,
    ...context,
  };

  return new Logger(baseContext);
}

/**
 * Logs an API request
 */
export function logRequest(logger, event) {
  logger.info('API request received', {
    method: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
  });
}

/**
 * Logs an API response
 */
export function logResponse(logger, statusCode, duration) {
  logger.info('API response sent', {
    statusCode,
    duration: `${duration}ms`,
  });
}
