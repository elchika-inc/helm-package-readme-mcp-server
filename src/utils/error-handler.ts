import { logger } from './logger.js';
import {
  PackageReadmeMcpError,
  PackageNotFoundError,
  VersionNotFoundError,
  RateLimitError,
  NetworkError,
} from '../types/index.js';

export function handleApiError(error: unknown, context: string): never {
  logger.error(`API Error in ${context}`, { error });

  if (error instanceof PackageReadmeMcpError) {
    throw error;
  }

  if (error instanceof Error) {
    // Check for specific error types and convert them
    const message = error.message.toLowerCase();
    
    if (message.includes('package not found') || message.includes('404')) {
      throw new PackageNotFoundError('Unknown package');
    }
    
    if (message.includes('rate limit') || message.includes('429')) {
      throw new RateLimitError(context);
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      throw new NetworkError(error.message, error);
    }
    
    // Generic network error
    throw new NetworkError(`API call failed: ${error.message}`, error);
  }

  // Unknown error type
  throw new NetworkError(`Unknown error in ${context}: ${String(error)}`);
}

export function handleHttpError(
  status: number, 
  response: Response, 
  context: string
): never {
  logger.error(`HTTP Error ${status} in ${context}`, { 
    status, 
    statusText: response.statusText,
    url: response.url,
  });

  switch (status) {
    case 404:
      throw new PackageNotFoundError('Package not found');
    case 429:
      const retryAfter = response.headers.get('retry-after');
      throw new RateLimitError(context, retryAfter ? parseInt(retryAfter) : undefined);
    case 401:
      throw new NetworkError('Authentication failed');
    case 403:
      throw new NetworkError('Access forbidden');
    case 500:
    case 502:
    case 503:
    case 504:
      throw new NetworkError(`Server error (${status}): ${response.statusText}`);
    default:
      throw new NetworkError(`HTTP error (${status}): ${response.statusText}`);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  context: string = 'unknown'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Attempting ${context} (attempt ${attempt}/${maxRetries})`);
      const result = await fn();
      
      if (attempt > 1) {
        logger.info(`${context} succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry certain errors
      if (error instanceof PackageNotFoundError || 
          error instanceof VersionNotFoundError ||
          (error instanceof PackageReadmeMcpError && error.statusCode === 404)) {
        logger.debug(`Not retrying ${context} due to 404 error`);
        throw error;
      }

      if (attempt === maxRetries) {
        logger.error(`${context} failed after ${maxRetries} attempts`, { error: lastError });
        break;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 0.1 * delay; // Add up to 10% jitter
      const totalDelay = delay + jitter;
      
      logger.warn(`${context} failed on attempt ${attempt}, retrying in ${Math.round(totalDelay)}ms`, { 
        error: lastError.message,
        attempt,
        maxRetries,
      });
      
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  // All retries failed
  throw lastError || new NetworkError(`All retry attempts failed for ${context}`);
}

export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfter?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  if (error instanceof PackageReadmeMcpError) {
    // Don't retry client errors (4xx), but retry server errors (5xx)
    return error.statusCode ? error.statusCode >= 500 : true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network-related errors
    return message.includes('timeout') || 
           message.includes('network') || 
           message.includes('fetch') ||
           message.includes('econnreset') ||
           message.includes('econnrefused') ||
           message.includes('enotfound');
  }

  return false;
}

export function getRetryDelay(error: unknown, attempt: number, baseDelay: number = 1000): number {
  if (error instanceof RateLimitError && error.details?.retryAfter) {
    return (error.details.retryAfter as number) * 1000; // Convert to milliseconds
  }

  if (error instanceof RetryableError && error.retryAfter) {
    return error.retryAfter * 1000; // Convert to milliseconds
  }

  // Exponential backoff with jitter
  const delay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.1 * delay;
  return delay + jitter;
}