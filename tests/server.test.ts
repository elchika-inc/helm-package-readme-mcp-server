import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PackageReadmeMcpServer } from '../src/server.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

// Mock the external dependencies
vi.mock('../src/services/artifact-hub-api.js');
vi.mock('../src/services/github-api.js');
vi.mock('../src/services/readme-parser.js');

describe('PackageReadmeMcpServer', () => {
  let server: PackageReadmeMcpServer;

  beforeEach(() => {
    server = new PackageReadmeMcpServer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('server initialization', () => {
    it('should initialize server with correct name and version', () => {
      expect(server.name).toBe('helm-package-readme-mcp-server');
      expect(server.version).toBeDefined();
    });

    it('should have proper server info', () => {
      const serverInfo = server.getServerInfo();
      expect(serverInfo.name).toBe('helm-package-readme-mcp-server');
      expect(serverInfo.version).toBeDefined();
    });
  });

  describe('list_tools handler', () => {
    it('should list all available tools', async () => {
      const request = {
        method: 'tools/list' as const,
        params: {}
      };

      const response = await server.handleRequest(request);

      expect(response.tools).toHaveLength(3);
      
      const toolNames = response.tools.map(tool => tool.name);
      expect(toolNames).toContain('get_readme_from_helm');
      expect(toolNames).toContain('get_package_info_from_helm');
      expect(toolNames).toContain('search_packages_from_helm');
    });

    it('should have proper tool definitions', async () => {
      const request = {
        method: 'tools/list' as const,
        params: {}
      };

      const response = await server.handleRequest(request);
      const tools = response.tools;

      // Check get_readme_from_helm tool
      const readmeTool = tools.find(t => t.name === 'get_readme_from_helm');
      expect(readmeTool).toBeDefined();
      expect(readmeTool!.description).toContain('README');
      expect(readmeTool!.inputSchema.properties).toHaveProperty('package_name');
      expect(readmeTool!.inputSchema.properties).toHaveProperty('version');
      expect(readmeTool!.inputSchema.properties).toHaveProperty('include_examples');

      // Check get_package_info_from_helm tool
      const infoTool = tools.find(t => t.name === 'get_package_info_from_helm');
      expect(infoTool).toBeDefined();
      expect(infoTool!.description).toContain('package information');
      expect(infoTool!.inputSchema.properties).toHaveProperty('package_name');
      expect(infoTool!.inputSchema.properties).toHaveProperty('include_dependencies');

      // Check search_packages_from_helm tool
      const searchTool = tools.find(t => t.name === 'search_packages_from_helm');
      expect(searchTool).toBeDefined();
      expect(searchTool!.description).toContain('search');
      expect(searchTool!.inputSchema.properties).toHaveProperty('query');
      expect(searchTool!.inputSchema.properties).toHaveProperty('limit');
      expect(searchTool!.inputSchema.properties).toHaveProperty('quality');
      expect(searchTool!.inputSchema.properties).toHaveProperty('popularity');
    });
  });

  describe('call_tool handler', () => {
    describe('get_readme_from_helm', () => {
      it('should validate required parameters', async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get_readme_from_helm',
            arguments: {}
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(true);
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');
        expect(response.content[0].text).toContain('package_name is required');
      });

      it('should validate parameter types', async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get_readme_from_helm',
            arguments: {
              package_name: 123,
              version: true,
              include_examples: 'yes'
            }
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('must be a string');
      });

      it('should handle successful README fetch', async () => {
        // Mock the tool function
        const mockGetReadme = vi.fn().mockResolvedValue({
          package_name: 'nginx',
          version: '1.0.0',
          readme_content: '# Nginx Chart\n\nThis is the nginx chart.',
          repository_url: 'https://github.com/helm/charts',
          examples: [
            {
              title: 'Basic Installation',
              content: 'helm install nginx ./nginx'
            }
          ]
        });

        // Mock the module
        vi.doMock('../src/tools/get-package-readme.js', () => ({
          getPackageReadme: mockGetReadme
        }));

        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get_readme_from_helm',
            arguments: {
              package_name: 'nginx',
              version: '1.0.0',
              include_examples: true
            }
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(false);
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        
        const content = JSON.parse(response.content[0].text);
        expect(content.package_name).toBe('nginx');
        expect(content.readme_content).toContain('nginx chart');
      });
    });

    describe('get_package_info_from_helm', () => {
      it('should validate required parameters', async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get_package_info_from_helm',
            arguments: {}
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('package_name is required');
      });

      it('should handle successful package info fetch', async () => {
        const mockGetPackageInfo = vi.fn().mockResolvedValue({
          package_name: 'nginx',
          version: '1.0.0',
          description: 'Nginx web server',
          maintainers: [
            { name: 'Test Maintainer', email: 'test@example.com' }
          ],
          dependencies: [
            { name: 'common', version: '>=1.0.0' }
          ]
        });

        vi.doMock('../src/tools/get-package-info.js', () => ({
          getPackageInfo: mockGetPackageInfo
        }));

        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get_package_info_from_helm',
            arguments: {
              package_name: 'nginx',
              include_dependencies: true
            }
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(false);
        const content = JSON.parse(response.content[0].text);
        expect(content.package_name).toBe('nginx');
        expect(content.description).toBe('Nginx web server');
      });
    });

    describe('search_packages_from_helm', () => {
      it('should validate required parameters', async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'search_packages_from_helm',
            arguments: {}
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('query is required');
      });

      it('should validate parameter ranges', async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'search_packages_from_helm',
            arguments: {
              query: 'nginx',
              limit: 300,
              quality: 1.5,
              popularity: -0.5
            }
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('between');
      });

      it('should handle successful package search', async () => {
        const mockSearchPackages = vi.fn().mockResolvedValue({
          query: 'nginx',
          total_count: 2,
          packages: [
            {
              name: 'nginx',
              version: '1.0.0',
              description: 'Nginx web server',
              repository: 'stable'
            },
            {
              name: 'nginx-ingress',
              version: '2.0.0',
              description: 'Nginx ingress controller',
              repository: 'ingress-nginx'
            }
          ]
        });

        vi.doMock('../src/tools/search-packages.js', () => ({
          searchPackages: mockSearchPackages
        }));

        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'search_packages_from_helm',
            arguments: {
              query: 'nginx',
              limit: 20
            }
          }
        };

        const response = await server.handleRequest(request);

        expect(response.isError).toBe(false);
        const content = JSON.parse(response.content[0].text);
        expect(content.packages).toHaveLength(2);
        expect(content.total_count).toBe(2);
      });
    });

    it('should handle unknown tool calls', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const response = await server.handleRequest(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown tool');
    });
  });

  describe('error handling', () => {
    it('should handle validation errors properly', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'get_readme_from_helm',
          arguments: {
            package_name: ''
          }
        }
      };

      const response = await server.handleRequest(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].type).toBe('text');
      expect(response.content[0].text).toContain('validation');
    });

    it('should handle network errors', async () => {
      const mockGetReadme = vi.fn().mockRejectedValue(new Error('Network error'));
      
      vi.doMock('../src/tools/get-package-readme.js', () => ({
        getPackageReadme: mockGetReadme
      }));

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'get_readme_from_helm',
          arguments: {
            package_name: 'nginx'
          }
        }
      };

      const response = await server.handleRequest(request);

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('error');
    });
  });

  describe('request handling', () => {
    it('should handle invalid request methods', async () => {
      const request = {
        method: 'invalid/method' as any,
        params: {}
      };

      await expect(server.handleRequest(request)).rejects.toThrow();
    });

    it('should handle malformed requests', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'get_readme_from_helm'
          // Missing arguments
        }
      } as any;

      const response = await server.handleRequest(request);

      expect(response.isError).toBe(true);
    });
  });

  describe('server lifecycle', () => {
    it('should handle server startup', async () => {
      expect(() => new PackageReadmeMcpServer()).not.toThrow();
    });

    it('should handle multiple requests sequentially', async () => {
      const listRequest = {
        method: 'tools/list' as const,
        params: {}
      };

      const callRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'get_readme_from_helm',
          arguments: {
            package_name: 'nginx'
          }
        }
      };

      const listResponse = await server.handleRequest(listRequest);
      const callResponse = await server.handleRequest(callRequest);

      expect(listResponse.tools).toHaveLength(3);
      expect(callResponse).toBeDefined();
    });
  });
});