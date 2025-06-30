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
    
    // Extract README content and usage examples
    const { readmeContent, usageExamples } = await getReadmeAndExamples(
      packageInfo,
      package_name,
      normalizedVersion,
      include_examples
    );

    // Clean the README content
    const cleanedReadme = readmeParser.cleanMarkdown(readmeContent || 'No README available');

    // Build installation info
    const installation = createInstallationInfo(package_name, packageInfo, normalizedVersion);

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

// Helper functions for better separation of concerns
async function getReadmeAndExamples(
  packageInfo: any,
  packageName: string,
  version: string,
  includeExamples: boolean
): Promise<{ readmeContent: string; usageExamples: UsageExample[] }> {
  let readmeContent = packageInfo.readme || '';
  let usageExamples: UsageExample[] = [];

  // If no README in package info, try to get it from GitHub
  if (!readmeContent && packageInfo.repository?.url) {
    readmeContent = await getReadmeFromGitHub(packageInfo.repository, packageInfo.relative_path, packageName);
  }

  if (includeExamples) {
    usageExamples = await getUsageExamples(readmeContent, packageName, version);
  }

  return { readmeContent, usageExamples };
}

async function getReadmeFromGitHub(repository: any, relativePath: string, packageName: string): Promise<string> {
  logger.debug(`No README in Artifact Hub, trying GitHub: ${repository.url}`);
  try {
    const githubReadme = await githubApi.getReadmeContent({
      type: 'git',
      url: repository.url,
      directory: relativePath,
    });
    return githubReadme || '';
  } catch (error) {
    logger.warn(`Failed to fetch README from GitHub for ${packageName}`, { error });
    return '';
  }
}

async function getUsageExamples(
  readmeContent: string,
  packageName: string,
  version: string
): Promise<UsageExample[]> {
  const examples: UsageExample[] = [];

  // Parse usage examples from README
  if (readmeContent) {
    examples.push(...readmeParser.parseUsageExamples(readmeContent, true));
  }

  // Try to get values.yaml for additional examples
  try {
    const [repo, chart] = packageName.split('/');
    const valuesContent = await artifactHubClient.getPackageValues(repo || '', chart || '', version);
    if (valuesContent) {
      const valuesExamples = readmeParser.extractValuesDocumentation(valuesContent);
      examples.push(...valuesExamples);
    }
  } catch (error) {
    logger.debug(`Failed to fetch values.yaml for ${packageName}`, { error });
  }

  return examples;
}

function createInstallationInfo(
  packageName: string,
  packageInfo: any,
  version: string
): InstallationInfo {
  const [repo, chart] = packageName.split('/');
  const alternatives: string[] = [];
  
  // Add repository URL if available
  if (packageInfo.repository && packageInfo.repository.url !== packageInfo.repository.name) {
    alternatives.push(`helm repo add ${repo} ${packageInfo.repository.url}`);
  }
  
  // Add version-specific install command
  if (version !== 'latest') {
    alternatives.push(`helm install my-${chart} ${packageName} --version ${packageInfo.version}`);
  }
  
  return {
    command: `helm install my-${chart} ${packageName}`,
    ...(alternatives.length > 0 && { alternatives }),
  };
}