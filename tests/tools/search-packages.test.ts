import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { searchPackages } from '../../src/tools/search-packages.js';
import { artifactHubClient } from '../../src/services/artifact-hub-api.js';
import { cache } from '../../src/services/cache.js';
import type { SearchPackagesResponse } from '../../src/types/index.js';

vi.mock('../../src/services/artifact-hub-api.js');
vi.mock('../../src/services/cache.js');

describe('search-packages tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.get).mockReturnValue(null);
    vi.mocked(cache.generateSearchKey).mockReturnValue('test-search-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should validate required parameters', async () => {
    await expect(searchPackages({} as any)).rejects.toThrow();
  });

  test('should validate parameter types', async () => {
    await expect(searchPackages({ query: 123 } as any)).rejects.toThrow();
  });

  test('should validate limit parameter type', async () => {
    await expect(searchPackages({ query: 'nginx', limit: 'invalid' } as any)).rejects.toThrow();
  });

  test('should validate query is not empty', async () => {
    await expect(searchPackages({ query: '' })).rejects.toThrow();
  });

  test('should return cached response when available', async () => {
    const cachedResponse: SearchPackagesResponse = {
      query: 'nginx',
      total: 1,
      packages: [{
        name: 'stable/nginx',
        version: '1.0.0',
        description: 'NGINX server',
        keywords: ['nginx', 'web-server'],
        repository: {
          name: 'stable',
          display_name: 'Helm Stable',
          url: 'https://charts.helm.sh/stable'
        },
        maintainers: [],
        app_version: '1.25.0',
        created_at: '2023-01-01T00:00:00.000Z',
        deprecated: false,
        signed: true,
        stars: 42
      }]
    };

    vi.mocked(cache.get).mockReturnValue(cachedResponse);

    const result = await searchPackages({ query: 'nginx' });

    expect(result).toEqual(cachedResponse);
    expect(cache.get).toHaveBeenCalledWith('test-search-key');
    expect(artifactHubClient.searchPackages).not.toHaveBeenCalled();
  });

  test('should successfully search packages with defaults', async () => {
    const mockSearchResults = {
      data: {
        packages: [
          {
            name: 'nginx',
            version: '1.0.0',
            description: 'NGINX server',
            keywords: ['nginx', 'web-server'],
            repository: {
              name: 'stable',
              display_name: 'Helm Stable',
              url: 'https://charts.helm.sh/stable'
            },
            maintainers: [
              { name: 'Test Maintainer', email: 'test@example.com' }
            ],
            app_version: '1.25.0',
            created_at: 1672531200, // 2023-01-01 00:00:00 UTC
            deprecated: false,
            signed: true,
            stars: 42
          }
        ]
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ query: 'nginx' });

    expect(artifactHubClient.searchPackages).toHaveBeenCalledWith('nginx', 20);
    expect(result.query).toBe('nginx');
    expect(result.total).toBe(1);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toEqual({
      name: 'stable/nginx',
      version: '1.0.0',
      description: 'NGINX server',
      keywords: ['nginx', 'web-server'],
      repository: {
        name: 'stable',
        display_name: 'Helm Stable',
        url: 'https://charts.helm.sh/stable'
      },
      maintainers: [{ name: 'Test Maintainer', email: 'test@example.com' }],
      app_version: '1.25.0',
      created_at: '2023-01-01T00:00:00.000Z',
      deprecated: false,
      signed: true,
      stars: 42
    });
  });

  test('should handle custom limit parameter', async () => {
    const mockSearchResults = {
      data: {
        packages: []
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    await searchPackages({ query: 'nginx', limit: 10 });

    expect(artifactHubClient.searchPackages).toHaveBeenCalledWith('nginx', 10);
  });

  test('should ignore quality and popularity parameters', async () => {
    const mockSearchResults = {
      data: {
        packages: []
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ 
      query: 'nginx', 
      quality: 0.8, 
      popularity: 0.9 
    });

    expect(artifactHubClient.searchPackages).toHaveBeenCalledWith('nginx', 20);
    expect(result.packages).toEqual([]);
  });

  test('should handle empty search results', async () => {
    const mockSearchResults = {
      data: {
        packages: []
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ query: 'nonexistent' });

    expect(result.query).toBe('nonexistent');
    expect(result.total).toBe(0);
    expect(result.packages).toEqual([]);
  });

  test('should handle invalid search results structure', async () => {
    const mockSearchResults = {
      data: null
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ query: 'nginx' });

    expect(result.query).toBe('nginx');
    expect(result.total).toBe(0);
    expect(result.packages).toEqual([]);
  });

  test('should handle packages with minimal information', async () => {
    const mockSearchResults = {
      data: {
        packages: [
          {
            name: 'simple-chart',
            version: '1.0.0',
            repository: {
              name: 'stable'
            },
            created_at: 1672531200
          }
        ]
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ query: 'simple' });

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toEqual({
      name: 'stable/simple-chart',
      version: '1.0.0',
      description: undefined,
      keywords: [],
      repository: {
        name: 'stable',
        display_name: 'stable',
        url: undefined
      },
      maintainers: [],
      app_version: undefined,
      created_at: '2023-01-01T00:00:00.000Z',
      deprecated: undefined,
      signed: undefined,
      stars: undefined
    });
  });

  test('should cache successful responses with short TTL', async () => {
    const mockSearchResults = {
      data: {
        packages: [{
          name: 'nginx',
          version: '1.0.0',
          repository: { name: 'stable' },
          created_at: 1672531200
        }]
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    await searchPackages({ query: 'nginx' });

    expect(cache.set).toHaveBeenCalledWith('test-search-key', expect.objectContaining({
      query: 'nginx',
      total: 1
    }), 300000); // 5 minutes
  });

  test('should sanitize search query', async () => {
    const mockSearchResults = {
      data: {
        packages: []
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    await searchPackages({ query: '  nginx  ' });

    // Query should be sanitized before being passed to the API
    expect(artifactHubClient.searchPackages).toHaveBeenCalledWith('nginx', 20);
  });

  test('should handle complex package data transformation', async () => {
    const mockSearchResults = {
      data: {
        packages: [
          {
            name: 'complex-app',
            version: '2.1.0',
            description: 'A complex application chart',
            keywords: ['app', 'microservice', 'database'],
            repository: {
              name: 'bitnami',
              display_name: 'Bitnami Charts',
              url: 'https://charts.bitnami.com/bitnami'
            },
            maintainers: [
              { name: 'Maintainer One', email: 'one@example.com' },
              { name: 'Maintainer Two', email: 'two@example.com' }
            ],
            app_version: '3.4.5',
            created_at: 1672531200,
            deprecated: true,
            signed: false,
            stars: 156
          }
        ]
      }
    };

    vi.mocked(artifactHubClient.searchPackages).mockResolvedValue(mockSearchResults);

    const result = await searchPackages({ query: 'complex' });

    expect(result.packages[0]).toEqual({
      name: 'bitnami/complex-app',
      version: '2.1.0',
      description: 'A complex application chart',
      keywords: ['app', 'microservice', 'database'],
      repository: {
        name: 'bitnami',
        display_name: 'Bitnami Charts',
        url: 'https://charts.bitnami.com/bitnami'
      },
      maintainers: [
        { name: 'Maintainer One', email: 'one@example.com' },
        { name: 'Maintainer Two', email: 'two@example.com' }
      ],
      app_version: '3.4.5',
      created_at: '2023-01-01T00:00:00.000Z',
      deprecated: true,
      signed: false,
      stars: 156
    });
  });

  test('should handle API errors gracefully', async () => {
    vi.mocked(artifactHubClient.searchPackages).mockRejectedValue(new Error('API Error'));

    await expect(searchPackages({ query: 'nginx' })).rejects.toThrow('API Error');
  });
});