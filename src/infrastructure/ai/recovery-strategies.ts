/**
 * Concrete Recovery Strategies
 * Implements specific recovery approaches for different types of AI failures
 */

import { BaseRecoveryStrategy, type RecoveryStrategy } from './recovery-strategy';
import type { AIRequest } from '../ai-request-builder';
import type { ErrorContext } from './error-context';
import { ErrorType } from './error-context';

/**
 * JSON Repair Strategy
 * Specialized in fixing malformed JSON responses and syntax errors
 */
export class JSONRepairStrategy extends BaseRecoveryStrategy {
  readonly name = 'json_repair';
  readonly priority = 1; // Highest priority for JSON errors
  readonly description = 'Fix malformed JSON syntax and structure';
  override readonly maxAttempts = 2; // Limited attempts to avoid loops

  protected override canHandleSpecific(error: Error, context: ErrorContext): boolean {
    // Handle JSON parsing errors
    if (context.errorType === ErrorType.PARSING_ERROR) {
      return true;
    }

    // Handle specific JSON-related patterns
    if (this.hasPattern(context, 'json_syntax')) {
      return true;
    }

    // Handle common JSON error messages
    return this.errorContains(error, [
      'json',
      'parse',
      'syntax',
      'unexpected token',
      'invalid json',
      'malformed',
      'bracket',
      'brace',
      'comma',
      'quote'
    ]);
  }

  protected override async createRecoveryRequest(
    originalRequest: AIRequest,
    error: Error,
    context: ErrorContext
  ): Promise<AIRequest> {
    // Extract malformed content from partial result or error message
    const malformedContent = this.extractMalformedContent(context);

    // Get specific JSON syntax issues
    const syntaxIssues = this.analyzeSyntaxIssues(error.message, malformedContent);

    // Create repair-specific prompt
    const repairPrompt = this.buildRepairPrompt(
      originalRequest.prompt,
      malformedContent,
      error.message,
      syntaxIssues,
      context.attempt
    );

    return {
      ...originalRequest,
      prompt: repairPrompt,
      temperature: 0.1, // Very low temperature for precise repairs
      maxTokens: Math.min(originalRequest.maxTokens ?? 1000, 800), // Focused output
      context: {
        ...originalRequest.context,
        _repairMode: true,
        _malformedContent: malformedContent,
        _syntaxIssues: syntaxIssues
      }
    };
  }

  /**
   * Extract malformed content from context or error details
   */
  private extractMalformedContent(context: ErrorContext): string {
    if (context.partialResult) {
      if (typeof context.partialResult === 'string') {
        return context.partialResult;
      }
      return JSON.stringify(context.partialResult, null, 2);
    }

    // Try to extract from error message
    const lastError = context.previousErrors[context.previousErrors.length - 1];
    if (!lastError) {
      return ';'
    }
    const jsonMatch = lastError.match(/(?:JSON|json)[\s\S]*?(\{[\s\S]*?\}|\[[\s\S]*?\])/);
    return jsonMatch?.[1] || ';'
  }

  /**
   * Analyze specific syntax issues in the malformed JSON
   */
  private analyzeSyntaxIssues(errorMessage: string, content: string): string[] {
    const issues: string[] = [];

    if (errorMessage.toLowerCase().includes('unexpected token')) {
      issues.push('Unexpected token detected - check for missing commas or quotes');
    }

    if (errorMessage.includes('Unexpected end') || content.includes('...')) {
      issues.push('Incomplete JSON - response may have been truncated');
    }

    if (content.includes('```')) {``
      issues.push('Remove markdown code fences from JSON output');
    }

    // Check for common structural issues
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      issues.push(`Mismatched braces: ${openBraces} opening, ${closeBraces} closing`);`
    }

    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(`Mismatched brackets: ${openBrackets} opening, ${closeBrackets} closing`);`
    }

    return issues;
  }

  /**
   * Build specialized repair prompt
   */
  private buildRepairPrompt(
    originalPrompt: string,
    malformedContent: string,
    errorMessage: string,
    syntaxIssues: string[],
    attempt: number
  ): string {
    const urgency = attempt > 1 ? 'CRITICAL: ' : '';

    return `${urgency}Fix this malformed JSON and return ONLY valid JSON:``

BROKEN JSON:
malformedContent}

ERROR: ${errorMessage}

ISSUES FOUND:
syntaxIssues.map((issue) => `- ${issue}`).join('\n')}`

RULES:
1. Output ONLY valid JSON - no markdown, no explanations
2. Fix all syntax errors (missing commas, quotes, braces)
3. Complete any truncated structures
4. Preserve all data where possible
5. Follow the original request intent: ${originalPrompt.split('\n')[0]}

FIXED JSON:`;``
  }

  /**
   * Validate that the repaired result is valid JSON
   */
  validateResult(result: unknown, _context: ErrorContext): boolean {
    if (typeof result !== 'string') {
      return false;
    }

    try {
      const parsed = JSON.parse(result.trim());
      return typeof parsed === 'object';
    } catch {
      return false;
    }
  }

  /**
   * Analyze why JSON repair failed
   */
  analyzeFailure(error: Error, context: ErrorContext): string[] {
    const insights: string[] = [];

    if (error.message.includes('still invalid')) {
      insights.push('JSON repair attempted but syntax errors remain');
      insights.push('Consider using simplification strategy to reduce complexity');
    }

    if (context.attempt > 1) {
      insights.push('Multiple JSON repair attempts failed');
      insights.push('May indicate fundamental prompt or model issues');
    }

    return insights;
  }

/**
 * Simplification Strategy
 * Reduces request complexity to improve success rate
 */
export class SimplificationStrategy extends BaseRecoveryStrategy {
  readonly name = 'simplification';
  readonly priority = 2;
  readonly description = 'Simplify request to reduce complexity and improve success rate';
  override readonly maxAttempts = 2;

  protected override canHandleSpecific(error: Error, context: ErrorContext): boolean {
    // Good for complex requests that fail
    if (context.attempt > 1) {
      return true;
    }

    // Handle timeout and incomplete responses
    if (context.errorType === ErrorType.TIMEOUT) {
      return true;
    }

    if (this.hasPattern(context, 'incomplete_response')) {
      return true;
    }

    // Handle complex prompts (heuristic: long prompts or many variables)
    if (context.originalRequest?.prompt && context.originalRequest.prompt.length > 1000) {
      return true;
    }

    const variableCount = Object.keys(context.originalVariables).length;
    if (variableCount > 8) {
      return true;
    }

    return this.errorContains(error, ['complex', 'timeout', 'incomplete', 'truncated', 'too long']);
  }

  protected override async createRecoveryRequest(
    originalRequest: AIRequest,
    _error: Error,
    context: ErrorContext
  ): Promise<AIRequest> {
    // Simplify the prompt
    const simplifiedPrompt = this.simplifyPrompt(originalRequest.prompt, context);

    // Reduce variable complexity
    const simplifiedVariables = this.simplifyVariables(context.originalVariables);

    // Adjust parameters for simpler, faster response
    return {
      ...originalRequest,
      prompt: simplifiedPrompt,
      temperature: Math.max(0.1, (originalRequest.temperature ?? 0.2) - 0.05),
      maxTokens: Math.min(originalRequest.maxTokens ?? 1000, 600), // Shorter response
      context: {
        ...originalRequest.context,
        ...simplifiedVariables,
        _simplified: true,
        _simplificationLevel: context.attempt
      }
    };
  }

  /**
   * Simplify prompt by removing optional details and focusing on essentials
   */
  private simplifyPrompt(originalPrompt: string, context: ErrorContext): string {
    let simplified = originalPrompt;

    // Remove optional sections (common patterns)
    simplified = simplified.replace(
      /\n\n(Additional|Optional|Notes?|Examples?)[\s\S]*?(?=\n\n|\n$|$)/gi,
      ''
    );

    // Simplify conditional sections
    simplified = simplified.replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, '');

    // Focus on core requirements
    const lines = simplified.split('\n');
    const essentialLines = lines.filter((line) => {
      const lower = line.toLowerCase();
      return (
        !lower.includes('example') &&
        !lower.includes('note') &&
        !lower.includes('optional') &&
        line.trim().length > 0
      );
    });

    // Add simplification instruction
    const simplificationNote =
      context.attempt > 1
        ? '\n\nIMPORTANT: Keep response simple and focused. Previous attempts were too complex.'
        : '\n\nKeep response concise and essential.';

    return essentialLines.join('\n') + simplificationNote;
  }

  /**
   * Reduce variable complexity by focusing on essential information
   */
  private simplifyVariables(variables: Record<string, any>): Record<string, any> {
    const simplified: Record<string, any> = {};

    // Prioritize essential variables
    const essentialKeys = ['language', 'framework', 'port', 'entryPoint', 'buildSystem'];

    essentialKeys.forEach((key) => {
      if (variables[key] !== undefined) {
        simplified[key] = variables[key];
      }
    });

    // Simplify arrays by taking only first few items
    Object.entries(variables).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 3) {
        simplified[key] = `${value.slice(0, 3).join(', ')}...`;`
      } else if (typeof value === 'string' && value.length > 100) {
        // Truncate long strings
        simplified[key] = `${value.substring(0, 100)}...`;`
      } else if (!essentialKeys.includes(key) && Object.keys(simplified).length < 8) {
        // Include non-essential variables up to limit
        simplified[key] = value;
      }
    });

    return simplified;
  }

/**
 * Alternative Template Strategy
 * Switches to different prompt templates or formats
 */
export class AlternativeTemplateStrategy extends BaseRecoveryStrategy {
  readonly name = 'alternative_template';
  readonly priority = 3;
  readonly description = 'Try alternative prompt template or format';
  override readonly maxAttempts = 2;

  // Map of template alternatives
  private templateAlternatives: Record<string, string[]> = {
    'dockerfile-generation': ['dockerfile-simple', 'dockerfile-basic'],
    'repository-analysis': ['analysis-simple', 'analysis-basic'],
    'k8s-generation': ['k8s-simple', 'k8s-basic'],
    'error-analysis': ['error-simple'],
    'optimization-suggestion': ['optimization-basic']
  };

  protected override canHandleSpecific(error: Error, context: ErrorContext): boolean {
    // Use when specific template keeps failing
    if (context.attempt > 1 && context.templateId in this.templateAlternatives) {
      return true;
    }

    // Use for template or format errors
    if (context.errorType === ErrorType.TEMPLATE_ERROR) {
      return true;
    }

    if (this.hasPattern(context, 'wrong_format')) {
      return true;
    }

    return this.errorContains(error, ['template', 'format', 'structure', 'expected format']);
  }

  protected override async createRecoveryRequest(
    originalRequest: AIRequest,
    _error: Error,
    context: ErrorContext
  ): Promise<AIRequest> {
    // Try to find an alternative template
    const alternativeTemplate = this.selectAlternativeTemplate(context);

    if (alternativeTemplate) {
      // Use alternative template approach
      return this.createAlternativeTemplateRequest(originalRequest, context, alternativeTemplate);
    } else {
      // Fall back to generic alternative approach
      return this.createGenericAlternativeRequest(originalRequest, context);
    }
  }

  /**
   * Select alternative template based on usage history
   */
  private selectAlternativeTemplate(context: ErrorContext): string | null {
    const alternatives = this.templateAlternatives[context.templateId] || [];

    // Find first alternative not yet tried
    const usedStrategies = context.strategiesUsed ?? [];
    for (const alt of alternatives) {
      if (!usedStrategies.some((strategy) => strategy.includes(alt))) {
        return alt;
      }
    }

    return null;
  }

  /**
   * Create request with alternative template
   */
  private createAlternativeTemplateRequest(
    originalRequest: AIRequest,
    context: ErrorContext,
    templateId: string
  ): AIRequest {
    // Simplified prompts for alternative templates
    const alternativePrompts: Record<string, string> = {
      'dockerfile-simple':
        'Create basic Dockerfile for {{language}}{{#if framework}} with {{framework}}{{/if}}. Entry: {{entryPoint}}, Port: {{port}}',
      'analysis-simple':
        'Analyze project. Language: {{language}}, Framework: {{framework}}, Build: {{buildSystem}}',
      'k8s-simple': 'Generate Kubernetes deployment for {{language}} app on port {{port}}',
      'error-simple': 'Fix this error: {{error_message}}',
      'optimization-basic': 'List 3 improvements for: {{dockerfile}}'
    };

    const prompt = alternativePrompts[templateId] || this.createGenericPrompt(context);

    return {
      ...originalRequest,
      prompt: this.renderSimplePrompt(prompt, context.originalVariables),
      temperature: 0.2,
      maxTokens: 800, // Conservative token limit
      context: {
        ...originalRequest.context,
        _alternativeTemplate: templateId,
        _originalTemplate: context.templateId
      }
    };
  }

  /**
   * Create generic fallback prompt when no specific template alternative exists
   */
  private createGenericPrompt(context: ErrorContext): string {
    const templateType = context.templateId ?? 'general';

    // Generic prompts based on template type
    const genericPrompts: Record<string, string> = {
      dockerfile: 'Create a simple Dockerfile for the application',
      analysis: 'Analyze the project structure and provide basic information',
      k8s: 'Generate basic Kubernetes deployment configuration',
      optimization: 'Suggest basic improvements',
      general: 'Provide a helpful response based on the context'
    };

    // Match template type or use general fallback
    for (const [type, prompt] of Object.entries(genericPrompts)) {
      if (templateType.includes(type)) {
        return prompt;
      }
    }

    return genericPrompts.general ?? 'Provide a helpful response based on the context';
  }

  /**
   * Create generic alternative request without specific template
   */
  private createGenericAlternativeRequest(
    originalRequest: AIRequest,
    context: ErrorContext
  ): AIRequest {
    // Extract core intent from original prompt
    const coreIntent = this.extractCoreIntent(originalRequest.prompt);

    const alternativePrompt = `${coreIntent}``

Requirements: Simple, clear, direct response only.
Format: ${this.inferRequiredFormat(context)}
No explanations, just the requested content.`;``

    return {
      ...originalRequest,
      prompt: alternativePrompt,
      temperature: 0.15,
      maxTokens: 600,
      context: {
        ...originalRequest.context,
        _genericAlternative: true
      }
    };
  }

  /**
   * Extract core intent from complex prompt
   */
  private extractCoreIntent(prompt: string): string {
    // Take first meaningful line as core intent
    const lines = prompt.split('\n').filter((line) => line.trim().length > 10);
    return lines[0] || prompt.substring(0, 100);
  }

  /**
   * Infer required format from context
   */
  private inferRequiredFormat(context: ErrorContext): string {
    if (context.templateId.includes('json') || context.errorType === ErrorType.PARSING_ERROR) {
      return 'Valid JSON only';
    }
    if (context.templateId.includes('dockerfile')) {
      return 'Dockerfile format';
    }
    if (context.templateId.includes('k8s') || context.templateId.includes('kubernetes')) {
      return 'YAML format';
    }
    return 'Plain text';
  }

  /**
   * Simple template rendering for alternatives
   */
  private renderSimplePrompt(template: string, variables: Record<string, any>): string {
    let result = template;

    // Handle {{#if var}} content {{/if}}
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs,
      (_match, varName, content) => {
        return variables[varName] ? content : '';
      }
    );

    // Handle {{var}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      return variables[varName] || ';'
    });

    return result;
  }

/**
 * Fallback Default Strategy
 * Last resort with minimal, hard-coded prompts
 */
export class FallbackDefaultStrategy extends BaseRecoveryStrategy {
  readonly name = 'fallback_default';
  readonly priority = 10; // Lowest priority (last resort)
  readonly description = 'Use minimal fallback prompt as last resort';
  override readonly maxAttempts = 1; // Only try once

  protected override canHandleSpecific(_error: Error, context: ErrorContext): boolean {
    // Always available as last resort
    return context.attempt > 2;
  }

  protected override async createRecoveryRequest(
    originalRequest: AIRequest,
    _error: Error,
    context: ErrorContext
  ): Promise<AIRequest> {
    // Ultra-simple fallback based on template type
    const fallbackPrompt = this.createFallbackPrompt(context);

    const result: AIRequest = {
      prompt: fallbackPrompt,
      temperature: 0.1, // Very conservative
      maxTokens: 300, // Very limited
      context: {
        _fallbackMode: true,
        _originalTemplate: context.templateId,
        language: context.originalVariables.language ?? 'unknown'
      }
    };

    if (originalRequest.model) {
      result.model = originalRequest.model;
    }

    return result;
  }

  /**
   * Create minimal fallback prompt
   */
  private createFallbackPrompt(context: ErrorContext): string {
    const language = context.originalVariables.language ?? 'application';
    const port = context.originalVariables.port ?? '8080';

    // Ultra-simple prompts by category
    const fallbacks: Record<string, string> = {
      dockerfile: `FROM node:16\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE ${port}\nCMD ["npm", "start"]`,`
      analysis: `{"language": "${language}", "framework": "unknown", "buildSystem": {"type": "npm"}, "ports": [${port}]}`,`
      k8s: `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: app\n  template:\n    spec:\n      containers:\n      - name: app\n        image: app:latest\n        ports:\n        - containerPort: ${port}`,`
      error: 'Check syntax and fix formatting issues.',
      optimization: '["Use multi-stage build", "Minimize image size", "Add health checks"]'
    };

    // Determine fallback type
    const templateId = (context.templateId ?? 'general').toLowerCase();
    if (templateId.includes('dockerfile')) return fallbacks.dockerfile ?? ';'
    if (templateId.includes('analysis')) return fallbacks.analysis ?? ';'
    if (templateId.includes('k8s') || templateId.includes('kubernetes')) return fallbacks.k8s ?? ';'
    if (templateId.includes('error')) return fallbacks.error ?? ';'
    if (templateId.includes('optimization')) return fallbacks.optimization ?? ';'

    // Generic fallback
    return `Simple ${language ?? 'application'} configuration completed.`;`
  }

  /**
   * Fallback results are always considered valid (last resort)
   */
  validateResult(result: unknown, _context: ErrorContext): boolean {
    return typeof result === 'string' && result.trim().length > 0;
  }

/**
 * Export all strategies for easy registration
 */
export const DEFAULT_RECOVERY_STRATEGIES: RecoveryStrategy[] = [
  new JSONRepairStrategy(),
  new SimplificationStrategy(),
  new AlternativeTemplateStrategy(),
  new FallbackDefaultStrategy()
