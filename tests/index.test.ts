import { expect, test, describe } from "vitest";
import { PackageReadmeMcpServer } from "../dist/src/server.js";

describe('Helm Package README MCP Server', () => {
  test('should create server instance', () => {
    const server = new PackageReadmeMcpServer();
    expect(server).toBeDefined();
  });

  test('should have tool definitions', () => {
    const server = new PackageReadmeMcpServer();
    // Access private server property for testing
    const serverInstance = (server as any).server;
    expect(serverInstance).toBeDefined();
  });

  test('should export server components', () => {
    // Test that the main index file exports exist
    const indexModule = require('../dist/src/index.js');
    expect(indexModule).toBeDefined();
  });

  test('should have required tool functions', () => {
    const { getPackageReadme } = require('../dist/src/tools/get-package-readme.js');
    const { getPackageInfo } = require('../dist/src/tools/get-package-info.js');
    const { searchPackages } = require('../dist/src/tools/search-packages.js');
    
    expect(typeof getPackageReadme).toBe('function');
    expect(typeof getPackageInfo).toBe('function');
    expect(typeof searchPackages).toBe('function');
  });

  test('should have required utility functions', () => {
    const { validatePackageName, validateVersion } = require('../dist/src/utils/validators.js');
    const { logger } = require('../dist/src/utils/logger.js');
    
    expect(typeof validatePackageName).toBe('function');
    expect(typeof validateVersion).toBe('function');
    expect(logger).toBeDefined();
  });

  test('should have service modules', () => {
    const { cache } = require('../dist/src/services/cache.js');
    const { artifactHubClient } = require('../dist/src/services/artifact-hub-api.js');
    const { githubApi } = require('../dist/src/services/github-api.js');
    const { readmeParser } = require('../dist/src/services/readme-parser.js');
    
    expect(cache).toBeDefined();
    expect(artifactHubClient).toBeDefined();
    expect(githubApi).toBeDefined();
    expect(readmeParser).toBeDefined();
  });
});