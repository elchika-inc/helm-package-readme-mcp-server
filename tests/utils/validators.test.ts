import { describe, it, expect } from 'vitest';
import {
  validatePackageName,
  validateVersion,
  ValidationError
} from '../../src/utils/validators.js';
import { InvalidPackageNameError } from '../../src/types/index.js';

describe('Validators', () => {
  describe('validatePackageName', () => {
    it('should accept valid package names', () => {
      const validNames = [
        'stable/nginx',
        'bitnami/mysql',
        'my-repo/my-app',
        'repo123/app-name',
        'a/b',
        'test-repo/test-chart-v2'
      ];

      validNames.forEach(name => {
        expect(() => validatePackageName(name)).not.toThrow();
      });
    });

    it('should reject invalid package names', () => {
      const invalidNames = [
        '',
        '   ',
        'nginx',  // Missing repo part
        'stable/',  // Missing chart part
        '/nginx',  // Missing repo part
        'stable/nginx/extra',  // Too many parts
        'repo with spaces/nginx',
        'stable/chart with spaces',
        'repo@with@symbols/nginx',
        'stable/chart#with#hash'
      ];

      invalidNames.forEach(name => {
        expect(() => validatePackageName(name)).toThrow(InvalidPackageNameError);
      });
    });

    it('should provide proper error messages', () => {
      expect(() => validatePackageName('')).toThrow('Package name cannot be empty');
      expect(() => validatePackageName('nginx')).toThrow("Package name must be in format 'repo/chart'");
      expect(() => validatePackageName('stable/')).toThrow('Chart name cannot be empty');
    });

    it('should handle edge cases', () => {
      expect(() => validatePackageName('a/b')).not.toThrow(); // Minimum valid
      expect(() => validatePackageName('  stable/nginx  ')).not.toThrow(); // Trimmed
    });
  });

  describe('validateVersion', () => {
    it('should accept valid version strings', () => {
      const validVersions = [
        '1.0.0',
        '2.1.3',
        '10.0.0',
        '1.0.0-alpha',
        '1.0.0-beta.1',
        '1.0.0+build.1',
        'v1.0.0',
        'latest'
      ];

      validVersions.forEach(version => {
        expect(() => validateVersion(version)).not.toThrow();
      });
    });

    it('should accept undefined version', () => {
      expect(() => validateVersion(undefined)).not.toThrow();
    });

    it('should reject invalid versions', () => {
      const invalidVersions = [
        '',
        '   ',
        'invalid-version',
        'version with spaces'
      ];

      invalidVersions.forEach(version => {
        expect(() => validateVersion(version)).toThrow(ValidationError);
      });
    });

    it('should provide proper error message', () => {
      expect(() => validateVersion('')).toThrow('Version cannot be empty');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with message', () => {
      const error = new ValidationError('Test validation error');
      
      expect(error.message).toBe('Test validation error');
      expect(error.name).toBe('ValidationError');
      expect(error instanceof Error).toBe(true);
    });

    it('should include field information when provided', () => {
      const error = new ValidationError('Invalid value', 'packageName');
      
      expect(error.field).toBe('packageName');
    });

    it('should work without field parameter', () => {
      const error = new ValidationError('Invalid value');
      
      expect(error.field).toBeUndefined();
    });
  });

  describe('parameter type validation', () => {
    it('should handle type validation correctly', () => {
      // String type validation
      expect(() => validatePackageName('stable/nginx')).not.toThrow();
      expect(() => validateVersion('1.0.0')).not.toThrow();
    });

    it('should reject non-string package names', () => {
      expect(() => validatePackageName(null as any)).toThrow(InvalidPackageNameError);
      expect(() => validatePackageName(123 as any)).toThrow(InvalidPackageNameError);
      expect(() => validatePackageName({} as any)).toThrow(InvalidPackageNameError);
    });

    it('should reject non-string versions when provided', () => {
      expect(() => validateVersion(123 as any)).toThrow(ValidationError);
      expect(() => validateVersion({} as any)).toThrow(ValidationError);
    });
  });

  describe('boundary value testing', () => {
    it('should handle package name length limits', () => {
      // Test minimum valid package name
      expect(() => validatePackageName('a/b')).not.toThrow();
      
      // Test long but valid package names
      const longRepo = 'a'.repeat(50);
      const longChart = 'b'.repeat(50);
      expect(() => validatePackageName(`${longRepo}/${longChart}`)).not.toThrow();
    });

    it('should handle version boundary cases', () => {
      expect(() => validateVersion('0.0.1')).not.toThrow(); // Minimum semantic version
      expect(() => validateVersion('999.999.999')).not.toThrow(); // Large version numbers
    });
  });

  describe('character validation', () => {
    it('should allow valid characters in package names', () => {
      const validChars = [
        'repo-name/chart-name',
        'repo_name/chart_name',
        'repo123/chart456',
        'repo.name/chart.name'
      ];

      validChars.forEach(name => {
        expect(() => validatePackageName(name)).not.toThrow();
      });
    });

    it('should reject invalid characters in package names', () => {
      const invalidChars = [
        'repo@name/chart',
        'repo/chart#name',
        'repo!/chart',
        'repo/chart%name',
        'repo/chart space'
      ];

      invalidChars.forEach(name => {
        expect(() => validatePackageName(name)).toThrow(InvalidPackageNameError);
      });
    });
  });

  describe('whitespace handling', () => {
    it('should trim whitespace from package names', () => {
      expect(() => validatePackageName('  stable/nginx  ')).not.toThrow();
      expect(() => validatePackageName('\tstable/nginx\t')).not.toThrow();
    });

    it('should trim whitespace from versions', () => {
      expect(() => validateVersion('  1.0.0  ')).not.toThrow();
      expect(() => validateVersion('\t1.0.0\t')).not.toThrow();
    });
  });
});