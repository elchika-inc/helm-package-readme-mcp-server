import { logger } from '../utils/logger.js';
import { handleApiError, handleHttpError, withRetry } from '../utils/error-handler.js';
import type { GitHubReadmeResponse, RepositoryInfo } from '../types/index.js';

export class GitHubApiClient {
  private readonly baseUrl = 'https://api.github.com';
  private readonly rawUrl = 'https://raw.githubusercontent.com';
  private readonly timeout: number;
  private readonly token?: string;

  constructor(timeout?: number, token?: string) {
    this.timeout = timeout || 30000;
    this.token = token || process.env.GITHUB_TOKEN || '';
  }

  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    try {
      // Handle various GitHub URL formats
      const patterns = [
        /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/?$)/,
        /^git\+https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/?$)/,
        /^git:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/?$)/,
        /^([^\/]+)\/([^\/]+)$/, // owner/repo format
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1] && match[2]) {
          return {
            owner: match[1],
            repo: match[2],
          };
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to parse GitHub URL: ${url}`, { error });
      return null;
    }
  }

  async getReadmeContent(repositoryInfo: RepositoryInfo): Promise<string | null> {
    const parsed = this.parseGitHubUrl(repositoryInfo.url);
    if (!parsed) {
      logger.warn(`Unable to parse GitHub URL: ${repositoryInfo.url}`);
      return null;
    }

    const { owner, repo } = parsed;
    
    // Try to get README via API first
    try {
      const apiContent = await this.getReadmeViaApi(owner, repo, repositoryInfo.directory);
      if (apiContent) {
        return apiContent;
      }
    } catch (error) {
      logger.debug(`GitHub API README fetch failed for ${owner}/${repo}, trying raw`, { error });
    }

    // Fallback to raw content
    return this.getReadmeViaRaw(owner, repo, repositoryInfo.directory);
  }

  private async getReadmeViaApi(owner: string, repo: string, directory?: string): Promise<string | null> {
    const path = directory ? `${directory}/README.md` : 'README.md';
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;

    return withRetry(async () => {
      logger.debug(`Fetching README via GitHub API: ${owner}/${repo}/${path}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const headers: Record<string, string> = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'helm-package-readme-mcp/1.0.0',
        };

        if (this.token) {
          headers['Authorization'] = `token ${this.token}`;
        }

        const response = await fetch(url, {
          signal: controller.signal,
          headers,
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Try alternative README filenames
            for (const filename of ['readme.md', 'README.rst', 'readme.rst', 'README.txt', 'readme.txt']) {
              const altPath = directory ? `${directory}/${filename}` : filename;
              const altUrl = `${this.baseUrl}/repos/${owner}/${repo}/contents/${altPath}`;
              
              try {
                const altResponse = await fetch(altUrl, {
                  signal: controller.signal,
                  headers,
                });
                
                if (altResponse.ok) {
                  const altData = await altResponse.json() as GitHubReadmeResponse;
                  const content = Buffer.from(altData.content, 'base64').toString('utf-8');
                  logger.debug(`Found alternative README: ${owner}/${repo}/${altPath}`);
                  return content;
                }
              } catch (altError) {
                // Continue trying other filenames
              }
            }
            
            return null; // No README found
          }
          
          handleHttpError(response.status, response, `GitHub API for ${owner}/${repo}/${path}`);
        }

        const data = await response.json() as GitHubReadmeResponse;
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        
        logger.debug(`Successfully fetched README via GitHub API: ${owner}/${repo}/${path}`);
        return content;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `GitHub API for ${owner}/${repo}/${path}`);
        }
        handleApiError(error, `GitHub API for ${owner}/${repo}/${path}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }, 3, 1000, `GitHub API getReadmeViaApi(${owner}/${repo})`);
  }

  private async getReadmeViaRaw(owner: string, repo: string, directory?: string): Promise<string | null> {
    const readmeFilenames = ['README.md', 'readme.md', 'README.rst', 'readme.rst', 'README.txt', 'readme.txt'];
    
    for (const filename of readmeFilenames) {
      const path = directory ? `${directory}/${filename}` : filename;
      const url = `${this.rawUrl}/${owner}/${repo}/main/${path}`;
      
      try {
        const content = await this.fetchRawContent(url, `${owner}/${repo}/${path}`);
        if (content) {
          logger.debug(`Found README via raw GitHub: ${owner}/${repo}/${path}`);
          return content;
        }
      } catch (error) {
        // Try next filename
      }
      
      // Also try master branch
      const masterUrl = `${this.rawUrl}/${owner}/${repo}/master/${path}`;
      try {
        const content = await this.fetchRawContent(masterUrl, `${owner}/${repo}/${path} (master)`);
        if (content) {
          logger.debug(`Found README via raw GitHub (master): ${owner}/${repo}/${path}`);
          return content;
        }
      } catch (error) {
        // Try next filename
      }
    }

    logger.debug(`No README found for ${owner}/${repo}`);
    return null;
  }

  private async fetchRawContent(url: string, context: string): Promise<string | null> {
    return withRetry(async () => {
      logger.debug(`Fetching raw content: ${context}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null; // File not found
          }
          handleHttpError(response.status, response, `GitHub raw for ${context}`);
        }

        const content = await response.text();
        logger.debug(`Successfully fetched raw content: ${context}`);
        return content;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `GitHub raw for ${context}`);
        }
        handleApiError(error, `GitHub raw for ${context}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }, 2, 1000, `GitHub Raw fetchRawContent(${context})`);
  }

  async checkRateLimit(): Promise<{
    limit: number;
    remaining: number;
    reset: Date;
  } | null> {
    if (!this.token) {
      return null; // No token, can't check authenticated rate limit
    }

    try {
      const response = await fetch(`${this.baseUrl}/rate_limit`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'User-Agent': 'helm-package-readme-mcp/1.0.0',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
      };
    } catch (error) {
      logger.warn('Failed to check GitHub rate limit', { error });
      return null;
    }
  }
}

export const githubApi = new GitHubApiClient();