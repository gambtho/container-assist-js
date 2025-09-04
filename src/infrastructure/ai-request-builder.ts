/**
 * AI Request Builder Pattern
 * Eliminates boilerplate AI request construction with fluent interface
 */

import type { AnalysisResult } from '../contracts/types/session.js';
import { SamplingStrategy, type SamplingContext } from './sampling-strategy';

/**
 * AI Request interface - compatible with current MCP sampler
 */
export interface AIRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  context?: Record<string, any>;
}

/**
 * Context information that can be automatically extracted from analysis
 */
export interface AIRequestContext {
  language?: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  dependencies?: string[];
  devDependencies?: string[];
  buildSystem?: string;
  port?: number;
  entryPoint?: string;
}

/**
 * Template-based prompt configurations
 */
const PROMPT_TEMPLATES = {
  'dockerfile-generation': {
    defaultTemp: 0.2,
    defaultMaxTokens: 1500,
    promptTemplate: `Dockerfile for {{language}}{{#if languageVersion}} {{languageVersion}}{{/if}}{{#if framework}} + {{framework}}{{/if}}
Build: {{buildSystemType}}, Entry: {{entryPoint}}, Port: {{port}}

Requirements: {{optimization}} optimization{{#if multistage}}, multi-stage{{/if}}{{#if securityHardening}}, security-hardened{{/if}}{{#if includeHealthcheck}}, health check{{/if}}
{{#if baseImage}}Base: {{baseImage}}{{/if}}{{#if customInstructions}}
Custom: {{customInstructions}}{{/if}}

Output: Production Dockerfile only`,
  },

  'repository-analysis': {
    defaultTemp: 0.2,
    defaultMaxTokens: 800, // Reduced from 1200
    promptTemplate: `Analyze repository. Return JSON only:

Files: {{fileList}}
Config: {{configFiles}}
Tree: {{directoryTree}}

Output: JSON format: {"language":"<lang>","framework":"<fw>","buildSystem":{"type":"<type>","buildFile":"<file>"},"dependencies":["<deps>"],"ports":[<nums>],"entryPoint":"<file>"}`,
  },

  'dockerfile-fix': {
    defaultTemp: 0.3,
    defaultMaxTokens: 1000, // Reduced from 1200
    promptTemplate: `Fix Dockerfile error:

Current: {{dockerfile}}
Error: {{error_message}}

Requirements: Fix error, maintain security, keep functionality
Output: Corrected Dockerfile only`,
  },

  'optimization-suggestion': {
    defaultTemp: 0.4,
    defaultMaxTokens: 800,
    promptTemplate: `Suggest Docker optimizations for:

{{dockerfile}}

Focus: Size, security, performance, caching
Output: JSON array of suggestions with impact/effort ratings`,
  },

  'k8s-generation': {
    defaultTemp: 0.2,
    defaultMaxTokens: 2000,
    promptTemplate: `Generate Kubernetes manifests for:

App: {{appName}}, Image: {{image}}, Port: {{port}}
Environment: {{environment}}, Namespace: {{namespace}}
Service Type: {{serviceType}}, Replicas: {{replicas}}
{{#if ingressEnabled}}Ingress: {{ingressHost}}{{/if}}
{{#if autoscaling}}Autoscaling: {{minReplicas}}-{{maxReplicas}} @ {{targetCPU}}%{{/if}}

Output: Complete K8s YAML manifests (Deployment, Service, Ingress, ConfigMap, HPA as needed)`,
  },

  'error-analysis': {
    defaultTemp: 0.3,
    defaultMaxTokens: 600,
    promptTemplate: `Analyze build error:

Command: {{command}}
Error: {{error_output}}
Context: {{build_context}}

Output: JSON with root cause, fix steps, prevention tips`,
  },

  'json-repair': {
    defaultTemp: 0.1,
    defaultMaxTokens: 500,
    promptTemplate: `Fix malformed JSON:

{{malformed_content}}

Error: {{error_message}}

Output: Valid JSON only`,
  },
};

type TemplateId = keyof typeof PROMPT_TEMPLATES;

/**
 * Fluent builder pattern for AI requests
 * Reduces boilerplate and standardizes request construction
 */
export class AIRequestBuilder {
  private templateId?: TemplateId;
  private variables: Record<string, any> = {};
  private temperature?: number;
  private maxTokens?: number;
  private model?: string;
  private samplingContext?: SamplingContext;

  /**
   * Static factory method for creating builder with template
   * @param templateId - Template identifier
   */
  static for(templateId: TemplateId): AIRequestBuilder {
    return new AIRequestBuilder().template(templateId);
  }

  /**
   * Set the template ID
   * @param id - Template identifier
   */
  template(id: TemplateId): this {
    this.templateId = id;
    return this;
  }

  /**
   * Add variables to the request
   * @param vars - Variables to merge with existing ones
   */
  withVariables(vars: Record<string, any>): this {
    this.variables = { ...this.variables, ...vars };
    return this;
  }

  /**
   * Auto-extract context from analysis result
   * @param analysis - Repository analysis result
   */
  withContext(analysis: AnalysisResult): this {
    const context = this.extractContext(analysis);
    return this.withVariables({
      language: context.language ?? 'unknown',
      languageVersion: context.languageVersion ?? '',
      framework: context.framework ?? 'none',
      frameworkVersion: context.frameworkVersion ?? '',
      dependencies: context.dependencies?.join(', ') || '',
      devDependencies: context.devDependencies?.join(', ') || '',
      buildSystem: context.buildSystem ?? 'unknown',
      buildSystemType: context.buildSystem ?? 'unknown', // Alias for template compatibility
      port: context.port ?? 8080,
      entryPoint: context.entryPoint ?? 'index',
    });
  }

  /**
   * Add session-specific variables
   * @param sessionId - Session identifier
   * @param additionalVars - Additional session context
   */
  withSession(sessionId: string, additionalVars: Record<string, any> = {}): this {
    return this.withVariables({
      sessionId,
      ...additionalVars,
    });
  }

  /**
   * Set sampling parameters with intelligent defaults
   * @param temperature - Sampling temperature (default: template-appropriate)
   * @param maxTokens - Maximum tokens (default: template-appropriate)
   */
  withSampling(temperature?: number, maxTokens?: number): this {
    if (temperature !== undefined) {
      this.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      this.maxTokens = maxTokens;
    }
    return this;
  }

  /**
   * Add sampling context for intelligent parameter adjustment
   * @param context - Sampling context information
   */
  withSamplingContext(context: SamplingContext): this {
    this.samplingContext = context;
    return this;
  }

  /**
   * Configure for retry scenario with automatic parameter adjustment
   * @param attemptNumber - Current attempt number (1-based)
   * @param previousErrors - Previous error messages
   */
  forRetry(attemptNumber: number, previousErrors: string[] = []): this {
    this.samplingContext = {
      ...this.samplingContext,
      isRetry: true,
      attemptNumber,
      errorCount: previousErrors.length,
      previousErrors,
    };
    return this;
  }

  /**
   * Configure for specific task complexity
   * @param complexity - Task complexity level
   */
  withComplexity(complexity: 'low' | 'medium' | 'high'): this {
    this.samplingContext = {
      ...this.samplingContext,
      complexity,
    };
    return this;
  }

  /**
   * Configure for time-constrained scenarios
   * @param constraint - Time constraint level
   */
  withTimeConstraint(constraint: 'fast' | 'normal' | 'thorough'): this {
    this.samplingContext = {
      ...this.samplingContext,
      timeConstraint: constraint,
    };
    return this;
  }

  /**
   * Set model preference
   * @param model - Model identifier
   */
  withModel(model: string): this {
    this.model = model;
    return this;
  }

  /**
   * Add Docker-specific context variables
   * @param dockerContext - Docker-related configuration
   */
  withDockerContext(dockerContext: {
    baseImage?: string;
    optimization?: 'size' | 'build-speed' | 'security' | 'balanced';
    multistage?: boolean;
    securityHardening?: boolean;
    includeHealthcheck?: boolean;
  }): this {
    return this.withVariables({
      baseImage: dockerContext.baseImage ?? 'default',
      optimization: dockerContext.optimization ?? 'balanced',
      multistage: dockerContext.multistage !== false, // Default to true
      securityHardening: dockerContext.securityHardening !== false, // Default to true
      includeHealthcheck: dockerContext.includeHealthcheck !== false, // Default to true
    });
  }

  /**
   * Add Kubernetes-specific context variables
   * @param k8sContext - Kubernetes-related configuration
   */
  withKubernetesContext(k8sContext: {
    ingressEnabled?: boolean;
    ingressHost?: string;
    configMap?: Record<string, string>;
    secrets?: string[];
    minReplicas?: number;
    maxReplicas?: number;
    targetCPU?: number;
  }): this {
    return this.withVariables({
      ingressEnabled: k8sContext.ingressEnabled ?? false,
      ingressHost: k8sContext.ingressHost ?? '',
      configMap: k8sContext.configMap ?? {},
      secrets: k8sContext.secrets ?? [],
      minReplicas: k8sContext.minReplicas ?? 2,
      maxReplicas: k8sContext.maxReplicas ?? 10,
      targetCPU: k8sContext.targetCPU ?? 70,
    });
  }

  /**
   * Add error recovery context for repair scenarios
   * @param errorContext - Error and recovery information
   */
  withErrorContext(errorContext: {
    previousError?: string;
    malformedContent?: string;
    attempt?: number;
    previousAttempts?: string[];
  }): this {
    return this.withVariables({
      error_message: errorContext.previousError ?? 'Unknown error',
      malformed_content: errorContext.malformedContent ?? '',
      dockerfile: errorContext.malformedContent ?? '', // Alias for dockerfile fix
      attempt: errorContext.attempt ?? 1,
      previous_attempts: errorContext.previousAttempts?.join('; ') || '',
      repair_instruction: 'Fix the content and return only valid output',
    });
  }

  /**
   * Set output format specification
   * @param format - Expected output format
   */
  withFormat(format: string): this {
    return this.withVariables({
      output_format: format,
      format_specification: format,
    });
  }

  /**
   * Build the final AI request
   * Applies intelligent defaults based on template type
   */
  build(): AIRequest {
    if (!this.templateId) {
      throw new Error('Template ID is required');
    }

    const template = PROMPT_TEMPLATES[this.templateId];
    const prompt = this.renderPrompt(template.promptTemplate, this.variables);

    // Use sampling strategy for intelligent parameter selection
    const samplingParams = SamplingStrategy.getParameters(this.templateId, this.samplingContext);

    const result: AIRequest = {
      prompt,
      temperature: this.temperature ?? samplingParams.temperature,
      maxTokens: this.maxTokens ?? samplingParams.maxTokens,
      context: {
        ...this.variables,
        ...(this.samplingContext && { _samplingContext: this.samplingContext }), // Include context for debugging
      },
    };

    if (this.model) {
      result.model = this.model;
    }

    return result;
  }

  /**
   * Extract context information from analysis result
   * @param analysis - Repository analysis result
   */
  private extractContext(analysis: AnalysisResult): AIRequestContext {
    // Extract dependencies
    const allDeps = analysis.dependencies ?? [];
    const dependencies = allDeps.filter((d) => d.type !== 'dev').map((d) => d.name);
    const devDependencies = allDeps.filter((d) => d.type === 'dev').map((d) => d.name);

    const result: AIRequestContext = {
      language: analysis.language,
      dependencies,
      devDependencies,
    };

    if (analysis.language_version) {
      result.languageVersion = analysis.language_version;
    }

    if (analysis.framework) {
      result.framework = analysis.framework;
    }

    if (analysis.framework_version) {
      result.frameworkVersion = analysis.framework_version;
    }

    if (analysis.build_system?.type) {
      result.buildSystem = analysis.build_system.type;
    }

    if (analysis.ports?.[0]) {
      result.port = analysis.ports[0];
    }

    const analysisWithEntryPoints = analysis as AnalysisResult & { entry_points?: string[] };
    if (analysisWithEntryPoints.entry_points?.[0]) {
      result.entryPoint = analysisWithEntryPoints.entry_points[0];
    }

    return result;
  }

  /**
   * Simple template rendering - replaces {{variable}} with values
   * @param template - Template string with {{variable}} placeholders
   * @param variables - Variables to substitute
   */
  private renderPrompt(template: string, variables: Record<string, any>): string {
    let result = template;

    // First handle {{#if variable}} content {{/if}} patterns
    result = result.replace(
      /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs,
      (_match, varName, content) => {
        const value = variables[varName];
        return value ? content : '';
      },
    );

    // Then handle simple {{variable}} patterns
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      const value = variables[varName];
      return value != null ? String(value) : '';
    });

    return result;
  }
}

/**
 * Convenience function for creating builder
 * @param templateId - Template identifier
 */
export function createAIRequest(templateId: TemplateId): AIRequestBuilder {
  return AIRequestBuilder.for(templateId);
}

// Export template IDs for type safety
export type { TemplateId };
export { PROMPT_TEMPLATES };
