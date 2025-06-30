import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubApi } from '../../src/services/github-api.js';
import { PackageNotFoundError, NetworkError, RateLimitError } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GitHubApi', () => {
  let api: GitHubApi;

  beforeEach(() => {
    api = new GitHubApi();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getReadmeContent', () => {
    it('should get README content successfully', async () => {
      const mockReadmeResponse = {
        content: Buffer.from('# Test README\n\nThis is a test README').toString('base64'),
        encoding: 'base64'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockReadmeResponse)
      });

      const result = await api.getReadmeContent('owner', 'repo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/readme',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': expect.stringContaining('helm-package-readme-mcp-server')
          })
        })
      );
      expect(result).toBe('# Test README\n\nThis is a test README');
    });

    it('should handle GitHub token authentication', async () => {
      const apiWithToken = new GitHubApi('test-token');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: Buffer.from('# README').toString('base64'),
          encoding: 'base64'
        })
      });

      await apiWithToken.getReadmeContent('owner', 'repo');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'token test-token'
          })
        })
      );
    });

    it('should throw PackageNotFoundError for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(api.getReadmeContent('owner', 'repo')).rejects.toThrow(PackageNotFoundError);
    });

    it('should throw RateLimitError for 403 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Map([['X-RateLimit-Remaining', '0']])
      });

      await expect(api.getReadmeContent('owner', 'repo')).rejects.toThrow(RateLimitError);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.getReadmeContent('owner', 'repo')).rejects.toThrow(NetworkError);
    });

    it('should handle non-base64 encoded content', async () => {
      const mockReadmeResponse = {
        content: '# Direct README content',
        encoding: 'utf-8'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockReadmeResponse)
      });

      const result = await api.getReadmeContent('owner', 'repo');
      expect(result).toBe('# Direct README content');
    });

    it('should handle empty README content', async () => {
      const mockReadmeResponse = {
        content: '',
        encoding: 'base64'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockReadmeResponse)
      });

      const result = await api.getReadmeContent('owner', 'repo');
      expect(result).toBe('');
    });
  });

  describe('getRepositoryInfo', () => {
    it('should get repository info successfully', async () => {
      const mockRepoResponse = {
        name: 'test-repo',
        full_name: 'owner/test-repo',
        description: 'A test repository',
        html_url: 'https://github.com/owner/test-repo',
        clone_url: 'https://github.com/owner/test-repo.git',
        stargazers_count: 100,
        forks_count: 25,
        language: 'TypeScript',
        default_branch: 'main'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRepoResponse)
      });

      const result = await api.getRepositoryInfo('owner', 'repo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        expect.objectContaining({
          method: 'GET'
        })
      );
      expect(result).toEqual(mockRepoResponse);
    });

    it('should throw PackageNotFoundError for non-existent repository', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(api.getRepositoryInfo('owner', 'nonexistent')).rejects.toThrow(PackageNotFoundError);
    });
  });

  describe('extractGitHubUrl', () => {
    it('should extract GitHub URL from Helm chart repository', () => {
      const testCases = [
        {
          input: 'https://github.com/owner/repo',
          expected: { owner: 'owner', repo: 'repo' }
        },
        {
          input: 'https://github.com/owner/repo.git',
          expected: { owner: 'owner', repo: 'repo' }
        },
        {
          input: 'git+https://github.com/owner/repo.git',
          expected: { owner: 'owner', repo: 'repo' }
        },
        {
          input: 'https://github.com/owner/repo/tree/main',
          expected: { owner: 'owner', repo: 'repo' }
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = api.extractGitHubUrl(input);
        expect(result).toEqual(expected);
      });
    });

    it('should return null for non-GitHub URLs', () => {
      const testCases = [
        'https://gitlab.com/owner/repo',
        'https://bitbucket.org/owner/repo',
        'https://example.com/repo',
        '',
        'not-a-url'
      ];

      testCases.forEach(input => {
        const result = api.extractGitHubUrl(input);
        expect(result).toBeNull();
      });
    });
  });

  describe('private methods', () => {
    it('should handle response with proper error handling', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(api.getReadmeContent('owner', 'repo')).rejects.toThrow(NetworkError);
    });

    it('should decode base64 content correctly', async () => {
      const originalContent = '# Test README\n\nThis is a test with special characters: áéíóú';
      const base64Content = Buffer.from(originalContent, 'utf-8').toString('base64');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          content: base64Content,
          encoding: 'base64'
        })
      });

      const result = await api.getReadmeContent('owner', 'repo');
      expect(result).toBe(originalContent);
    });
  });
});