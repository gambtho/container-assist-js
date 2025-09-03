export type ContextPriority = 'high' | 'medium' | 'low';

export interface ContextOptimizationResult {
  optimizedContent: string;
  originalTokens: number;
  optimizedTokens: number;
  reductionPercentage: number;
  applicationsApplied: string[];
}

export class AIContextManager {
  private maxContextTokens: Map<ContextPriority, number> = new Map([
    ['high', 3500],
    ['medium', 2500],
    ['low', 1500]
  ]);

  private tokenEstimator: TokenEstimator;

  constructor() {
    this.tokenEstimator = new TokenEstimator();
  }

  optimizeContext(
    context: string,
    priority: ContextPriority = 'medium'
  ): ContextOptimizationResult {
    const originalTokens = this.tokenEstimator.estimate(context);
    const maxTokens = this.maxContextTokens.get(priority) || 2500;
    const applicationsApplied: string[] = [];

    if (originalTokens <= maxTokens) {
      return {
        optimizedContent: context,
        originalTokens,
        optimizedTokens: originalTokens,
        reductionPercentage: 0,
        applicationsApplied
      };
    }

    let optimized = context;

    // Apply optimization strategies based on priority
    switch (priority) {
      case 'high':
        optimized = this.minimalOptimization(optimized);
        applicationsApplied.push('minimal_optimization');
        break;
      case 'medium':
        optimized = this.moderateOptimization(optimized);
        applicationsApplied.push('moderate_optimization');
        break;
      case 'low':
        optimized = this.aggressiveOptimization(optimized);
        applicationsApplied.push('aggressive_optimization');
        break;
    }

    const optimizedTokens = this.tokenEstimator.estimate(optimized);

    // If still too long, apply progressive truncation
    if (optimizedTokens > maxTokens) {
      optimized = this.progressiveTruncation(optimized, maxTokens);
      applicationsApplied.push('progressive_truncation');
    }

    const finalTokens = this.tokenEstimator.estimate(optimized);
    const reductionPercentage = ((originalTokens - finalTokens) / originalTokens) * 100;

    return {
      optimizedContent: optimized,
      originalTokens,
      optimizedTokens: finalTokens,
      reductionPercentage,
      applicationsApplied
    };
  }

  private minimalOptimization(context: string): string {
    let optimized = context;

    // Remove comments and empty lines only
    const lines = optimized.split('\n');
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*') &&
        trimmed !== '*/'
      );
    });

    optimized = filteredLines.join('\n');

    // Compress multiple consecutive newlines
    optimized = optimized.replace(/\n{3,}/g, '\n\n');

    // Remove excessive whitespace
    optimized = optimized.replace(/[ \t]+/g, ' ');

    return optimized.trim();
  }

  private moderateOptimization(context: string): string {
    let optimized = this.minimalOptimization(context);

    // Remove import statements (can be inferred from usage)
    optimized = optimized.replace(/^import .* from .*$/gm, '');
    optimized = optimized.replace(/^const .* = require\(.*\)$/gm, '');

    // Remove obvious boilerplate
    const boilerplatePatterns = [
      /export default \w+;?$/gm,
      /module\.exports = \w+;?$/gm,
      /\/\*\*[\s\S]*?\*\//g, // JSDoc comments
      /^\s*console\.log\(.*\);?$/gm, // Console logs
      /^\s*\/\/.*$/gm // Single-line comments (again for safety)
    ];

    boilerplatePatterns.forEach((pattern) => {
      optimized = optimized.replace(pattern, '');
    });

    // Compress function bodies for context (keep signatures)
    optimized = this.compressFunctionBodies(optimized);

    // Remove redundant type annotations in TypeScript
    optimized = this.removeRedundantTypes(optimized);

    return optimized.replace(/\n{3,}/g, '\n\n').trim();
  }

  private aggressiveOptimization(context: string): string {
    let optimized = this.moderateOptimization(context);

    // Extract only essential code structure
    const lines = optimized.split('\n');
    const essential = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.includes('function') ||
        trimmed.includes('class') ||
        trimmed.includes('interface') ||
        trimmed.includes('type') ||
        trimmed.includes('export') ||
        trimmed.includes('async') ||
        trimmed.includes('const') ||
        trimmed.includes('let') ||
        trimmed.includes('var') ||
        this.isControlStructure(trimmed) ||
        this.isImportantDeclaration(trimmed)
      );
    });

    optimized = essential.join('\n');

    // Create structural summary for very large contexts
    if (this.tokenEstimator.estimate(optimized) > 2000) {
      optimized = this.createStructuralSummary(optimized);
    }

    return optimized.trim();
  }

  private compressFunctionBodies(content: string): string {
    // Replace function bodies with ... for context awareness
    return content.replace(
      /((?:function|async function|\w+\s*:\s*function|\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)\s*\{)[^}]*(\})/g,
      '$1 /* ... */ $2'
    );
  }

  private removeRedundantTypes(content: string): string {
    // Remove obvious type annotations that can be inferred
    let optimized = content;

    // Remove simple type annotations
    optimized = optimized.replace(/:\s*string(?=\s*[=,;)])/g, '');
    optimized = optimized.replace(/:\s*number(?=\s*[=,;)])/g, '');
    optimized = optimized.replace(/:\s*boolean(?=\s*[=,;)])/g, '');

    return optimized;
  }

  private isControlStructure(line: string): boolean {
    const controlKeywords = [
      'if',
      'else',
      'for',
      'while',
      'switch',
      'case',
      'try',
      'catch',
      'finally'
    ];
    return controlKeywords.some((keyword) => line.includes(keyword));
  }

  private isImportantDeclaration(line: string): boolean {
    const important = ['enum', 'namespace', 'declare', 'abstract', 'extends', 'implements'];
    return important.some((keyword) => line.includes(keyword));
  }

  private createStructuralSummary(content: string): string {
    const lines = content.split('\n');
    const summary: string[] = [];

    let currentClass = ';';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.includes('class ')) {
        const match = trimmed.match(/class\s+(\w+)/);
        if (match?.[1]) {
          currentClass = match[1];
          summary.push(`class ${currentClass} { /* ... */ }`);
        }
      } else if (trimmed.includes('interface ')) {
        const match = trimmed.match(/interface\s+(\w+)/);
        if (match) {
          summary.push(`interface ${match[1]} { /* ... */ }`);
        }
      } else if (trimmed.includes('function ') && !trimmed.includes('{')) {
        const match = trimmed.match(
          /((?:export\s+)?(?:async\s+)?function\s+\w+\([^)]*\)(?:\s*:\s*[^{]+)?)/
        );
        if (match) {
          summary.push(`${match[1]} { /* ... */ }`);
        }
      } else if (trimmed.includes('enum ')) {
        const match = trimmed.match(/enum\s+(\w+)/);
        if (match) {
          summary.push(`enum ${match[1]} { /* ... */ }`);
        }
      }
    }

    return summary.join('\n');
  }

  private progressiveTruncation(content: string, maxTokens: number): string {
    const estimatedTokens = this.tokenEstimator.estimate(content);

    if (estimatedTokens <= maxTokens) {
      return content;
    }

    // Calculate approximate character limit based on token estimate
    const ratio = maxTokens / estimatedTokens;
    const targetLength = Math.floor(content.length * ratio * 0.9); // 10% buffer

    // Try to truncate at natural boundaries
    const truncated = this.truncateAtBoundary(content, targetLength);

    return `${truncated}\n\n/* ... [content truncated for token limit] ... */`;
  }

  private truncateAtBoundary(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find good truncation points in order of preference
    const boundaries = [
      '\n\n', // Double newline (paragraph break)
      '\n}', // End of block
      '\n', // Single newline
      ';', // End of statement
      ',', // Comma
      ' ' // Space
    ];

    for (const boundary of boundaries) {
      const lastIndex = content.lastIndexOf(boundary, maxLength);
      if (lastIndex > maxLength * 0.7) {
        // Don't truncate too aggressively'
        return content.substring(0, lastIndex + boundary.length);
      }
    }

    // Fallback to hard truncation
    return content.substring(0, maxLength);
  }

  // Method to estimate if content needs optimization
  needsOptimization(content: string, priority: ContextPriority): boolean {
    const tokens = this.tokenEstimator.estimate(content);
    const maxTokens = this.maxContextTokens.get(priority) || 2500;
    return tokens > maxTokens;
  }

  // Method to get recommended priority based on content characteristics
  recommendPriority(content: string, taskType?: string): ContextPriority {
    const tokens = this.tokenEstimator.estimate(content);

    // High priority for critical tasks or complex content
    if (taskType === 'error_diagnosis' || taskType === 'security_analysis') {
      return 'high';
    }

    // Medium priority for moderate content
    if (tokens < 3000) {
      return 'medium';
    }

    // Low priority for large content that needs aggressive optimization
    return 'low';
  }

  // Utility method to split large contexts into chunks
  splitIntoChunks(content: string, priority: ContextPriority): string[] {
    const maxTokens = this.maxContextTokens.get(priority) || 2500;
    const totalTokens = this.tokenEstimator.estimate(content);

    if (totalTokens <= maxTokens) {
      return [content];
    }

    const chunks: string[] = [];
    const lines = content.split('\n');
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const line of lines) {
      const lineTokens = this.tokenEstimator.estimate(line);

      if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [line];
        currentTokens = lineTokens;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    return chunks;
  }
}

export class TokenEstimator {
  // Improved token estimation based on content type
  estimate(text: string): number {
    if (!text) return 0;

    // Basic character-based estimation with adjustments
    let estimate = Math.ceil(text.length / 4);

    // Adjust for code vs natural language
    if (this.isCode(text)) {
      // Code tends to have more tokens per character
      estimate = Math.ceil(text.length / 3.5);
    } else {
      // Natural language tends to have fewer tokens per character
      estimate = Math.ceil(text.length / 4.5);
    }

    // Adjust for special characters and formatting
    const specialChars = (text.match(/[{}()\[\];,.]/g) || []).length;
    estimate += specialChars * 0.5;

    // Adjust for whitespace (less impact on tokens)
    const whitespace = (text.match(/\s/g) || []).length;
    estimate -= whitespace * 0.2;

    return Math.max(1, Math.floor(estimate));
  }

  private isCode(text: string): boolean {
    // Simple heuristics to detect code content
    const codeIndicators = [
      /function\s+\w+/,
      /class\s+\w+/,
      /import\s+.*from/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /if\s*\([^)]+\)/,
      /for\s*\([^)]+\)/,
      /while\s*\([^)]+\)/,
      /\w+\s*:\s*\w+/,
      /=>/,
      /\{[\s\S]*\}/
    ];

    const matches = codeIndicators.reduce((count, pattern) => {
      return count + (text.match(pattern) || []).length;
    }, 0);

    return matches > 2;
  }

  // Method to estimate tokens for different content types
  estimateByType(text: string, contentType: 'code' | 'documentation' | 'data' | 'mixed'): number {
    const ratios = {
      code: 3.5,
      documentation: 4.5,
      data: 3.8,
      mixed: 4.0
    };

    return Math.ceil(text.length / ratios[contentType]);
  }
}
