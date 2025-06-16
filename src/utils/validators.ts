import { InvalidPackageNameError } from '../types/index.js';

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validatePackageName(packageName: string): void {
  if (!packageName || typeof packageName !== 'string') {
    throw new InvalidPackageNameError('Package name is required and must be a string');
  }

  // Trim whitespace
  packageName = packageName.trim();

  if (packageName.length === 0) {
    throw new InvalidPackageNameError('Package name cannot be empty');
  }

  // Check format: repo/chart
  const parts = packageName.split('/');
  if (parts.length !== 2) {
    throw new InvalidPackageNameError(`Package name must be in format 'repo/chart', got: ${packageName}`);
  }

  const [repo, chart] = parts;

  // Validate repo name
  if (!repo || repo.trim().length === 0) {
    throw new InvalidPackageNameError('Repository name cannot be empty');
  }

  // Validate chart name
  if (!chart || chart.trim().length === 0) {
    throw new InvalidPackageNameError('Chart name cannot be empty');
  }

  // Check for invalid characters
  const invalidChars = /[^a-zA-Z0-9\-_.]/;
  if (invalidChars.test(repo)) {
    throw new InvalidPackageNameError(`Repository name contains invalid characters: ${repo}`);
  }

  if (invalidChars.test(chart)) {
    throw new InvalidPackageNameError(`Chart name contains invalid characters: ${chart}`);
  }

  // Check length limits
  if (repo.length > 100) {
    throw new InvalidPackageNameError('Repository name is too long (max 100 characters)');
  }

  if (chart.length > 100) {
    throw new InvalidPackageNameError('Chart name is too long (max 100 characters)');
  }

  // Check for reserved names
  const reservedNames = ['_', '.', '..', 'con', 'prn', 'aux', 'nul'];
  if (reservedNames.includes(repo.toLowerCase()) || reservedNames.includes(chart.toLowerCase())) {
    throw new InvalidPackageNameError('Package name contains reserved words');
  }
}

export function validateVersion(version: string): void {
  if (!version || typeof version !== 'string') {
    throw new ValidationError('Version must be a string');
  }

  version = version.trim();

  if (version.length === 0) {
    throw new ValidationError('Version cannot be empty');
  }

  // Allow 'latest' as a special case
  if (version === 'latest') {
    return;
  }

  // Basic semver pattern validation
  const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  
  if (!semverPattern.test(version)) {
    // Allow simpler version patterns common in Helm charts
    const simplePattern = /^v?(\d+(?:\.\d+)*(?:-[a-zA-Z0-9-]+)?)$/;
    if (!simplePattern.test(version)) {
      throw new ValidationError(`Invalid version format: ${version}`);
    }
  }

  if (version.length > 50) {
    throw new ValidationError('Version is too long (max 50 characters)');
  }
}

export function validateSearchQuery(query: string): void {
  if (!query || typeof query !== 'string') {
    throw new ValidationError('Search query is required and must be a string');
  }

  query = query.trim();

  if (query.length === 0) {
    throw new ValidationError('Search query cannot be empty');
  }

  if (query.length < 2) {
    throw new ValidationError('Search query must be at least 2 characters long');
  }

  if (query.length > 500) {
    throw new ValidationError('Search query is too long (max 500 characters)');
  }

  // Check for potentially problematic characters
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:text\/html/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(query)) {
      throw new ValidationError('Search query contains invalid characters');
    }
  }
}

export function validateLimit(limit: number): void {
  if (typeof limit !== 'number') {
    throw new ValidationError('Limit must be a number');
  }

  if (!Number.isInteger(limit)) {
    throw new ValidationError('Limit must be an integer');
  }

  if (limit < 1) {
    throw new ValidationError('Limit must be at least 1');
  }

  if (limit > 250) {
    throw new ValidationError('Limit cannot exceed 250');
  }
}

export function validateScore(score: number, fieldName: string = 'score'): void {
  if (typeof score !== 'number') {
    throw new ValidationError(`${fieldName} must be a number`);
  }

  if (score < 0 || score > 1) {
    throw new ValidationError(`${fieldName} must be between 0 and 1`);
  }

  if (!Number.isFinite(score)) {
    throw new ValidationError(`${fieldName} must be a finite number`);
  }
}

export function validateBoolean(value: boolean, fieldName: string): void {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} must be a boolean`);
  }
}

export function sanitizePackageName(packageName: string): string {
  if (!packageName || typeof packageName !== 'string') {
    return '';
  }

  // Trim and normalize
  return packageName.trim().toLowerCase().replace(/\s+/g, '-');
}

export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Trim and normalize whitespace
  return query.trim().replace(/\s+/g, ' ');
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeVersion(version: string): string {
  if (!version || typeof version !== 'string') {
    return 'latest';
  }

  version = version.trim();

  if (version === '' || version === 'latest') {
    return 'latest';
  }

  // Remove 'v' prefix if present
  if (version.startsWith('v') && /^\d/.test(version.substring(1))) {
    return version.substring(1);
  }

  return version;
}

export function parsePackageName(packageName: string): { repo: string; chart: string } {
  validatePackageName(packageName);
  
  const [repo, chart] = packageName.trim().split('/');
  return { repo: repo.trim(), chart: chart.trim() };
}