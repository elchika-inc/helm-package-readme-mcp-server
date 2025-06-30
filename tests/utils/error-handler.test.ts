import { describe, it, expect } from 'vitest';
import {
  PackageReadmeMcpError,
  PackageNotFoundError,
  NetworkError,
  RateLimitError,
  VersionNotFoundError,
  InvalidPackageNameError
} from '../../src/types/index.js';
import { handleApiError } from '../../src/utils/error-handler.js';

describe('Error Handler', () => {
  describe('PackageReadmeMcpError', () => {
    it('should create base error with correct properties', () => {
      const error = new PackageReadmeMcpError('Test error', 'TEST_ERROR', 500);
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('PackageReadmeMcpError');
      expect(error instanceof Error).toBe(true);
    });

    it('should include details when provided', () => {
      const details = { packageName: 'test-package', version: '1.0.0' };
      const error = new PackageReadmeMcpError('Test error', 'TEST_ERROR', 500, details);
      
      expect(error.details).toEqual(details);
    });

    it('should work without statusCode', () => {
      const error = new PackageReadmeMcpError('Test error', 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('PackageNotFoundError', () => {
    it('should create PackageNotFoundError with correct properties', () => {
      const error = new PackageNotFoundError('test-package');
      
      expect(error.message).toBe("Package 'test-package' not found");
      expect(error.code).toBe('PACKAGE_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('PackageReadmeMcpError');
    });
  });

  describe('VersionNotFoundError', () => {
    it('should create VersionNotFoundError with correct properties', () => {
      const error = new VersionNotFoundError('test-package', '1.0.0');
      
      expect(error.message).toBe("Version '1.0.0' of package 'test-package' not found");
      expect(error.code).toBe('VERSION_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('NetworkError', () => {
    it('should create NetworkError with correct properties', () => {
      const originalError = new Error('Connection failed');
      const error = new NetworkError('Connection failed', originalError);
      
      expect(error.message).toBe('Network error: Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.details).toBe(originalError);
    });

    it('should work without original error', () => {
      const error = new NetworkError('Connection failed');
      
      expect(error.message).toBe('Network error: Connection failed');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.details).toBeUndefined();
    });
  });

  describe('RateLimitError', () => {
    it('should create RateLimitError with correct properties', () => {
      const error = new RateLimitError('Artifact Hub');
      
      expect(error.message).toBe('Rate limit exceeded for Artifact Hub');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
    });

    it('should include retry after information', () => {
      const error = new RateLimitError('Artifact Hub', 3600);
      
      expect(error.details).toEqual({ retryAfter: 3600 });
    });
  });

  describe('InvalidPackageNameError', () => {
    it('should create InvalidPackageNameError with correct properties', () => {
      const error = new InvalidPackageNameError('invalid-name');
      
      expect(error.message).toBe("Invalid package name format: 'invalid-name'. Expected format: 'repo/chart'");
      expect(error.code).toBe('INVALID_PACKAGE_NAME');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('handleApiError', () => {
    it('should re-throw PackageReadmeMcpError as is', () => {
      const originalError = new PackageNotFoundError('test-package');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(PackageNotFoundError);
    });

    it('should convert generic Error with "package not found" message', () => {
      const originalError = new Error('Package not found in registry');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(PackageNotFoundError);
    });

    it('should convert generic Error with "404" message', () => {
      const originalError = new Error('HTTP 404 Not Found');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(PackageNotFoundError);
    });

    it('should convert generic Error with rate limit message', () => {
      const originalError = new Error('Rate limit exceeded');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(RateLimitError);
    });

    it('should convert generic Error with 429 status', () => {
      const originalError = new Error('HTTP 429 Too Many Requests');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(RateLimitError);
    });

    it('should convert generic Error with network message', () => {
      const originalError = new Error('Network connection failed');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(NetworkError);
    });

    it('should convert generic Error with fetch message', () => {
      const originalError = new Error('Fetch request failed');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(NetworkError);
    });

    it('should convert other generic Errors to NetworkError', () => {
      const originalError = new Error('Some other error');
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(NetworkError);
    });

    it('should convert non-Error objects to NetworkError', () => {
      const originalError = 'String error';
      
      expect(() => handleApiError(originalError, 'test context')).toThrow(NetworkError);
    });

    it('should convert null/undefined to NetworkError', () => {
      expect(() => handleApiError(null, 'test context')).toThrow(NetworkError);
      expect(() => handleApiError(undefined, 'test context')).toThrow(NetworkError);
    });
  });

  describe('error inheritance and type checking', () => {
    it('should maintain proper inheritance chain', () => {
      const error = new PackageNotFoundError('test');
      
      expect(error instanceof PackageNotFoundError).toBe(true);
      expect(error instanceof PackageReadmeMcpError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should allow type checking with instanceof', () => {
      const errors = [
        new PackageNotFoundError('test'),
        new NetworkError('network'),
        new RateLimitError('service'),
        new VersionNotFoundError('pkg', '1.0.0'),
        new InvalidPackageNameError('invalid'),
        new Error('generic')
      ];

      expect(errors[0] instanceof PackageNotFoundError).toBe(true);
      expect(errors[1] instanceof NetworkError).toBe(true);
      expect(errors[2] instanceof RateLimitError).toBe(true);
      expect(errors[3] instanceof VersionNotFoundError).toBe(true);
      expect(errors[4] instanceof InvalidPackageNameError).toBe(true);
      expect(errors[5] instanceof Error).toBe(true);
    });
  });

  describe('error serialization', () => {
    it('should serialize error properties correctly', () => {
      const error = new PackageNotFoundError('test-package');
      const serialized = JSON.parse(JSON.stringify(error));
      
      expect(serialized.message).toBe("Package 'test-package' not found");
      expect(serialized.name).toBe('PackageReadmeMcpError');
    });

    it('should handle errors with details', () => {
      const details = { packageName: 'test', version: '1.0.0' };
      const error = new PackageReadmeMcpError('Test error', 'TEST_ERROR', 500, details);
      
      // Should not throw when converting to JSON
      expect(() => JSON.stringify(error)).not.toThrow();
    });
  });
});