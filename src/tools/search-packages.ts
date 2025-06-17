import { logger } from '../utils/logger.js';
import { validateSearchQuery, validateLimit, sanitizeSearchQuery } from '../utils/validators.js';
import { cache } from '../services/cache.js';
import { artifactHubClient } from '../services/artifact-hub-api.js';
import type {
  SearchPackagesParams,
  SearchPackagesResponse,
  PackageSearchResult,
  AuthorInfo,
} from '../types/index.js';

export async function searchPackages(params: SearchPackagesParams): Promise<SearchPackagesResponse> {
  const { query, limit = 20, quality, popularity } = params;
  
  logger.info(`Searching Helm charts: "${query}" (limit: ${limit})`);

  // Validate inputs
  validateSearchQuery(query);
  validateLimit(limit);

  // Note: Artifact Hub doesn't use quality/popularity scores like npm
  // These parameters are ignored but kept for API compatibility
  if (quality !== undefined) {
    logger.debug(`Quality parameter ignored for Artifact Hub search: ${quality}`);
  }
  if (popularity !== undefined) {
    logger.debug(`Popularity parameter ignored for Artifact Hub search: ${popularity}`);
  }

  const sanitizedQuery = sanitizeSearchQuery(query);
  const cacheKey = cache.generateSearchKey(sanitizedQuery, limit);

  // Check cache first
  const cached = cache.get<SearchPackagesResponse>(cacheKey);
  if (cached) {
    logger.debug(`Cache hit for search: "${sanitizedQuery}" (limit: ${limit})`);
    return cached;
  }

  try {
    // Search packages via Artifact Hub
    const searchResults = await artifactHubClient.searchPackages(sanitizedQuery, limit);
    
    // Validate search results structure
    if (!searchResults?.data?.packages) {
      logger.warn(`Invalid search results structure from Artifact Hub`, { searchResults });
      return {
        query: sanitizedQuery,
        total: 0,
        packages: [],
      };
    }
    
    // Transform results to our format
    const packages: PackageSearchResult[] = searchResults.data.packages.map(pkg => {
      const maintainers: AuthorInfo[] = pkg.maintainers?.map(m => ({
        name: m.name,
        email: m.email,
      })) || [];

      return {
        name: `${pkg.repository.name}/${pkg.name}`,
        version: pkg.version,
        description: pkg.description,
        keywords: pkg.keywords || [],
        repository: {
          name: pkg.repository.name,
          display_name: pkg.repository.display_name || pkg.repository.name,
          url: pkg.repository.url,
        },
        maintainers,
        app_version: pkg.app_version,
        created_at: new Date(pkg.created_at * 1000).toISOString(),
        deprecated: pkg.deprecated,
        signed: pkg.signed,
        stars: pkg.stars,
      };
    });

    const response: SearchPackagesResponse = {
      query: sanitizedQuery,
      total: packages.length, // Artifact Hub doesn't provide total count in search
      packages,
    };

    // Cache the response (shorter TTL for search results)
    cache.set(cacheKey, response, 300000); // 5 minutes

    logger.info(`Successfully searched charts: "${sanitizedQuery}", found ${packages.length} results`);
    return response;

  } catch (error) {
    logger.error(`Failed to search packages: "${sanitizedQuery}"`, { error });
    throw error;
  }
}