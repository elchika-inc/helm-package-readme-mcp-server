# Helm Package README MCP Server

[![npm version](https://img.shields.io/npm/v/helm-package-readme-mcp-server)](https://www.npmjs.com/package/helm-package-readme-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/helm-package-readme-mcp-server)](https://www.npmjs.com/package/helm-package-readme-mcp-server)
[![GitHub stars](https://img.shields.io/github/stars/naoto24kawa/package-readme-mcp-servers)](https://github.com/naoto24kawa/package-readme-mcp-servers)
[![GitHub issues](https://img.shields.io/github/issues/naoto24kawa/package-readme-mcp-servers)](https://github.com/naoto24kawa/package-readme-mcp-servers/issues)
[![license](https://img.shields.io/npm/l/helm-package-readme-mcp-server)](https://github.com/naoto24kawa/package-readme-mcp-servers/blob/main/LICENSE)

A Model Context Protocol (MCP) server that provides access to Helm chart documentation and usage information from Artifact Hub. This server allows you to fetch README content and metadata for any Helm chart directly through Claude Desktop or other MCP-compatible clients.

## Features

- 📋 **Get Helm Chart README**: Retrieve comprehensive documentation and usage examples for any Helm chart
- 📦 **Get Chart Information**: Access chart metadata, dependencies, and maintainer information  
- 🔍 **Search Charts**: Find charts by name, keywords, or description
- 🧠 **Smart Parsing**: Automatically extract usage examples from README content and values.yaml
- 🐙 **GitHub Integration**: Fallback to GitHub for README content when not available in Artifact Hub
- ⚡ **Caching**: Intelligent caching to improve performance and reduce API calls

## Installation

Install via npm:
```bash
npm install -g helm-package-readme-mcp-server
```

Or use directly with npx:
```bash
npx helm-package-readme-mcp-server
```

## Usage

### Claude Desktop Configuration

Add to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "helm-package-readme": {
      "command": "helm-package-readme-mcp-server",
      "env": {
        "GITHUB_TOKEN": "your-github-token-here"
      }
    }
  }
}
```

### Generic MCP Client Configuration

For other MCP clients, use:

```json
{
  "mcpServers": {
    "helm-package-readme": {
      "command": "node",
      "args": ["/path/to/helm-package-readme-mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "your-github-token-here"
      }
    }
  }
}
```

### Environment Variables

- `GITHUB_TOKEN`: GitHub Personal Access Token for enhanced README retrieval (optional)
- `CACHE_TTL`: Cache time-to-live in milliseconds (default: 3600000 = 1 hour)
- `CACHE_MAX_SIZE`: Maximum cache size in bytes (default: 104857600 = 100MB)
- `LOG_LEVEL`: Logging level (debug, info, warn, error) (default: info)

## Available Tools

### 1. get_package_readme

Retrieve README content and usage examples for a Helm chart.

**Parameters:**
- `package_name` (required): Chart name in format "repo/chart" (e.g., "bitnami/nginx")
- `version` (optional): Chart version (default: "latest")
- `include_examples` (optional): Whether to include usage examples (default: true)

**Example:**
```typescript
{
  "package_name": "bitnami/nginx",
  "version": "15.1.0",
  "include_examples": true
}
```

### 2. get_package_info

Get basic information and metadata for a Helm chart.

**Parameters:**
- `package_name` (required): Chart name in format "repo/chart"
- `include_dependencies` (optional): Include chart dependencies (default: true)
- `include_dev_dependencies` (optional): Include development dependencies (default: false)

**Example:**
```typescript
{
  "package_name": "bitnami/nginx",
  "include_dependencies": true
}
```

### 3. search_packages

Search for Helm charts in Artifact Hub.

**Parameters:**
- `query` (required): Search query
- `limit` (optional): Maximum number of results (default: 20, max: 250)
- `quality` (optional): Not used in Artifact Hub (compatibility parameter)
- `popularity` (optional): Not used in Artifact Hub (compatibility parameter)

**Example:**
```typescript
{
  "query": "nginx web server",
  "limit": 10
}
```

## Package Name Format

All tools require package names in the format `repo/chart`, where:
- `repo` is the Helm repository name (e.g., "bitnami", "stable")
- `chart` is the chart name (e.g., "nginx", "mysql")

Examples:
- `bitnami/nginx`
- `stable/mysql`
- `prometheus-community/prometheus`

## Key Capabilities

### Smart README Parsing

The server automatically extracts usage examples from:
- 📄 README.md content
- 🔧 values.yaml documentation  
- 📋 Chart.yaml dependencies

### Example Types Detected

- **Installation Commands**: `helm install`, `helm repo add`
- **YAML Configurations**: values.yaml, kubernetes manifests
- **Command Line Usage**: kubectl, helm commands
- **Helm Templates**: Template examples and snippets

### GitHub Integration

When README content is not available in Artifact Hub, the server automatically:
1. 🔍 Extracts repository information from the chart metadata
2. 📥 Attempts to fetch README.md from the GitHub repository
3. 🔄 Tries multiple README filename variations (README.md, readme.md, etc.)
4. 🌿 Supports both main and master branch fallbacks

### Caching Strategy

- **Package Info**: ⏰ Cached for 1 hour
- **README Content**: ⏰ Cached for 1 hour  
- **Search Results**: ⚡ Cached for 5 minutes
- **Values.yaml**: ⏰ Cached for 1 hour

## Development

### Setup

```bash
git clone <repository-url>
cd helm-package-readme-mcp-server
npm install
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## API Integration

This server integrates with:
- 🏢 **Artifact Hub API**: Primary source for chart information
- 🐙 **GitHub API**: Fallback for README content  
- ⛵ **Helm Repository APIs**: Chart metadata and versions

## Error Handling

The server provides comprehensive error handling for:
- ❌ Package not found errors
- 🔍 Invalid package name formats
- ⏱️ API rate limiting
- 🌐 Network timeouts
- 📦 Malformed chart data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Related Projects

- [npm-package-readme-mcp-server](../npm-package-readme-mcp-server): For npm packages
- [pip-package-readme-mcp-server](../pip-package-readme-mcp-server): For Python packages
- [composer-package-readme-mcp-server](../composer-package-readme-mcp-server): For PHP packages