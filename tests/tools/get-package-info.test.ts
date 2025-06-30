import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { getPackageInfo } from '../../src/tools/get-package-info.js';
import { artifactHubClient } from '../../src/services/artifact-hub-api.js';
import { cache } from '../../src/services/cache.js';
import type { PackageInfoResponse } from '../../src/types/index.js';

vi.mock('../../src/services/artifact-hub-api.js');
vi.mock('../../src/services/cache.js');

describe('get-package-info tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.get).mockReturnValue(null);
    vi.mocked(cache.generatePackageInfoKey).mockReturnValue('test-info-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should validate required parameters', async () => {
    await expect(getPackageInfo({} as any)).rejects.toThrow('Package name is required');
  });

  test('should validate parameter types', async () => {
    await expect(getPackageInfo({ package_name: 123 } as any)).rejects.toThrow();
  });

  test('should validate package name format', async () => {
    await expect(getPackageInfo({ package_name: '' })).rejects.toThrow('Package name is required');
  });

  test('should return cached response when available', async () => {
    const cachedResponse: PackageInfoResponse = {
      package_name: 'stable/nginx',
      latest_version: '1.0.0',
      description: 'NGINX Helm chart',
      author: 'Test Maintainer',
      maintainers: [{ name: 'Test Maintainer', email: 'test@example.com' }],
      keywords: ['nginx', 'web-server'],
      download_stats: { last_day: 10, last_week: 70, last_month: 300 },
      exists: true,
    };

    vi.mocked(cache.get).mockReturnValue(cachedResponse);

    const result = await getPackageInfo({ package_name: 'stable/nginx' });

    expect(result).toEqual(cachedResponse);
    expect(cache.get).toHaveBeenCalledWith('test-info-key');
    expect(artifactHubClient.getPackageInfo).not.toHaveBeenCalled();
  });

  test('should handle package not found', async () => {
    vi.mocked(artifactHubClient.getPackageInfo).mockRejectedValue(new Error('Package not found'));

    const result = await getPackageInfo({ package_name: 'non-existent/package' });

    expect(result.exists).toBe(false);
    expect(result.package_name).toBe('non-existent/package');
    expect(result.latest_version).toBe('');
    expect(result.description).toBe('');
    expect(result.download_stats).toEqual({ last_day: 0, last_week: 0, last_month: 0 });
  });

  test('should successfully get package info with defaults', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      maintainers: [
        { name: 'Test Maintainer', email: 'test@example.com' },
        { name: 'Another Maintainer', email: 'another@example.com' }
      ],
      keywords: ['nginx', 'web-server'],
      license: 'MIT',
      stars: 42,
      repository: {
        url: 'https://github.com/example/charts',
        name: 'example-charts'
      },
      relative_path: 'charts/nginx',
      app_version: '1.25.0',
      deprecated: false,
      signed: true
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageInfo({ package_name: 'stable/nginx' });

    expect(result.exists).toBe(true);
    expect(result.package_name).toBe('stable/nginx');
    expect(result.latest_version).toBe('1.0.0');
    expect(result.description).toBe('NGINX Helm chart');
    expect(result.author).toBe('Test Maintainer');
    expect(result.maintainers).toHaveLength(2);
    expect(result.license).toBe('MIT');
    expect(result.keywords).toEqual(['nginx', 'web-server']);
    expect(result.app_version).toBe('1.25.0');
    expect(result.deprecated).toBe(false);
    expect(result.signed).toBe(true);
    expect(result.download_stats.last_day).toBe(42);
    expect(result.repository).toEqual({
      type: 'git',
      url: 'https://github.com/example/charts',
      directory: 'charts/nginx'
    });
  });

  test('should handle package with minimal information', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'Basic NGINX chart'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageInfo({ package_name: 'stable/nginx' });

    expect(result.exists).toBe(true);
    expect(result.author).toBe('Unknown');
    expect(result.maintainers).toEqual([]);
    expect(result.keywords).toEqual([]);
    expect(result.download_stats.last_day).toBe(0);
    expect(result.repository).toBeUndefined();
  });

  test('should include dependencies when requested', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart'
    };

    const mockValuesContent = `
dependencies:
  - name: common
    version: 1.0.0
    repository: https://charts.bitnami.com/bitnami
  - name: postgresql
    version: 11.0.0
`;

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockResolvedValue(mockValuesContent);

    const result = await getPackageInfo({ 
      package_name: 'stable/nginx',
      include_dependencies: true 
    });

    expect(artifactHubClient.getPackageValues).toHaveBeenCalledWith('stable', 'nginx');
    expect(result.dependencies).toEqual({
      'common': '1.0.0',
      'postgresql': '11.0.0'
    });
  });

  test('should exclude dependencies when not requested', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageInfo({ 
      package_name: 'stable/nginx',
      include_dependencies: false 
    });

    expect(artifactHubClient.getPackageValues).not.toHaveBeenCalled();
    expect(result.dependencies).toBeUndefined();
  });

  test('should handle dev dependencies parameter', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockResolvedValue('');

    const result = await getPackageInfo({ 
      package_name: 'stable/nginx',
      include_dev_dependencies: true 
    });

    expect(result.dev_dependencies).toBeUndefined();
  });

  test('should cache successful responses', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    await getPackageInfo({ package_name: 'stable/nginx' });

    expect(cache.set).toHaveBeenCalledWith('test-info-key', expect.objectContaining({
      package_name: 'stable/nginx',
      latest_version: '1.0.0',
      exists: true
    }));
  });

  test('should handle dependencies parsing failure gracefully', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockRejectedValue(new Error('Values fetch failed'));

    const result = await getPackageInfo({ 
      package_name: 'stable/nginx',
      include_dependencies: true 
    });

    expect(result.exists).toBe(true);
    expect(result.dependencies).toBeUndefined();
  });

  test('should parse complex dependencies correctly', async () => {
    const mockPackageInfo = {
      name: 'complex-app',
      version: '2.0.0',
      description: 'Complex application chart'
    };

    const mockValuesContent = `
# Chart dependencies
dependencies:
  - name: postgresql
    version: ~11.0.0
    repository: https://charts.bitnami.com/bitnami
  - name: redis
    version: ^6.0.0
    repository: https://charts.bitnami.com/bitnami
  - name: nginx
    version: 1.2.3
`;

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockResolvedValue(mockValuesContent);

    const result = await getPackageInfo({ 
      package_name: 'stable/complex-app',
      include_dependencies: true 
    });

    expect(result.dependencies).toEqual({
      'postgresql': '~11.0.0',
      'redis': '^6.0.0',
      'nginx': '1.2.3'
    });
  });

  test('should handle empty dependencies section', async () => {
    const mockPackageInfo = {
      name: 'simple-app',
      version: '1.0.0',
      description: 'Simple application chart'
    };

    const mockValuesContent = `
# No dependencies
some_config: value
`;

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockResolvedValue(mockValuesContent);

    const result = await getPackageInfo({ 
      package_name: 'stable/simple-app',
      include_dependencies: true 
    });

    expect(result.dependencies).toEqual({});
  });
});