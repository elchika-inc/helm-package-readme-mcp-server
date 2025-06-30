import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArtifactHubApi } from '../../src/services/artifact-hub-api.js';
import { PackageNotFoundError, NetworkError, RateLimitError } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ArtifactHubApi', () => {
  let api: ArtifactHubApi;

  beforeEach(() => {
    api = new ArtifactHubApi();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('searchPackages', () => {
    it('should search packages successfully', async () => {
      const mockResponse = {
        packages: [
          {
            package_id: 'test-package',
            name: 'test-package',
            display_name: 'Test Package',
            description: 'A test package',
            version: '1.0.0',
            app_version: '1.0.0',
            repository: {
              name: 'test-repo',
              display_name: 'Test Repository',
              url: 'https://example.com/charts'
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await api.searchPackages('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/search?facets=false&kind=0&limit=20&offset=0&ts_query_web=test'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('helm-package-readme-mcp-server')
          })
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle search with options', async () => {
      const mockResponse = { packages: [] };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      await api.searchPackages('test', { limit: 10, offset: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10&offset=5'),
        expect.any(Object)
      );
    });

    it('should throw PackageNotFoundError when no packages found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ packages: [] })
      });

      await expect(api.searchPackages('nonexistent')).rejects.toThrow(PackageNotFoundError);
    });

    it('should handle 404 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(api.searchPackages('test')).rejects.toThrow(PackageNotFoundError);
    });

    it('should handle 429 rate limit error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      await expect(api.searchPackages('test')).rejects.toThrow(RateLimitError);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.searchPackages('test')).rejects.toThrow(NetworkError);
    });
  });

  describe('getPackageInfo', () => {
    it('should get package info successfully', async () => {
      const mockResponse = {
        package_id: 'test-package',
        name: 'test-package',
        display_name: 'Test Package',
        description: 'A test package',
        version: '1.0.0',
        app_version: '1.0.0',
        available_versions: [
          { version: '1.0.0', created_at: 1234567890 }
        ],
        repository: {
          name: 'test-repo',
          display_name: 'Test Repository',  
          url: 'https://example.com/charts'
        },
        maintainers: [
          { name: 'Test Maintainer', email: 'test@example.com' }
        ],
        dependencies: [
          { name: 'dependency1', version: '>=1.0.0' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await api.getPackageInfo('test-package');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/helm/test-repo/test-package'),
        expect.objectContaining({
          method: 'GET'
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle package with specific version', async () => {
      const mockResponse = { name: 'test-package', version: '2.0.0' };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      await api.getPackageInfo('test-package', '2.0.0');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/2.0.0'),
        expect.any(Object)
      );
    });

    it('should throw PackageNotFoundError when package not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(api.getPackageInfo('nonexistent')).rejects.toThrow(PackageNotFoundError);
    });
  });

  describe('getPackageVersions', () => {
    it('should get package versions successfully', async () => {
      const mockResponse = [
        { version: '2.0.0', created_at: 1234567891 },
        { version: '1.0.0', created_at: 1234567890 }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await api.getPackageVersions('test-package');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/helm/test-repo/test-package/versions'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle empty versions response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve([])
      });

      await expect(api.getPackageVersions('test-package')).rejects.toThrow(PackageNotFoundError);
    });
  });

  describe('private methods', () => {
    it('should handle response correctly', async () => {
      const mockResponse = { data: 'test' };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await api.searchPackages('test');
      
      // This will trigger the private handleResponse method
      expect(result).toBeDefined();
    });

    it('should construct correct URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ packages: [{ name: 'test' }] })
      });

      await api.searchPackages('test-query');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ts_query_web=test-query'),
        expect.any(Object)
      );
    });
  });
});