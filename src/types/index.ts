export interface UsageExample {
  title: string;
  description?: string | undefined;
  code: string;
  language: string; // 'yaml', 'bash', 'shell', etc.
}

export interface InstallationInfo {
  helm: string;      // "helm install name repo/chart"
  repository?: string; // "helm repo add name url"
}

export interface AuthorInfo {
  name: string;
  email?: string | undefined;
  url?: string | undefined;
}

export interface RepositoryInfo {
  type: string;
  url: string;
  directory?: string | undefined;
}

export interface PackageBasicInfo {
  name: string;
  version: string;
  description: string;
  app_version?: string | undefined;
  homepage?: string | undefined;
  sources?: string[] | undefined;
  license?: string | undefined;
  maintainers: AuthorInfo[];
  keywords: string[];
  annotations?: Record<string, string> | undefined;
}

export interface DownloadStats {
  last_day: number;
  last_week: number;
  last_month: number;
}

export interface PackageSearchResult {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  repository: {
    name: string;
    display_name: string;
    url: string;
  };
  maintainers: AuthorInfo[];
  app_version?: string | undefined;
  created_at: string;
  deprecated?: boolean | undefined;
  signed?: boolean | undefined;
  stars?: number | undefined;
}

// Tool Parameters
export interface GetPackageReadmeParams {
  package_name: string;    // Package name in format "repo/chart" (required)
  version?: string;        // Version specification (optional, default: "latest")
  include_examples?: boolean; // Whether to include examples (optional, default: true)
}

export interface GetPackageInfoParams {
  package_name: string;    // Package name in format "repo/chart"
  include_dependencies?: boolean; // Whether to include dependencies (default: true)
  include_dev_dependencies?: boolean; // Whether to include dev dependencies (default: false)
}

export interface SearchPackagesParams {
  query: string;          // Search query
  limit?: number;         // Result limit (default: 20)
  quality?: number;       // Quality score minimum (0-1) - not used in Artifact Hub
  popularity?: number;    // Popularity score minimum (0-1) - not used in Artifact Hub
}

// Tool Responses
export interface PackageReadmeResponse {
  package_name: string;
  version: string;
  description: string;
  readme_content: string;
  usage_examples: UsageExample[];
  installation: InstallationInfo;
  basic_info: PackageBasicInfo;
  repository?: RepositoryInfo | undefined;
}

export interface PackageInfoResponse {
  package_name: string;
  latest_version: string;
  description: string;
  maintainers: AuthorInfo[];
  license?: string | undefined;
  keywords: string[];
  dependencies?: Record<string, string> | undefined;
  dev_dependencies?: Record<string, string> | undefined;
  download_stats: DownloadStats;
  repository?: RepositoryInfo | undefined;
  app_version?: string | undefined;
  deprecated?: boolean | undefined;
  signed?: boolean | undefined;
}

export interface SearchPackagesResponse {
  query: string;
  total: number;
  packages: PackageSearchResult[];
}

// Cache Types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

// Artifact Hub API Types
export interface ArtifactHubPackage {
  package_id: string;
  name: string;
  normalized_name: string;
  logo_image_id?: string;
  logo_url?: string;
  stars?: number;
  description: string;
  home_url?: string;
  readme?: string;
  install?: string;
  links?: {
    name: string;
    url: string;
  }[];
  data?: {
    [key: string]: any;
  };
  version: string;
  available_versions?: {
    version: string;
    created_at: number;
    prerelease?: boolean;
    deprecated?: boolean;
  }[];
  app_version?: string;
  digest?: string;
  deprecated?: boolean;
  signed?: boolean;
  security_report_summary?: {
    [key: string]: any;
  };
  production_organizations_count?: number;
  relative_path?: string;
  repository: {
    repository_id: string;
    name: string;
    display_name?: string;
    url: string;
    branch?: string;
    private?: boolean;
    kind: number; // 0 = Helm
    verified_publisher?: boolean;
    official?: boolean;
    disabled?: boolean;
    scanner_disabled?: boolean;
    organization_name?: string;
    organization_display_name?: string;
  };
  created_at: number;
  maintainers?: {
    name: string;
    email?: string;
  }[];
  keywords?: string[];
  license?: string;
  chart_repository?: {
    name: string;
    url: string;
  };
  values_schema?: any;
  changes?: string[];
  contains_security_updates?: boolean;
  prerelease?: boolean;
  recommendations?: {
    url: string;
  }[];
  screenshots?: {
    title?: string;
    url: string;
  }[];
  sign_key?: {
    fingerprint: string;
    url: string;
  };
  provider?: string;
  has_values_schema?: boolean;
  has_changelog?: boolean;
  ts: number;
}

export interface ArtifactHubSearchResponse {
  data: {
    packages: ArtifactHubPackage[];
    facets?: {
      [key: string]: {
        [key: string]: number;
      };
    };
  };
}

export interface ArtifactHubValuesSchema {
  [key: string]: any;
}

// GitHub API Types
export interface GitHubReadmeResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content: string;
  encoding: string;
  _links: {
    self: string;
    git: string;
    html: string;
  };
}

// Error Types
export class PackageReadmeMcpError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PackageReadmeMcpError';
  }
}

export class PackageNotFoundError extends PackageReadmeMcpError {
  constructor(packageName: string) {
    super(`Package '${packageName}' not found`, 'PACKAGE_NOT_FOUND', 404);
  }
}

export class VersionNotFoundError extends PackageReadmeMcpError {
  constructor(packageName: string, version: string) {
    super(`Version '${version}' of package '${packageName}' not found`, 'VERSION_NOT_FOUND', 404);
  }
}

export class RateLimitError extends PackageReadmeMcpError {
  constructor(service: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${service}`, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
  }
}

export class NetworkError extends PackageReadmeMcpError {
  constructor(message: string, originalError?: Error) {
    super(`Network error: ${message}`, 'NETWORK_ERROR', undefined, originalError);
  }
}

export class InvalidPackageNameError extends PackageReadmeMcpError {
  constructor(packageName: string) {
    super(`Invalid package name format: '${packageName}'. Expected format: 'repo/chart'`, 'INVALID_PACKAGE_NAME', 400);
  }
}