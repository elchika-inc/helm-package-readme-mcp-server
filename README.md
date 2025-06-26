# Helm Package README MCP Server

[![license](https://img.shields.io/npm/l/helm-package-readme-mcp-server)](https://github.com/elchika-inc/helm-package-readme-mcp-server/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/helm-package-readme-mcp-server)](https://www.npmjs.com/package/helm-package-readme-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/helm-package-readme-mcp-server)](https://www.npmjs.com/package/helm-package-readme-mcp-server)
[![GitHub stars](https://img.shields.io/github/stars/elchika-inc/helm-package-readme-mcp-server)](https://github.com/elchika-inc/helm-package-readme-mcp-server)

An MCP (Model Context Protocol) server that enables AI assistants to fetch comprehensive information about Helm charts from Artifact Hub, including README content, chart metadata, and search functionality.

## Features

- **Chart README Retrieval**: Fetch formatted README content with usage examples from Helm charts hosted on Artifact Hub
- **Chart Information**: Get comprehensive chart metadata including dependencies, versions, maintainers, and repository information
- **Chart Search**: Search Artifact Hub with advanced filtering by repository, kind, and relevance
- **Smart Caching**: Intelligent caching system to optimize API usage and improve response times
- **GitHub Integration**: Seamless integration with GitHub API for enhanced README fetching when charts link to GitHub repositories
- **Error Handling**: Robust error handling with automatic retry logic and fallback strategies

## MCP Client Configuration

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "helm-package-readme": {
      "command": "npx",
      "args": ["helm-package-readme-mcp-server"],
      "env": {
        "GITHUB_TOKEN": "your_github_token_here"
      }
    }
  }
}
```

> **Note**: The `GITHUB_TOKEN` is optional but recommended for higher API rate limits when fetching README content from GitHub.

## Available Tools

### get_package_readme

Retrieves comprehensive README content and usage examples for Helm charts.

**Parameters:**
```json
{
  "package_name": "bitnami/nginx",
  "version": "latest",
  "include_examples": true
}
```

- `package_name` (string, required): Helm chart name in `repository/chart` format
- `version` (string, optional): Specific chart version or "latest" (default: "latest")
- `include_examples` (boolean, optional): Include usage examples and code snippets (default: true)

**Returns:** Formatted README content with installation instructions, usage examples, and configuration documentation.

### get_package_info

Fetches detailed chart metadata, dependencies, and statistics from Artifact Hub.

**Parameters:**
```json
{
  "package_name": "stable/mysql",
  "include_dependencies": true,
  "include_dev_dependencies": false
}
```

- `package_name` (string, required): Helm chart name
- `include_dependencies` (boolean, optional): Include chart dependencies (default: true)
- `include_dev_dependencies` (boolean, optional): Include development dependencies (default: false)

**Returns:** Chart metadata including version info, maintainers, license, repository info, and dependency tree.

### search_packages

Searches Artifact Hub for charts with advanced filtering capabilities.

**Parameters:**
```json
{
  "query": "nginx web server",
  "limit": 20,
  "quality": 0.8
}
```

- `query` (string, required): Search terms (chart name, description, keywords)
- `limit` (number, optional): Maximum number of results to return (default: 20, max: 250)
- `quality` (number, optional): Minimum quality score filter (0-1)

**Returns:** List of matching charts with names, descriptions, repository info, and relevance scores.

## Error Handling

The server handles common error scenarios gracefully:

- **Chart not found**: Returns clear error messages with chart name suggestions
- **Rate limiting**: Implements automatic retry with exponential backoff
- **Network timeouts**: Configurable timeout with retry logic
- **Invalid chart names**: Validates chart name format and provides guidance
- **GitHub API failures**: Fallback strategies when GitHub integration fails

## License

MIT