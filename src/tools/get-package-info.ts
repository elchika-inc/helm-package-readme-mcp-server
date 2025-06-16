import { logger } from "../utils/logger.js";
import { validatePackageName } from "../utils/validators.js";
import { cache } from "../services/cache.js";
import { artifactHubClient } from "../services/artifact-hub-api.js";
import type {
  GetPackageInfoParams,
  PackageInfoResponse,
  DownloadStats,
  RepositoryInfo,
  AuthorInfo,
} from "../types/index.js";

export async function getPackageInfo(
  params: GetPackageInfoParams
): Promise<PackageInfoResponse> {
  const {
    package_name,
    include_dependencies = true,
    include_dev_dependencies = false,
  } = params;

  logger.info(`Getting Helm chart info: ${package_name}`);

  // Validate inputs
  validatePackageName(package_name);

  const cacheKey = cache.generatePackageInfoKey(package_name);

  // Check cache first
  const cached = cache.get<PackageInfoResponse>(cacheKey);
  if (cached) {
    logger.debug(`Cache hit for package info: ${package_name}`);
    return cached;
  }

  try {
    // Check package existence first
    logger.debug(`Checking package existence: ${package_name}`);
    let packageInfo;
    try {
      packageInfo = await artifactHubClient.getPackageInfo(package_name);
    } catch (error) {
      // Package doesn't exist, return response with exists: false
      logger.warn(`Package not found: ${package_name}`);
      const notFoundResponse: PackageInfoResponse = {
        package_name,
        latest_version: '',
        description: '',
        author: '',
        maintainers: [],
        keywords: [],
        download_stats: { last_day: 0, last_week: 0, last_month: 0 },
        exists: false,
      };
      return notFoundResponse;
    }
    
    logger.debug(`Package found: ${package_name}`);

    // Build maintainers list
    const maintainers: AuthorInfo[] =
      packageInfo.maintainers?.map((m) => ({
        name: m.name,
        email: m.email,
      })) || [];

    // Get dependencies info if requested
    let dependencies: Record<string, string> | undefined;
    let devDependencies: Record<string, string> | undefined;

    if (include_dependencies || include_dev_dependencies) {
      try {
        const [repo, chart] = package_name.split("/");
        const valuesContent = await artifactHubClient.getPackageValues(
          repo || "",
          chart || ""
        );

        if (valuesContent) {
          // Parse Chart.yaml-like content for dependencies
          // Note: This is a simplified approach. In a real implementation,
          // you might want to fetch the actual Chart.yaml file
          const dependencyPattern =
            /dependencies:\s*\n((?:\s*-\s*name:\s*.+\n(?:\s*version:\s*.+\n)?(?:\s*repository:\s*.+\n)?)*)/gm;
          const match = dependencyPattern.exec(valuesContent);

          if (match && include_dependencies) {
            dependencies = {};
            const depLines = match[1]?.split("\n") || [];
            let currentDep: { name?: string; version?: string } = {};

            for (const line of depLines) {
              const nameMatch = line.match(/^\s*-\s*name:\s*(.+)$/);
              const versionMatch = line.match(/^\s*version:\s*(.+)$/);

              if (nameMatch) {
                if (currentDep.name && currentDep.version) {
                  dependencies[currentDep.name] = currentDep.version;
                }
                const name = nameMatch[1]?.trim();
                if (name) {
                  currentDep = { name };
                }
              } else if (versionMatch && currentDep.name) {
                const version = versionMatch[1]?.trim();
                if (version) {
                  currentDep.version = version;
                }
              }
            }

            // Add the last dependency
            if (currentDep.name && currentDep.version) {
              dependencies[currentDep.name] = currentDep.version;
            }
          }
        }
      } catch (error) {
        logger.debug(`Failed to parse dependencies for ${package_name}`, {
          error,
        });
      }
    }

    // Mock download stats since Artifact Hub doesn't provide them directly
    // In production, you might want to implement a separate analytics service
    const downloadStats: DownloadStats = {
      last_day: packageInfo.stars || 0,
      last_week: (packageInfo.stars || 0) * 7,
      last_month: (packageInfo.stars || 0) * 30,
    };

    // Build repository info
    let repositoryInfo: RepositoryInfo | undefined;
    if (packageInfo.repository) {
      repositoryInfo = {
        type: "git",
        url: packageInfo.repository.url,
        directory: packageInfo.relative_path,
      };
    }

    const response: PackageInfoResponse = {
      package_name,
      latest_version: packageInfo.version,
      description: packageInfo.description,
      author: maintainers[0]?.name || 'Unknown',
      maintainers,
      license: packageInfo.license,
      keywords: packageInfo.keywords || [],
      dependencies: include_dependencies ? dependencies : undefined,
      dev_dependencies: include_dev_dependencies ? devDependencies : undefined,
      download_stats: downloadStats,
      repository: repositoryInfo,
      app_version: packageInfo.app_version,
      deprecated: packageInfo.deprecated,
      signed: packageInfo.signed,
      exists: true,
    };

    // Cache the response
    cache.set(cacheKey, response);

    logger.info(`Successfully retrieved info for ${package_name}`);
    return response;
  } catch (error) {
    logger.error(`Failed to get package info: ${package_name}`, { error });
    throw error;
  }
}
