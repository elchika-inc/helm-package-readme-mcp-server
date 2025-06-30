import { expect, test, describe, vi, beforeEach, afterEach } from "vitest";
import { getPackageReadme } from '../../src/tools/get-package-readme.js';
import { artifactHubClient } from '../../src/services/artifact-hub-api.js';
import { githubApi } from '../../src/services/github-api.js';
import { readmeParser } from '../../src/services/readme-parser.js';
import { cache } from '../../src/services/cache.js';
import type { PackageReadmeResponse } from '../../src/types/index.js';

vi.mock('../../src/services/artifact-hub-api.js');
vi.mock('../../src/services/github-api.js');
vi.mock('../../src/services/readme-parser.js');
vi.mock('../../src/services/cache.js');

describe('get-package-readme tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.get).mockReturnValue(null);
    vi.mocked(cache.generatePackageReadmeKey).mockReturnValue('test-key');
    vi.mocked(readmeParser.cleanMarkdown).mockImplementation((content) => content);
    vi.mocked(readmeParser.extractDescription).mockReturnValue('Test description');
    vi.mocked(readmeParser.parseUsageExamples).mockReturnValue([]);
    vi.mocked(readmeParser.extractValuesDocumentation).mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should validate required parameters', async () => {
    await expect(getPackageReadme({} as any)).rejects.toThrow('Package name is required');
  });

  test('should validate parameter types', async () => {
    await expect(getPackageReadme({ package_name: 123 } as any)).rejects.toThrow();
  });

  test('should validate package name format', async () => {
    await expect(getPackageReadme({ package_name: '' })).rejects.toThrow('Package name is required');
  });

  test('should return cached response when available', async () => {
    const cachedResponse: PackageReadmeResponse = {
      package_name: 'stable/nginx',
      version: 'latest',
      description: 'Cached nginx chart',
      readme_content: 'Cached README',
      usage_examples: [],
      installation: { command: 'helm install my-nginx stable/nginx' },
      basic_info: {
        name: 'nginx',
        version: 'latest',
        description: 'Cached nginx chart',
        maintainers: [],
        keywords: [],
      },
      exists: true,
    };

    vi.mocked(cache.get).mockReturnValue(cachedResponse);

    const result = await getPackageReadme({ package_name: 'stable/nginx' });

    expect(result).toEqual(cachedResponse);
    expect(cache.get).toHaveBeenCalledWith('test-key');
    expect(artifactHubClient.getPackageInfo).not.toHaveBeenCalled();
  });

  test('should handle package not found', async () => {
    vi.mocked(artifactHubClient.getPackageInfo).mockRejectedValue(new Error('Package not found'));

    const result = await getPackageReadme({ package_name: 'non-existent/package' });

    expect(result.exists).toBe(false);
    expect(result.package_name).toBe('non-existent/package');
    expect(result.version).toBe('latest');
    expect(result.readme_content).toBe('');
  });

  test('should successfully get package README with defaults', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: 'This is the README content',
      maintainers: [{ name: 'Test Maintainer', email: 'test@example.com' }],
      keywords: ['nginx', 'web-server'],
      repository: {
        url: 'https://github.com/example/charts',
        name: 'example-charts'
      },
      relative_path: 'charts/nginx',
      license: 'MIT',
      home_url: 'https://nginx.org'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageReadme({ package_name: 'stable/nginx' });

    expect(result.exists).toBe(true);
    expect(result.package_name).toBe('stable/nginx');
    expect(result.version).toBe('1.0.0');
    expect(result.description).toBe('NGINX Helm chart');
    expect(result.readme_content).toBe('This is the README content');
    expect(result.basic_info.maintainers).toHaveLength(1);
    expect(result.basic_info.keywords).toEqual(['nginx', 'web-server']);
    expect(result.installation.command).toBe('helm install my-nginx stable/nginx');
  });

  test('should fetch README from GitHub when not available in package info', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: '',
      repository: {
        url: 'https://github.com/example/charts',
        name: 'example-charts'
      },
      relative_path: 'charts/nginx'
    };

    const githubReadme = 'README from GitHub';

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(githubApi.getReadmeContent).mockResolvedValue(githubReadme);

    const result = await getPackageReadme({ package_name: 'stable/nginx' });

    expect(githubApi.getReadmeContent).toHaveBeenCalledWith({
      type: 'git',
      url: 'https://github.com/example/charts',
      directory: 'charts/nginx'
    });
    expect(result.readme_content).toBe(githubReadme);
  });

  test('should include usage examples when requested', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: 'README with examples'
    };

    const mockUsageExamples = [
      { title: 'Basic Usage', code: 'helm install nginx stable/nginx', language: 'bash' }
    ];

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(readmeParser.parseUsageExamples).mockReturnValue(mockUsageExamples);

    const result = await getPackageReadme({ 
      package_name: 'stable/nginx',
      include_examples: true 
    });

    expect(readmeParser.parseUsageExamples).toHaveBeenCalledWith('README with examples', true);
    expect(result.usage_examples).toEqual(mockUsageExamples);
  });

  test('should exclude usage examples when not requested', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: 'README content'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageReadme({ 
      package_name: 'stable/nginx',
      include_examples: false 
    });

    expect(readmeParser.parseUsageExamples).not.toHaveBeenCalled();
    expect(result.usage_examples).toEqual([]);
  });

  test('should handle specific version', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.2.3',
      description: 'NGINX Helm chart',
      readme: 'README content'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    const result = await getPackageReadme({ 
      package_name: 'stable/nginx',
      version: '1.2.3'
    });

    expect(artifactHubClient.getPackageInfo).toHaveBeenCalledWith('stable/nginx', '1.2.3');
    expect(result.version).toBe('1.2.3');
    expect(result.installation.alternatives).toContain('helm install my-nginx stable/nginx --version 1.2.3');
  });

  test('should cache successful responses', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: 'README content'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);

    await getPackageReadme({ package_name: 'stable/nginx' });

    expect(cache.set).toHaveBeenCalledWith('test-key', expect.objectContaining({
      package_name: 'stable/nginx',
      version: '1.0.0',
      exists: true
    }));
  });

  test('should handle GitHub README fetch failure gracefully', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: '',
      repository: {
        url: 'https://github.com/example/charts',
        name: 'example-charts'
      },
      relative_path: 'charts/nginx'
    };

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(githubApi.getReadmeContent).mockRejectedValue(new Error('GitHub API error'));

    const result = await getPackageReadme({ package_name: 'stable/nginx' });

    expect(result.exists).toBe(true);
    expect(result.readme_content).toBe('No README available');
  });

  test('should handle values.yaml fetch for usage examples', async () => {
    const mockPackageInfo = {
      name: 'nginx',
      version: '1.0.0',
      description: 'NGINX Helm chart',
      readme: 'README content'
    };

    const mockValuesExamples = [
      { title: 'Values Configuration', code: 'replicaCount: 2', language: 'yaml' }
    ];

    vi.mocked(artifactHubClient.getPackageInfo).mockResolvedValue(mockPackageInfo);
    vi.mocked(artifactHubClient.getPackageValues).mockResolvedValue('values.yaml content');
    vi.mocked(readmeParser.extractValuesDocumentation).mockReturnValue(mockValuesExamples);

    const result = await getPackageReadme({ 
      package_name: 'stable/nginx',
      include_examples: true 
    });

    expect(artifactHubClient.getPackageValues).toHaveBeenCalledWith('stable', 'nginx', 'latest');
    expect(readmeParser.extractValuesDocumentation).toHaveBeenCalledWith('values.yaml content');
    expect(result.usage_examples).toEqual(mockValuesExamples);
  });
});