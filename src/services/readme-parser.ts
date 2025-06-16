import { logger } from '../utils/logger.js';
import type { UsageExample } from '../types/index.js';

export class ReadmeParser {
  private static readonly USAGE_SECTION_PATTERNS = [
    /^#{1,6}\s*(usage|use|using|how to use|getting started|quick start|examples?|basic usage|installation|installing|install)\s*$/gim,
    /^#{1,6}\s*(deploying|deployment|deploy|helm install|chart usage)\s*$/gim,
    /^usage:?\s*$/gim,
    /^examples?:?\s*$/gim,
    /^installation:?\s*$/gim,
  ];

  private static readonly CODE_BLOCK_PATTERN = /```(\w+)?\n([\s\S]*?)```/g;

  parseUsageExamples(readmeContent: string, includeExamples: boolean = true): UsageExample[] {
    if (!includeExamples || !readmeContent) {
      return [];
    }

    try {
      const examples: UsageExample[] = [];
      const sections = this.extractUsageSections(readmeContent);

      for (const section of sections) {
        const sectionExamples = this.extractCodeBlocksFromSection(section);
        examples.push(...sectionExamples);
      }

      // Deduplicate examples based on code content
      const uniqueExamples = this.deduplicateExamples(examples);
      
      // Limit to reasonable number
      const limitedExamples = uniqueExamples.slice(0, 15);

      logger.debug(`Extracted ${limitedExamples.length} usage examples from README`);
      return limitedExamples;
    } catch (error) {
      logger.warn('Failed to parse usage examples from README', { error });
      return [];
    }
  }

  private extractUsageSections(content: string): string[] {
    const sections: string[] = [];
    const lines = content.split('\n');
    let currentSection: string[] = [];
    let inUsageSection = false;
    let sectionLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHeader = /^#{1,6}\s/.test(line);
      
      if (isHeader) {
        const level = (line.match(/^#+/) || [''])[0].length;
        const isUsageHeader = this.isUsageHeader(line);

        if (isUsageHeader) {
          // Start new usage section
          if (currentSection.length > 0) {
            sections.push(currentSection.join('\n'));
          }
          currentSection = [line];
          inUsageSection = true;
          sectionLevel = level;
        } else if (inUsageSection && level <= sectionLevel) {
          // End of current usage section
          if (currentSection.length > 0) {
            sections.push(currentSection.join('\n'));
          }
          currentSection = [];
          inUsageSection = false;
        } else if (inUsageSection) {
          currentSection.push(line);
        }
      } else if (inUsageSection) {
        currentSection.push(line);
      }
    }

    // Add final section if exists
    if (currentSection.length > 0) {
      sections.push(currentSection.join('\n'));
    }

    return sections;
  }

  private isUsageHeader(line: string): boolean {
    return ReadmeParser.USAGE_SECTION_PATTERNS.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state
      return pattern.test(line);
    });
  }

  private extractCodeBlocksFromSection(section: string): UsageExample[] {
    const examples: UsageExample[] = [];
    const codeBlockRegex = new RegExp(ReadmeParser.CODE_BLOCK_PATTERN.source, 'g');
    let match;

    while ((match = codeBlockRegex.exec(section)) !== null) {
      const [, language = 'text', code] = match;
      const cleanCode = code.trim();
      
      if (cleanCode.length === 0) {
        continue;
      }

      // Determine the type of example based on language and content
      const title = this.generateExampleTitle(cleanCode, language);
      const description = this.extractExampleDescription(section, match.index);

      examples.push({
        title,
        description: description || undefined,
        code: cleanCode,
        language: this.normalizeLanguage(language),
      });
    }

    return examples;
  }

  private generateExampleTitle(code: string, language: string): string {
    // Try to infer title from code content
    const firstLine = code.split('\n')[0].trim();
    const lowerLang = language.toLowerCase();
    
    if (lowerLang === 'bash' || lowerLang === 'shell' || lowerLang === 'sh' || lowerLang === 'console') {
      if (firstLine.includes('helm repo add')) {
        return 'Add Helm Repository';
      }
      if (firstLine.includes('helm install')) {
        return 'Install Chart';
      }
      if (firstLine.includes('helm upgrade')) {
        return 'Upgrade Chart';
      }
      if (firstLine.includes('helm uninstall') || firstLine.includes('helm delete')) {
        return 'Uninstall Chart';
      }
      if (firstLine.includes('kubectl')) {
        return 'Kubernetes Command';
      }
      return 'Command Line Usage';
    }

    if (lowerLang === 'yaml' || lowerLang === 'yml') {
      if (code.includes('apiVersion:') && code.includes('kind:')) {
        return 'Kubernetes Manifest';
      }
      if (code.includes('replicaCount:') || code.includes('image:') || code.includes('service:')) {
        return 'Values Configuration';
      }
      if (code.includes('global:')) {
        return 'Global Values';
      }
      return 'YAML Configuration';
    }

    if (lowerLang === 'json') {
      return 'JSON Configuration';
    }

    if (lowerLang === 'dockerfile' || lowerLang === 'docker') {
      return 'Docker Configuration';
    }

    if (lowerLang === 'helm' || lowerLang === 'gotmpl' || lowerLang === 'go-template') {
      return 'Helm Template';
    }

    if (lowerLang === 'javascript' || lowerLang === 'js') {
      return 'JavaScript Example';
    }

    if (lowerLang === 'typescript' || lowerLang === 'ts') {
      return 'TypeScript Example';
    }

    if (lowerLang === 'python' || lowerLang === 'py') {
      return 'Python Example';
    }

    return 'Code Example';
  }

  private extractExampleDescription(section: string, codeBlockIndex: number): string | undefined {
    // Look for text before the code block that might be a description
    const beforeCodeBlock = section.substring(0, codeBlockIndex);
    const lines = beforeCodeBlock.split('\n').reverse();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }
      
      // If it's a reasonable length and doesn't look like code, use it as description
      if (trimmed.length > 10 && trimmed.length < 300 && !this.looksLikeCode(trimmed)) {
        return trimmed.replace(/^[*-]\s*/, ''); // Remove bullet points
      }
      
      break; // Stop at first non-empty line
    }

    return undefined;
  }

  private looksLikeCode(text: string): boolean {
    // Simple heuristics to detect if text looks like code
    const codeIndicators = [
      /^\s*[{}[\]();,]/, // Starts with common code characters
      /[{}[\]();,]\s*$/, // Ends with common code characters
      /^\s*(helm|kubectl|docker|git)\s+/, // Common CLI commands
      /^\s*\$/, // Shell prompt
      /^\s*\/\//, // Comments
      /^\s*#/, // Comments or shell
      /^\s*apiVersion:/, // Kubernetes YAML
      /^\s*kind:/, // Kubernetes YAML
      /^\s*name:/, // YAML
      /^\s*image:/, // YAML
    ];

    return codeIndicators.some(pattern => pattern.test(text));
  }

  private normalizeLanguage(language: string): string {
    const normalized = language.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'sh': 'bash',
      'shell': 'bash',
      'console': 'bash',
      'yml': 'yaml',
      'md': 'markdown',
      'dockerfile': 'docker',
      'gotmpl': 'helm',
      'go-template': 'helm',
      'py': 'python',
    };

    return languageMap[normalized] || normalized;
  }

  private deduplicateExamples(examples: UsageExample[]): UsageExample[] {
    const seen = new Set<string>();
    const unique: UsageExample[] = [];

    for (const example of examples) {
      // Create a hash of the code content (normalize whitespace)
      const codeHash = example.code.replace(/\s+/g, ' ').trim();
      
      if (!seen.has(codeHash)) {
        seen.add(codeHash);
        unique.push(example);
      }
    }

    return unique;
  }

  cleanMarkdown(content: string): string {
    try {
      // Remove or replace common markdown elements that don't translate well
      let cleaned = content;

      // Remove badges (but keep the alt text if meaningful)
      cleaned = cleaned.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, altText) => {
        return altText && altText.length > 3 ? altText : '';
      });

      // Convert relative links to absolute GitHub links (if we can detect the repo)
      // This is a simplified version - in practice, you'd want to pass repository info
      cleaned = cleaned.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, '$1');

      // Clean up excessive whitespace
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      cleaned = cleaned.trim();

      return cleaned;
    } catch (error) {
      logger.warn('Failed to clean markdown content', { error });
      return content;
    }
  }

  extractDescription(content: string): string {
    try {
      // Look for the first substantial paragraph after any title
      const lines = content.split('\n');
      let foundDescription = false;
      let description = '';

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and headers
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
          if (foundDescription && description.length > 0) {
            break; // Stop at next section
          }
          continue;
        }

        // Skip badges and images
        if (trimmed.startsWith('![') || trimmed.startsWith('[![')) {
          continue;
        }

        // This looks like a description
        if (trimmed.length > 20) {
          if (!foundDescription) {
            description = trimmed;
            foundDescription = true;
          } else {
            // Add continuation if it's part of the same paragraph
            if (description.length + trimmed.length < 500) {
              description += ' ' + trimmed;
            } else {
              break;
            }
          }
        }
      }

      return description || 'No description available';
    } catch (error) {
      logger.warn('Failed to extract description from README', { error });
      return 'No description available';
    }
  }

  extractValuesDocumentation(valuesContent: string): UsageExample[] {
    if (!valuesContent) {
      return [];
    }

    try {
      const examples: UsageExample[] = [];
      
      // Parse the values.yaml content and create examples
      const lines = valuesContent.split('\n');
      let currentSection: string[] = [];
      let currentComment = '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('#')) {
          // This is a comment, might be documentation
          const comment = trimmed.substring(1).trim();
          if (comment.length > 0) {
            currentComment += (currentComment ? ' ' : '') + comment;
          }
        } else if (trimmed.length > 0) {
          // This is a value definition
          currentSection.push(line);
          
          // If we have accumulated comments and values, create an example
          if (currentComment && currentSection.length > 0) {
            const title = this.extractValuesTitle(currentSection[0]);
            examples.push({
              title: title || 'Values Configuration',
              description: currentComment,
              code: currentSection.join('\n'),
              language: 'yaml',
            });
            
            currentSection = [];
            currentComment = '';
          }
        } else {
          // Empty line, reset current section
          if (currentSection.length > 0) {
            currentSection = [];
            currentComment = '';
          }
        }
      }
      
      // Add any remaining section
      if (currentSection.length > 0) {
        const title = this.extractValuesTitle(currentSection[0]);
        examples.push({
          title: title || 'Values Configuration',
          description: currentComment || undefined,
          code: currentSection.join('\n'),
          language: 'yaml',
        });
      }
      
      return examples.slice(0, 5); // Limit to 5 examples from values
    } catch (error) {
      logger.warn('Failed to parse values documentation', { error });
      return [];
    }
  }

  private extractValuesTitle(valueLine: string): string {
    // Extract the key from a YAML line like "replicaCount: 1"
    const match = valueLine.match(/^(\s*)([^:]+):/);
    if (match) {
      const key = match[2].trim();
      // Convert camelCase to Title Case
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) + ' Configuration';
    }
    return 'Configuration';
  }
}

export const readmeParser = new ReadmeParser();