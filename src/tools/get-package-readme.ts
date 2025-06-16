import { logger } from '../utils/logger.js';
import { validatePackageName, validateVersion, normalizeVersion } from '../utils/validators.js';
import { cache } from '../services/cache.js';
import { artifactHubClient } from '../services/artifact-hub-api.js';
import { githubApi } from '../services/github-api.js';
import { readmeParser } from '../services/readme-parser.js';
import type {
  GetPackageReadmeParams,
  PackageReadmeResponse,
  UsageExample,
  InstallationInfo,
  PackageBasicInfo,
  RepositoryInfo,
  AuthorInfo,
} from '../types/index.js';

export async function getPackageReadme(params: GetPackageReadmeParams): Promise<PackageReadmeResponse> {
  const { package_name, version = 'latest', include_examples = true } = params;
  
  logger.info(`Getting Helm chart README: ${package_name}@${version}`);

  // Validate inputs
  validatePackageName(package_name);
  if (version && version !== 'latest') {
    validateVersion(version);
  }

  const normalizedVersion = normalizeVersion(version);
  const cacheKey = cache.generatePackageReadmeKey(package_name, normalizedVersion);

  // Check cache first
  const cached = cache.get<PackageReadmeResponse>(cacheKey);
  if (cached) {
    logger.debug(`Cache hit for package README: ${package_name}@${normalizedVersion}`);
    return cached;
  }

  try {
    // Check package existence first
    logger.debug(`Checking package existence: ${package_name}`);
    let packageInfo;
    try {
      packageInfo = await artifactHubClient.getPackageInfo(package_name, normalizedVersion);
    } catch (error) {
      // Package doesn't exist, return response with exists: false
      logger.warn(`Package not found: ${package_name}@${normalizedVersion}`);
      const notFoundResponse: PackageReadmeResponse = {
        package_name,
        version: normalizedVersion,
        description: '',
        readme_content: '',
        usage_examples: [],
        installation: { command: '' },
        basic_info: {
          name: package_name,
          version: normalizedVersion,
          description: '',
          maintainers: [],
          keywords: [],
        },
        exists: false,
      };
      return notFoundResponse;
    }
    
    logger.debug(`Package found: ${package_name}@${normalizedVersion}`);
    
    // Extract README content
    let readmeContent = packageInfo.readme || '';
    let usageExamples: UsageExample[] = [];

    // If no README in package info, try to get it from GitHub
    if (!readmeContent && packageInfo.repository?.url) {
      logger.debug(`No README in Artifact Hub, trying GitHub: ${packageInfo.repository.url}`);
      try {
        const githubReadme = await githubApi.getReadmeContent({
          type: 'git',
          url: packageInfo.repository.url,
          directory: packageInfo.relative_path,
        });
        if (githubReadme) {
          readmeContent = githubReadme;
        }
      } catch (error) {
        logger.warn(`Failed to fetch README from GitHub for ${package_name}`, { error });
      }
    }

    // Parse usage examples from README
    if (readmeContent && include_examples) {
      usageExamples = readmeParser.parseUsageExamples(readmeContent, include_examples);
    }

    // Try to get values.yaml for additional examples
    if (include_examples) {
      try {
        const [repo, chart] = package_name.split('/');
        const valuesContent = await artifactHubClient.getPackageValues(repo || '', chart || '', normalizedVersion);
        if (valuesContent) {
          const valuesExamples = readmeParser.extractValuesDocumentation(valuesContent);
          usageExamples.push(...valuesExamples);
        }
      } catch (error) {
        logger.debug(`Failed to fetch values.yaml for ${package_name}`, { error });
      }
    }

    // Clean the README content
    const cleanedReadme = readmeParser.cleanMarkdown(readmeContent || 'No README available');

    // Build installation info
    const [repo, chart] = package_name.split('/');
    const alternatives: string[] = [];
    
    // Add repository URL if available
    if (packageInfo.repository && packageInfo.repository.url !== packageInfo.repository.name) {
      alternatives.push(`helm repo add ${repo} ${packageInfo.repository.url}`);
    }
    
    // Add version-specific install command
    if (normalizedVersion !== 'latest') {
      alternatives.push(`helm install my-${chart} ${package_name} --version ${packageInfo.version}`);
    }
    
    const installation: InstallationInfo = {
      command: `helm install my-${chart} ${package_name}`,
      ...(alternatives.length > 0 && { alternatives }),
    };

    // Build basic info
    const basicInfo: PackageBasicInfo = {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description || '',
      app_version: packageInfo.app_version,
      homepage: packageInfo.home_url,
      sources: packageInfo.links?.filter(link => link.name.toLowerCase().includes('source')).map(link => link.url),
      license: packageInfo.license,
      maintainers: packageInfo.maintainers?.map(m => ({
        name: m.name,
        email: m.email,
      } as AuthorInfo)) || [],
      keywords: packageInfo.keywords || [],
      annotations: packageInfo.data,
    };

    // Build repository info
    let repositoryInfo: RepositoryInfo | undefined;
    if (packageInfo.repository) {
      repositoryInfo = {
        type: 'git',
        url: packageInfo.repository.url,
        directory: packageInfo.relative_path,
      };
    }

    const response: PackageReadmeResponse = {
      package_name,
      version: packageInfo.version,
      description: packageInfo.description || readmeParser.extractDescription(cleanedReadme),
      readme_content: cleanedReadme,
      usage_examples: usageExamples,
      installation,
      basic_info: basicInfo,
      repository: repositoryInfo,
      exists: true,
    };

    // Cache the response
    cache.set(cacheKey, response);

    logger.info(`Successfully retrieved README for ${package_name}@${normalizedVersion}`);
    return response;

  } catch (error) {
    logger.error(`Failed to get package README: ${package_name}@${normalizedVersion}`, { error });
    throw error;
  }
}