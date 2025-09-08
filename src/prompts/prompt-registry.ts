/**
 * SDK-Native Prompt Registry
 *
 * Single consolidated prompt registry using SDK types directly.
 * Provides prompt management with optional template rendering.
 */

import type { Logger } from 'pino';
import {
  ListPromptsResult,
  GetPromptResult,
  PromptArgument,
  PromptMessage,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Template context for dynamic prompt generation
 */
export interface TemplateContext {
  repositoryPath?: string;
  language?: string;
  framework?: string;
  dependencies?: string[];
  containerType?: 'dockerfile' | 'k8s-manifest';
  targetType?: 'dockerfile' | 'kubernetes' | 'analysis' | 'general';
  securityLevel?: 'basic' | 'standard' | 'strict';
  environment?: 'development' | 'staging' | 'production';
  optimization?: 'security' | 'performance' | 'size' | 'balanced';
  focus?: string;
  customVariables?: Record<string, string>;
}

/**
 * Simple template rendering helper
 * Supports both {{variable}} and {{#conditional}}...{{/conditional}} syntax
 * Logic:
 * - Replace variables that have values
 * - Handle conditional blocks: show content only if variable exists
 * - Preserve standalone variables that don't have values
 */
function renderTemplate(template: string, args: Record<string, any>): string {
  // First handle conditional blocks {{#var}}...{{/var}}
  let result = template.replace(
    /\{\{#(\w+)\}\}([^]*?)\{\{\/(\w+)\}\}/g,
    (match, openKey, content, closeKey) => {
      if (openKey !== closeKey) {
        return match; // Malformed, leave as-is
      }
      // If the variable exists and is truthy, render the content
      if (args[openKey] !== undefined && args[openKey]) {
        return renderTemplate(content, args); // Recursively render the content
      }
      return ''; // Remove the entire conditional block
    },
  );

  // Then handle regular variables {{var}}
  const hasAnyArgs = Object.keys(args).length > 0;
  const preservedVariables = new Set(['baseImage', 'customVariables']);

  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (args[key] !== undefined) {
      return String(args[key]);
    }

    // If no args provided, preserve all template variables for future use
    if (!hasAnyArgs) {
      return match;
    }

    // If some args provided, preserve certain variables as placeholders for further processing
    // Remove others to avoid confusion in final output
    return preservedVariables.has(key) ? match : '';
  });

  return result;
}

/**
 * SDK-compatible prompt definition
 */
export interface SDKPromptDefinition {
  name: string;
  description: string;
  category?: string;
  arguments: PromptArgument[];
  dynamicArguments?: (context: TemplateContext) => PromptArgument[];
  template?: string; // Simple text template with {{variables}}
  generateMessages?: (args: Record<string, any>, context?: TemplateContext) => PromptMessage[];
}

/**
 * SDK-Native Prompt Registry
 */
export class PromptRegistry {
  private prompts: Map<string, SDKPromptDefinition> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'PromptRegistry' });
    this.initializeDefaultPrompts();
  }

  /**
   * Initialize default prompts using SDK patterns
   */
  private initializeDefaultPrompts(): void {
    const defaultPrompts: SDKPromptDefinition[] = [
      // Simplified prompts using templates
      {
        name: 'dockerfile-generation',
        description: 'Generate an optimized Dockerfile for the given application',
        category: 'containerization',
        arguments: [
          {
            name: 'language',
            description: 'Programming language of the application',
            required: true,
          },
          {
            name: 'framework',
            description: 'Framework used by the application',
            required: false,
          },
          {
            name: 'securityLevel',
            description: 'Security level (basic, enhanced, strict)',
            required: false,
          },
          {
            name: 'baseImage',
            description: 'Preferred base image',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.dependencies?.length
            ? [
                {
                  name: 'dependencies',
                  description: `Detected dependencies: ${context.dependencies.join(', ')}`,
                  required: false,
                },
              ]
            : []),
          ...(context.language
            ? [
                {
                  name: 'optimizations',
                  description: `${context.language}-specific optimizations to apply`,
                  required: false,
                },
              ]
            : []),
        ],
        template: `Generate an optimized Dockerfile for {{language}} application.
{{#framework}}Framework: {{framework}}{{/framework}}
{{#securityLevel}}Security level: {{securityLevel}}{{/securityLevel}}
{{#baseImage}}Base image: {{baseImage}}{{/baseImage}}

Requirements:
- Follow containerization best practices
- Optimize for {{optimization}} performance
- Use appropriate base images
- Include security considerations
- Minimize image size where possible

Please provide a production-ready Dockerfile.`,
      },
      {
        name: 'k8s-manifest-generation',
        description: 'Generate Kubernetes deployment manifests with best practices',
        category: 'orchestration',
        arguments: [
          {
            name: 'appName',
            description: 'Application name for the deployment',
            required: true,
          },
          {
            name: 'replicas',
            description: 'Number of replicas',
            required: false,
          },
          {
            name: 'environment',
            description: 'Target environment (development, staging, production)',
            required: false,
          },
          {
            name: 'resourceLimits',
            description: 'CPU and memory limits',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.environment === 'production'
            ? [
                {
                  name: 'highAvailability',
                  description: 'Enable high availability features (anti-affinity, PDBs)',
                  required: false,
                },
              ]
            : []),
          ...(context.securityLevel === 'strict'
            ? [
                {
                  name: 'securityContext',
                  description: 'Apply strict security contexts and policies',
                  required: false,
                },
              ]
            : []),
        ],
        template: `Generate Kubernetes deployment manifests for application "{{appName}}".

Configuration:
- Environment: {{environment}}
- Replicas: {{replicas}}
{{#resourceLimits}}- Resource limits: {{resourceLimits}}{{/resourceLimits}}
{{#highAvailability}}- High availability: enabled{{/highAvailability}}
{{#securityContext}}- Security context: strict{{/securityContext}}

Include:
- Deployment
- Service
- ConfigMap (if needed)
- Ingress (if applicable)
- HorizontalPodAutoscaler (for scaling)
- PodDisruptionBudget (for availability)

Follow Kubernetes best practices and security guidelines.`,
      },
      {
        name: 'security-analysis',
        description: 'Analyze container configuration for security vulnerabilities',
        category: 'security',
        arguments: [
          {
            name: 'configType',
            description: 'Type of configuration (dockerfile, k8s-manifest)',
            required: true,
          },
          {
            name: 'content',
            description: 'Configuration content to analyze',
            required: false,
          },
          {
            name: 'complianceStandard',
            description: 'Compliance standard to check against (CIS, NIST, SOC2)',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.environment === 'production'
            ? [
                {
                  name: 'productionChecks',
                  description: 'Additional production security checks',
                  required: false,
                },
              ]
            : []),
        ],
        template: `Analyze {{configType}} configuration for security vulnerabilities.
{{#complianceStandard}}Apply {{complianceStandard}} compliance checks.{{/complianceStandard}}
{{#content}}

Configuration to analyze:
{{content}}
{{/content}}

Analysis should include:
- Vulnerability assessment
- Best practice compliance
- Risk evaluation
- Remediation recommendations
{{#productionChecks}}- Production-specific security checks{{/productionChecks}}`,
      },
      {
        name: 'strategy-optimization',
        description: 'Generate strategy-specific optimization prompts for sampling',
        category: 'sampling',
        arguments: [
          {
            name: 'strategy',
            description: 'Strategy type (security, performance, size, balanced)',
            required: true,
          },
          {
            name: 'context',
            description: 'Analysis context including language and framework',
            required: true,
          },
        ],
        template: `Generate optimized containerization strategy for {{strategy}} optimization.
Language: {{language}}
{{#framework}}Framework: {{framework}}{{/framework}}
{{#context}}Context: {{context}}{{/context}}

Strategy focus: {{strategy}}
{{#focus}}Specific focus: {{focus}}{{/focus}}
{{#environment}}Target environment: {{environment}}{{/environment}}

Provide specific recommendations for optimizing the containerization approach.`,
      },
      {
        name: 'parameter-validation',
        description: 'Validate tool parameters with AI assistance',
        category: 'validation',
        arguments: [
          {
            name: 'toolName',
            description: 'Name of the tool being validated',
            required: true,
          },
          {
            name: 'parameters',
            description: 'Parameters to validate (JSON format)',
            required: true,
          },
          {
            name: 'context',
            description: 'Validation context (JSON format)',
            required: false,
          },
          {
            name: 'validationRules',
            description: 'Specific validation rules to apply',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.language
            ? [
                {
                  name: 'languageSpecific',
                  description: `${context.language}-specific validation rules`,
                  required: false,
                },
              ]
            : []),
          ...(context.environment === 'production'
            ? [
                {
                  name: 'productionChecks',
                  description: 'Additional production environment validations',
                  required: false,
                },
              ]
            : []),
        ],
        template: `Validate parameters for the "{{toolName}}" tool.

Parameters: {{parameters}}
{{#context}}Context: {{context}}{{/context}}
{{#validationRules}}Validation rules: {{validationRules}}{{/validationRules}}

Check for:
- Required parameter presence
- Parameter type validity
- Value range compliance
- Parameter compatibility
- Security considerations
{{#productionChecks}}- Production-ready validation checks{{/productionChecks}}
{{#languageSpecific}}- {{language}}-specific requirements{{/languageSpecific}}

Provide specific validation feedback with actionable recommendations.`,
      },
      {
        name: 'parameter-suggestions',
        description: 'Generate parameter suggestions with AI assistance',
        category: 'validation',
        arguments: [
          {
            name: 'toolName',
            description: 'Name of the tool needing parameters',
            required: true,
          },
          {
            name: 'partialParameters',
            description: 'Existing partial parameters (JSON format)',
            required: true,
          },
          {
            name: 'context',
            description: 'Parameter suggestion context (JSON format)',
            required: false,
          },
          {
            name: 'existingParams',
            description: 'List of existing parameter names',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.targetType
            ? [
                {
                  name: 'targetSpecific',
                  description: `${context.targetType}-specific parameter suggestions`,
                  required: false,
                },
              ]
            : []),
          ...(context.framework
            ? [
                {
                  name: 'frameworkOptimized',
                  description: `${context.framework} framework optimizations`,
                  required: false,
                },
              ]
            : []),
        ],
        template: `Generate parameter suggestions for "{{toolName}}".

Current parameters: {{partialParameters}}
{{#context}}Context: {{context}}{{/context}}
{{#existingParams}}Existing parameter keys: {{existingParams}}{{/existingParams}}

Suggest:
- Missing required parameters
- Optimal parameter values
- Performance improvements
- Security enhancements
- Best practice configurations
{{#targetSpecific}}- {{targetType}}-specific optimizations{{/targetSpecific}}
{{#frameworkOptimized}}- {{framework}} framework optimizations{{/frameworkOptimized}}

Provide practical suggestions with explanations.`,
      },
      {
        name: 'dockerfile-sampling',
        description: 'Generate Dockerfile variants for sampling',
        category: 'sampling',
        arguments: [
          {
            name: 'strategy',
            description: 'Optimization strategy (security, performance, size, balanced)',
            required: true,
          },
          {
            name: 'language',
            description: 'Programming language',
            required: true,
          },
          {
            name: 'context',
            description: 'Application context',
            required: false,
          },
        ],
        template: `Generate an optimized Dockerfile for {{strategy}} strategy.

Language: {{language}}
{{#context}}Context: {{context}}{{/context}}

Requirements:
- Optimize for {{strategy}}
- Follow containerization best practices
- Use appropriate base images
- Include security considerations
- Minimize image size where possible

Please provide a production-ready Dockerfile.`,
      },

      // Add generate-dockerfile as alias to dockerfile-generation
      {
        name: 'generate-dockerfile',
        description: 'Generate a Dockerfile for a project based on analysis',
        category: 'containerization',
        arguments: [
          {
            name: 'language',
            description: 'Programming language of the application',
            required: true,
          },
          {
            name: 'framework',
            description: 'Framework used by the application',
            required: false,
          },
          {
            name: 'ports',
            description: 'Comma-separated port numbers',
            required: false,
          },
          {
            name: 'baseImage',
            description: 'Suggested base image',
            required: false,
          },
          {
            name: 'requirements',
            description: 'Dependency information',
            required: false,
          },
          {
            name: 'repoSummary',
            description: 'Repository summary (2-4 sentences)',
            required: true,
          },
        ],
        template: `Generate a production-ready Dockerfile for a {{language}} project.

Project Details:
- Language: {{language}}
{{#framework}}
- Framework: {{framework}}
{{/framework}}
{{#ports}}
- Ports: {{ports}}
{{/ports}}
{{#baseImage}}
- Suggested Base Image: {{baseImage}}
{{/baseImage}}
{{#requirements}}
- Dependencies: {{requirements}}
{{/requirements}}

Repository Summary:
{{repoSummary}}

Requirements:
1. Use multi-stage builds when appropriate
2. Include security best practices
3. Minimize image size
4. Include proper health checks
5. Set appropriate working directory and user
6. Copy files efficiently
7. Expose necessary ports

Return only the Dockerfile content without explanation or code fences.`,
      },

      // Fix Dockerfile prompt
      {
        name: 'fix-dockerfile',
        description: 'Fix issues in an existing Dockerfile based on analysis and error context',
        category: 'containerization',
        arguments: [
          {
            name: 'dockerfileContent',
            description: 'Current Dockerfile content to fix',
            required: true,
          },
          {
            name: 'errors',
            description: 'Array of specific errors to address',
            required: false,
          },
          {
            name: 'buildError',
            description: 'Build error message that occurred',
            required: false,
          },
          {
            name: 'language',
            description: 'Programming language of the application',
            required: false,
          },
          {
            name: 'framework',
            description: 'Framework used by the application',
            required: false,
          },
          {
            name: 'analysis',
            description: 'Repository analysis context',
            required: false,
          },
        ],
        template: `Fix the provided Dockerfile to resolve build issues and improve best practices.

Current Dockerfile:
{{dockerfileContent}}

{{#buildError}}
Build Error:
{{buildError}}
{{/buildError}}

{{#errors}}
Specific Issues to Fix:
{{#each errors}}
- {{this}}
{{/each}}
{{/errors}}

{{#language}}
Language: {{language}}
{{/language}}

{{#framework}}
Framework: {{framework}}
{{/framework}}

{{#analysis}}
Repository Context:
{{analysis}}
{{/analysis}}

Requirements:
1. Fix any syntax errors and build failures
2. Apply containerization best practices
3. Ensure proper build caching and layer optimization
4. Use security best practices (non-root user, minimal packages)
5. Optimize for image size where possible
6. Maintain the original functionality and intent

Return only the corrected Dockerfile content without explanation or code fences.`,
      },

      // Generate Kubernetes Manifests prompt
      {
        name: 'generate-k8s-manifests',
        description: 'Generate Kubernetes manifests for containerized applications',
        category: 'orchestration',
        arguments: [
          {
            name: 'appName',
            description: 'Application name for the deployment',
            required: true,
          },
          {
            name: 'imageId',
            description: 'Docker image to deploy',
            required: true,
          },
          {
            name: 'namespace',
            description: 'Kubernetes namespace (defaults to default)',
            required: false,
          },
          {
            name: 'replicas',
            description: 'Number of replicas to deploy',
            required: false,
          },
          {
            name: 'ports',
            description: 'Comma-separated port numbers to expose',
            required: false,
          },
          {
            name: 'environment',
            description: 'Target environment (development, staging, production)',
            required: false,
          },
          {
            name: 'manifestTypes',
            description: 'Array of manifest types to generate (Deployment, Service, etc.)',
            required: false,
          },
          {
            name: 'resources',
            description: 'Resource limits and requests specification',
            required: false,
          },
          {
            name: 'repoAnalysis',
            description: 'Repository analysis context for better manifest generation',
            required: false,
          },
          {
            name: 'securityLevel',
            description: 'Security level (standard, strict)',
            required: false,
          },
          {
            name: 'highAvailability',
            description: 'Enable high availability features',
            required: false,
          },
        ],
        template: `Generate production-ready Kubernetes manifests for containerized application.

Application Details:
- Name: {{appName}}
- Image: {{imageId}}
{{#namespace}}
- Namespace: {{namespace}}
{{/namespace}}
{{#replicas}}
- Replicas: {{replicas}}
{{/replicas}}
{{#ports}}
- Ports: {{ports}}
{{/ports}}
{{#environment}}
- Environment: {{environment}}
{{/environment}}

Required Manifests:
{{#manifestTypes}}
{{#each manifestTypes}}
- {{this}}
{{/each}}
{{/manifestTypes}}
{{^manifestTypes}}
- Deployment
- Service
{{/manifestTypes}}

{{#resources}}
Resource Requirements:
{{resources}}
{{/resources}}

{{#repoAnalysis}}
Repository Context:
{{repoAnalysis}}
{{/repoAnalysis}}

Configuration:
{{#securityLevel}}
- Security Level: {{securityLevel}}
{{/securityLevel}}
{{#highAvailability}}
- High Availability: enabled
{{/highAvailability}}

Generate complete YAML manifests with the following requirements:

1. **Deployment Manifest:**
   - Use appropriate resource limits and requests
   - Include health checks (readiness/liveness probes)
   - Set security contexts (non-root user when possible)
   - Use proper labeling and selectors
   - Include restart policies

2. **Service Manifest:**
   - Appropriate service type for the environment
   - Proper port configuration
   - Correct selectors matching deployment labels

3. **Additional Manifests (if requested):**
   - ConfigMap for configuration (if needed)
   - Ingress for external access (if production environment)
   - HorizontalPodAutoscaler for scaling (if production)
   - PodDisruptionBudget for high availability
   - NetworkPolicy for security (if strict security level)

Best Practices:
- Use specific image tags (avoid :latest in production)
- Set resource limits to prevent resource starvation
- Include proper labels for monitoring and management
- Use namespaces for environment isolation
- Enable security contexts for better security posture
- Include annotations for better observability

Return only the YAML manifests separated by "---" without explanation or code fences.`,
      },

      // Enhance Repository Analysis prompt
      {
        name: 'enhance-repo-analysis',
        description: 'Enhance repository analysis with AI insights and recommendations',
        category: 'analysis',
        arguments: [
          {
            name: 'language',
            description: 'Primary programming language detected',
            required: true,
          },
          {
            name: 'framework',
            description: 'Framework detected (if any)',
            required: false,
          },
          {
            name: 'buildSystem',
            description: 'Build system detected',
            required: false,
          },
          {
            name: 'dependencies',
            description: 'Comma-separated list of key dependencies',
            required: false,
          },
          {
            name: 'hasTests',
            description: 'Whether tests are present in the repository',
            required: false,
          },
          {
            name: 'hasDocker',
            description: 'Whether Docker files are already present',
            required: false,
          },
          {
            name: 'ports',
            description: 'Detected or inferred ports',
            required: false,
          },
          {
            name: 'fileCount',
            description: 'Approximate number of source files',
            required: false,
          },
          {
            name: 'repoStructure',
            description: 'Brief description of repository structure',
            required: false,
          },
        ],
        template: `Provide enhanced analysis insights for a {{language}} repository.

Repository Details:
- Language: {{language}}
{{#framework}}
- Framework: {{framework}}
{{/framework}}
{{#buildSystem}}
- Build System: {{buildSystem}}
{{/buildSystem}}
{{#dependencies}}
- Key Dependencies: {{dependencies}}
{{/dependencies}}
{{#hasTests}}
- Has Tests: {{hasTests}}
{{/hasTests}}
{{#hasDocker}}
- Has Docker Files: {{hasDocker}}
{{/hasDocker}}
{{#ports}}
- Detected Ports: {{ports}}
{{/ports}}
{{#fileCount}}
- File Count: {{fileCount}}
{{/fileCount}}
{{#repoStructure}}
- Structure: {{repoStructure}}
{{/repoStructure}}

Provide analysis in the following format:

**Insights:**
- [2-3 key insights about the project architecture and technology choices]

**Containerization Recommendations:**
- [Specific recommendations for containerizing this project]
- [Build strategy suggestions]
- [Performance and security considerations]

**Risk Assessment:**
- [Potential challenges or risks for containerization]
- [Dependency complexity assessment]
- [Security considerations]

**Deployment Recommendations:**
- [Suggested deployment patterns]
- [Orchestration recommendations]
- [Monitoring and observability suggestions]

Keep the response concise but actionable, focusing on practical containerization and deployment guidance.`,
      },
    ];

    defaultPrompts.forEach((prompt) => {
      this.prompts.set(prompt.name, prompt);
    });

    this.logger.info({ count: defaultPrompts.length }, 'Prompts initialized');
  }

  /**
   * Register a new prompt definition
   */
  register(prompt: SDKPromptDefinition): void {
    this.prompts.set(prompt.name, prompt);
    this.logger.debug({ name: prompt.name, category: prompt.category }, 'Prompt registered');
  }

  /**
   * List all available prompts (SDK-compatible)
   */
  async listPrompts(category?: string): Promise<ListPromptsResult> {
    const allPrompts = Array.from(this.prompts.values());
    const filteredPrompts = category
      ? allPrompts.filter((p) => p.category === category)
      : allPrompts;

    const prompts = filteredPrompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    }));

    this.logger.debug(
      {
        category,
        totalPrompts: allPrompts.length,
        filteredCount: prompts.length,
      },
      'Listed prompts',
    );

    return { prompts };
  }

  /**
   * Get a specific prompt (SDK-compatible)
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<GetPromptResult> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Build arguments with dynamic context if available
    let finalArguments = [...prompt.arguments];
    if (prompt.dynamicArguments && args) {
      const context = this.extractContextFromArgs(args);
      const dynamicArgs = prompt.dynamicArguments(context);
      finalArguments = [...finalArguments, ...dynamicArgs];
    }

    // Generate messages using either custom generator or template
    let messages: PromptMessage[];

    if (prompt.generateMessages) {
      // Use custom message generator if provided
      const context = args ? this.extractContextFromArgs(args) : undefined;
      messages = prompt.generateMessages(args || {}, context);
    } else if (prompt.template) {
      // Use template rendering for simple prompts
      const renderedText = this.renderPromptTemplate(prompt.template, args || {});
      messages = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: renderedText,
          },
        },
      ];
    } else {
      // Fallback to empty message
      messages = [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Execute ${name} with provided arguments`,
          },
        },
      ];
    }

    this.logger.debug(
      {
        name,
        argumentCount: finalArguments.length,
        messageCount: messages.length,
      },
      'Generated prompt',
    );

    return {
      name: prompt.name,
      description: prompt.description,
      arguments: finalArguments,
      messages,
    };
  }

  /**
   * Get prompts by category
   */
  getPromptsByCategory(category: string): SDKPromptDefinition[] {
    return Array.from(this.prompts.values()).filter((prompt) => prompt.category === category);
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.prompts.has(name);
  }

  /**
   * Get all prompt names synchronously (for tests)
   */
  getPromptNames(): string[] {
    return Array.from(this.prompts.keys());
  }

  /**
   * Get prompt template info without rendering
   */
  getPromptInfo(name: string): { description: string; arguments: PromptArgument[] } | null {
    const prompt = this.prompts.get(name);
    return prompt
      ? {
          description: prompt.description,
          arguments: prompt.arguments,
        }
      : null;
  }

  /**
   * Get prompt with messages in ToolContext-compatible format
   * This method is used by the ToolContext bridge to provide prompts
   * with proper message formatting.
   */
  async getPromptWithMessages(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    description: string;
    messages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }>;
  }> {
    const prompt = this.prompts.get(name);
    if (!prompt) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Get the MCP-format result
    const mcpResult = await this.getPrompt(name, args);

    // Convert MCP messages to ToolContext format with content arrays
    const messages = mcpResult.messages.map((msg) => ({
      role: msg.role,
      content: [{ type: 'text' as const, text: String(msg.content.text) }],
    }));

    return {
      description: prompt.description,
      messages,
    };
  }

  /**
   * Render a prompt template with arguments
   * Supports {{variable}} and {{#condition}}...{{/condition}} syntax
   */
  private renderPromptTemplate(template: string, args: Record<string, any>): string {
    // First handle conditional blocks {{#var}}...{{/var}}
    let rendered = template.replace(
      /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/(\1)\}\}/g,
      (_, key, content) => {
        // Include content if variable is truthy
        return args[key] ? content : '';
      },
    );

    // Then handle simple variable replacement
    rendered = renderTemplate(rendered, args);

    // Clean up any remaining empty lines
    rendered = rendered
      .split('\n')
      .filter((line) => line.trim() !== '' || line === '')
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');

    return rendered;
  }

  /**
   * Extract template context from prompt arguments
   */
  private extractContextFromArgs(args: Record<string, any>): TemplateContext {
    return {
      repositoryPath: args.repositoryPath,
      language: args.language,
      framework: args.framework,
      dependencies: args.dependencies
        ? args.dependencies.split(',').map((d: string) => d.trim())
        : undefined,
      containerType: args.containerType,
      securityLevel: args.securityLevel,
      environment: args.environment,
      optimization: args.optimization,
      focus: args.focus,
      customVariables: args.customVariables,
    };
  }
}
