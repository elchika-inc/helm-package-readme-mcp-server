import { logger } from '../utils/logger.js';
import { handleApiError, handleHttpError, withRetry } from '../utils/error-handler.js';
import type { 
  ArtifactHubPackage, 
  ArtifactHubSearchResponse,
} from '../types/index.js';
import {
  InvalidPackageNameError,
} from '../types/index.js';

export class ArtifactHubClient {
  private readonly baseUrl = 'https://artifacthub.io/api/v1';
  private readonly timeout: number;

  constructor(timeout?: number) {
    this.timeout = timeout || 30000;
  }

  private validatePackageName(packageName: string): { repo: string; chart: string } {
    const parts = packageName.split('/');
    if (parts.length !== 2) {
      throw new InvalidPackageNameError(packageName);
    }
    
    const [repo, chart] = parts;
    if (!repo || !chart) {
      throw new InvalidPackageNameError(packageName);
    }
    
    return { repo, chart };
  }

  private async makeApiRequest<T>(
    url: string,
    debugStart: string,
    debugSuccess: string,
    errorContext: string,
    retryContext: string,
    acceptHeader: string = 'application/json'
  ): Promise<T> {
    return withRetry(async () => {
      logger.debug(debugStart);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': acceptHeader,
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          handleHttpError(response.status, response, errorContext);
        }

        const data = acceptHeader === 'application/json' 
          ? await response.json() as T 
          : await response.text() as T;
        
        logger.debug(debugSuccess);
        return data;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), errorContext);
        }
        handleApiError(error, errorContext);
      } finally {
        clearTimeout(timeoutId);
      }
    }, 3, 1000, retryContext);
  }

  async getPackageInfo(packageName: string, version?: string): Promise<ArtifactHubPackage> {
    const { repo, chart } = this.validatePackageName(packageName);
    
    // First get the latest package info
    const url = `${this.baseUrl}/packages/helm/${encodeURIComponent(repo)}/${encodeURIComponent(chart)}`;
    
    return withRetry(async () => {
      logger.debug(`Fetching Helm chart info: ${packageName}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          handleHttpError(response.status, response, `Artifact Hub for package ${packageName}`);
        }

        const data = await response.json() as ArtifactHubPackage;
        
        // If a specific version is requested and it's not the latest, we need to check if it exists
        if (version && version !== 'latest' && data.version !== version) {
          const availableVersions = data.available_versions || [];
          const versionExists = availableVersions.some(v => v.version === version);
          
          if (!versionExists) {
            const { VersionNotFoundError } = await import('../types/index.js');
            throw new VersionNotFoundError(packageName, version);
          }
          
          // Get the specific version info
          return await this.getSpecificVersionInfo(repo, chart, version);
        }
        
        logger.debug(`Successfully fetched Helm chart info: ${packageName}`);
        return data;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `Artifact Hub for package ${packageName}`);
        }
        handleApiError(error, `Artifact Hub for package ${packageName}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }, 3, 1000, `Artifact Hub getPackageInfo(${packageName})`);
  }

  private async getSpecificVersionInfo(repo: string, chart: string, version: string): Promise<ArtifactHubPackage> {
    const url = `${this.baseUrl}/packages/helm/${encodeURIComponent(repo)}/${encodeURIComponent(chart)}/${encodeURIComponent(version)}`;
    const context = `${repo}/${chart}@${version}`;
    
    return this.makeApiRequest<ArtifactHubPackage>(
      url,
      `Fetching specific Helm chart version: ${context}`,
      `Successfully fetched specific Helm chart version: ${context}`,
      `Artifact Hub for package ${context}`,
      `Artifact Hub getSpecificVersionInfo(${context})`
    );
  }

  async searchPackages(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ArtifactHubSearchResponse> {
    const params = new URLSearchParams({
      facets: 'false',
      kind: '0', // 0 = Helm charts
      limit: limit.toString(),
      offset: offset.toString(),
      sort: 'relevance',
      ts_query_web: query,
    });

    const url = `${this.baseUrl}/packages/search?${params.toString()}`;

    return withRetry(async () => {
      logger.debug(`Searching Helm charts: ${query} (limit: ${limit})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          handleHttpError(response.status, response, `Artifact Hub search for query ${query}`);
        }

        const data = await response.json() as ArtifactHubSearchResponse;
        
        // Validate response structure
        if (!data || !data.data || !Array.isArray(data.data.packages)) {
          logger.warn(`Invalid response structure from Artifact Hub search`, { data });
          return {
            data: {
              packages: []
            }
          };
        }
        
        logger.debug(`Successfully searched Helm charts: ${query}, found ${data.data.packages.length} results`);
        return data;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `Artifact Hub search for query ${query}`);
        }
        handleApiError(error, `Artifact Hub search for query ${query}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }, 3, 1000, `Artifact Hub searchPackages(${query})`);
  }

  async getPackageValues(repo: string, chart: string, version?: string): Promise<any> {
    const versionParam = version && version !== 'latest' ? `/${encodeURIComponent(version)}` : '';
    const url = `${this.baseUrl}/packages/helm/${encodeURIComponent(repo)}/${encodeURIComponent(chart)}${versionParam}/values`;
    
    return withRetry(async () => {
      logger.debug(`Fetching Helm chart values: ${repo}/${chart}${version ? `@${version}` : ''}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Values not available, return null
            return null;
          }
          handleHttpError(response.status, response, `Artifact Hub values for ${repo}/${chart}`);
        }

        const data = await response.text(); // Values are typically YAML text
        logger.debug(`Successfully fetched Helm chart values: ${repo}/${chart}`);
        return data;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `Artifact Hub values for ${repo}/${chart}`);
        }
        // Non-critical error, return null
        logger.warn(`Failed to fetch values for ${repo}/${chart}`, { error });
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 2, 1000, `Artifact Hub getPackageValues(${repo}/${chart})`);
  }

  async getPackageChangelog(repo: string, chart: string, version?: string): Promise<string | null> {
    const versionParam = version && version !== 'latest' ? `/${encodeURIComponent(version)}` : '';
    const url = `${this.baseUrl}/packages/helm/${encodeURIComponent(repo)}/${encodeURIComponent(chart)}${versionParam}/changelog`;
    
    return withRetry(async () => {
      logger.debug(`Fetching Helm chart changelog: ${repo}/${chart}${version ? `@${version}` : ''}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'text/plain',
            'User-Agent': 'helm-package-readme-mcp/1.0.0',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Changelog not available, return null
            return null;
          }
          handleHttpError(response.status, response, `Artifact Hub changelog for ${repo}/${chart}`);
        }

        const data = await response.text();
        logger.debug(`Successfully fetched Helm chart changelog: ${repo}/${chart}`);
        return data;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          handleApiError(new Error('Request timeout'), `Artifact Hub changelog for ${repo}/${chart}`);
        }
        // Non-critical error, return null
        logger.warn(`Failed to fetch changelog for ${repo}/${chart}`, { error });
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }, 2, 1000, `Artifact Hub getPackageChangelog(${repo}/${chart})`);
  }
}

export const artifactHubClient = new ArtifactHubClient();

// Alias for backward compatibility with tests
export { ArtifactHubClient as ArtifactHubApi };