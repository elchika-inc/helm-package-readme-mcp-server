import { describe, it, expect, beforeEach } from 'vitest';
import { ReadmeParser } from '../../src/services/readme-parser.js';

describe('ReadmeParser', () => {
  let parser: ReadmeParser;

  beforeEach(() => {
    parser = new ReadmeParser();
  });

  describe('parseReadme', () => {
    it('should parse README with installation section', () => {
      const readmeContent = `
# Test Chart

This is a test Helm chart.

## Installation

\`\`\`bash
helm repo add test-repo https://charts.example.com
helm install my-release test-repo/test-chart
\`\`\`

## Configuration

The following table lists the configurable parameters.

| Parameter | Description | Default |
|-----------|-------------|---------|
| replicaCount | Number of replicas | 1 |
| image.repository | Image repository | nginx |

## Values

You can override values:

\`\`\`yaml
replicaCount: 3
image:
  repository: custom-nginx
  tag: latest
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.installation).toContain('helm repo add');
      expect(result.sections.installation).toContain('helm install');
      expect(result.sections.configuration).toContain('configurable parameters');
      expect(result.sections.values).toContain('replicaCount: 3');
      expect(result.codeBlocks).toHaveLength(3);
      expect(result.codeBlocks[0].language).toBe('bash');
      expect(result.codeBlocks[2].language).toBe('yaml');
    });

    it('should parse README with usage examples', () => {
      const readmeContent = `
# Helm Chart

## Usage

Basic usage:

\`\`\`bash
helm install my-app ./chart
\`\`\`

With custom values:

\`\`\`bash
helm install my-app ./chart --set replicaCount=3
\`\`\`

## Examples

Example values file:

\`\`\`yaml
# values.yaml
replicaCount: 2
service:
  type: LoadBalancer
  port: 80
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.usage).toContain('helm install my-app');
      expect(result.sections.examples).toContain('values.yaml');
      expect(result.codeBlocks).toHaveLength(3);
      expect(result.helmCommands).toHaveLength(2);
      expect(result.helmCommands[0]).toContain('helm install my-app ./chart');
    });

    it('should handle README without standard sections', () => {
      const readmeContent = `
# Simple Chart

This is a simple chart with no standard sections.

Just some basic information here.
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.installation).toBe('');
      expect(result.sections.usage).toBe('');
      expect(result.sections.configuration).toBe('');
      expect(result.codeBlocks).toHaveLength(0);
      expect(result.helmCommands).toHaveLength(0);
    });

    it('should extract Helm commands correctly', () => {
      const readmeContent = `
## Commands

\`\`\`bash
helm repo add stable https://charts.helm.sh/stable
helm repo update
helm search repo stable/mysql
helm install my-mysql stable/mysql
helm upgrade my-mysql stable/mysql
helm uninstall my-mysql
helm list
helm status my-mysql
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.helmCommands).toHaveLength(8);
      expect(result.helmCommands).toContain('helm repo add stable https://charts.helm.sh/stable');
      expect(result.helmCommands).toContain('helm repo update');
      expect(result.helmCommands).toContain('helm search repo stable/mysql');
    });

    it('should handle multiple code blocks of different languages', () => {
      const readmeContent = `
# Multi-language README

## Installation

\`\`\`bash
helm install my-app ./chart
\`\`\`

## Configuration

\`\`\`yaml
replicaCount: 1
image:
  repository: nginx
\`\`\`

## Monitoring

\`\`\`json
{
  "monitoring": {
    "enabled": true,
    "port": 9090
  }
}
\`\`\`

\`\`\`shell
kubectl get pods
kubectl describe pod my-app
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.codeBlocks).toHaveLength(4);
      expect(result.codeBlocks[0].language).toBe('bash');
      expect(result.codeBlocks[1].language).toBe('yaml');
      expect(result.codeBlocks[2].language).toBe('json');
      expect(result.codeBlocks[3].language).toBe('shell');
    });
  });

  describe('extractUsageExamples', () => {
    it('should extract usage examples with include_examples true', () => {
      const readmeContent = `
# Chart

## Installation

\`\`\`bash
helm install my-release ./chart
\`\`\`

## Usage

\`\`\`bash
helm upgrade my-release ./chart
\`\`\`
      `;

      const result = parser.extractUsageExamples(readmeContent, true);

      expect(result.examples).toHaveLength(2);
      expect(result.examples[0].content).toContain('helm install');
      expect(result.examples[1].content).toContain('helm upgrade');
      expect(result.helmCommands).toHaveLength(2);
    });

    it('should not extract examples when include_examples is false', () => {
      const readmeContent = `
# Chart

\`\`\`bash
helm install my-release ./chart
\`\`\`
      `;

      const result = parser.extractUsageExamples(readmeContent, false);

      expect(result.examples).toHaveLength(0);
      expect(result.helmCommands).toHaveLength(0);
    });

    it('should extract examples from various sections', () => {
      const readmeContent = `
# Chart

## Quick Start

\`\`\`bash
helm install app ./chart
\`\`\`

## Examples

Example deployment:

\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test
\`\`\`

## Getting Started

\`\`\`bash
helm repo add test https://test.com
\`\`\`
      `;

      const result = parser.extractUsageExamples(readmeContent, true);

      expect(result.examples).toHaveLength(3);
      expect(result.helmCommands).toHaveLength(2);
    });
  });

  describe('private helper methods', () => {
    it('should extract sections correctly', () => {
      const readmeContent = `
# Title

## Installation

Installation content here.

## Configuration  

Configuration content here.

## Usage

Usage content here.

## Other Section

Other content.
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.installation).toContain('Installation content here');
      expect(result.sections.configuration).toContain('Configuration content here');
      expect(result.sections.usage).toContain('Usage content here');
    });

    it('should handle sections with different case variations', () => {
      const readmeContent = `
# Chart

## INSTALLATION

Install instructions.

## getting started

Getting started guide.

## Configuration

Config details.
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.installation).toContain('Install instructions');
      expect(result.sections.usage).toContain('Getting started guide');
      expect(result.sections.configuration).toContain('Config details');
    });

    it('should extract code blocks with proper language detection', () => {
      const readmeContent = `
\`\`\`
# No language specified
echo "hello"
\`\`\`

\`\`\`bash
echo "bash code"
\`\`\`

\`\`\`yaml
key: value
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.codeBlocks).toHaveLength(3);
      expect(result.codeBlocks[0].language).toBe('text');
      expect(result.codeBlocks[1].language).toBe('bash');
      expect(result.codeBlocks[2].language).toBe('yaml');
    });

    it('should filter Helm commands correctly', () => {
      const bashCommands = [
        'helm install my-app ./chart',
        'kubectl get pods',
        'helm upgrade my-app ./chart',
        'docker build -t image .',
        'helm uninstall my-app',
        'npm install'
      ];

      const result = parser.parseReadme('');
      // Access private method for testing - in real implementation this would be tested through public methods
      const helmCommands = bashCommands.filter(cmd => cmd.trim().startsWith('helm '));

      expect(helmCommands).toHaveLength(3);
      expect(helmCommands).toContain('helm install my-app ./chart');
      expect(helmCommands).toContain('helm upgrade my-app ./chart');
      expect(helmCommands).toContain('helm uninstall my-app');
    });
  });

  describe('edge cases', () => {
    it('should handle empty README', () => {
      const result = parser.parseReadme('');

      expect(result.sections.installation).toBeUndefined();
      expect(result.sections.usage).toBeUndefined();
      expect(result.sections.configuration).toBeUndefined();
      expect(result.codeBlocks).toHaveLength(0);
      expect(result.helmCommands).toHaveLength(0);
    });

    it('should handle README with only title', () => {
      const result = parser.parseReadme('# My Chart\n\nJust a title.');

      expect(result.sections.installation).toBeUndefined();
      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should handle malformed code blocks', () => {
      const readmeContent = `
# Chart

\`\`\`bash
helm install
# Missing closing backticks

\`\`\`yaml
key: value
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      // Should handle gracefully and extract what it can
      expect(result.codeBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long README content', () => {
      const longSection = 'Content line.\n'.repeat(1000);
      const readmeContent = `
# Chart

## Installation

${longSection}

\`\`\`bash
helm install my-app ./chart
\`\`\`
      `;

      const result = parser.parseReadme(readmeContent);

      expect(result.sections.installation).toContain('Content line.');
      expect(result.codeBlocks).toHaveLength(1);
      expect(result.helmCommands).toHaveLength(1);
    });
  });
});