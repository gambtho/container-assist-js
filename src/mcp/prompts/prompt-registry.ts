/**
 * SDK-Native Prompt Registry
 *
 * Replaces the custom PromptTemplatesManager with a system that uses
 * SDK types directly and provides prompt management.
 */

import type { Logger } from 'pino';
import {
  ListPromptsResult,
  GetPromptResult,
  PromptArgument,
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
 * SDK-compatible prompt definition
 */
export interface SDKPromptDefinition {
  name: string;
  description: string;
  category?: string;
  arguments: PromptArgument[];
  dynamicArguments?: (context: TemplateContext) => PromptArgument[];
  generateMessages: (
    args: Record<string, any>,
    context?: TemplateContext,
  ) => Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text' | 'image';
      text?: string;
      imageUrl?: string;
    };
  }>;
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
        generateMessages: (args, context) => [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: this.generateDockerfilePrompt(args, context),
            },
          },
        ],
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
        generateMessages: (args, context) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: this.generateK8sPrompt(args, context),
            },
          },
        ],
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
        generateMessages: (args, context) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: this.generateSecurityAnalysisPrompt(args, context),
            },
          },
        ],
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
        generateMessages: (args, context) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: this.generateStrategyPrompt(args, context),
            },
          },
        ],
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
        generateMessages: (args, context) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: this.generateParameterValidationPrompt(args, context),
            },
          },
        ],
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
        generateMessages: (args, context) => [
          {
            role: 'user',
            content: {
              type: 'text',
              text: this.generateParameterSuggestionsPrompt(args, context),
            },
          },
        ],
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

    // Generate messages using the prompt's generator
    const context = args ? this.extractContextFromArgs(args) : undefined;
    const rawMessages = prompt.generateMessages(args || {}, context);

    // Transform messages to match MCP SDK format
    const messages = rawMessages.map((msg) => ({
      role: msg.role,
      content:
        msg.content.type === 'text'
          ? { type: 'text' as const, text: msg.content.text || '' }
          : {
              type: 'image' as const,
              data: '', // Image data would need to be base64 encoded
              mimeType: 'image/png', // Default mime type
            },
    }));

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
      messages: messages as any, // Type assertion needed due to SDK type complexity
    };
  }

  /**
   * Get prompts by category
   */
  getPromptsByCategory(category: string): SDKPromptDefinition[] {
    return Array.from(this.prompts.values()).filter((prompt) => prompt.category === category);
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

  /**
   * Generate Dockerfile-specific prompt text
   */
  private generateDockerfilePrompt(args: Record<string, any>, context?: TemplateContext): string {
    const language = args.language || context?.language || 'unknown';
    const framework = args.framework || context?.framework;
    const securityLevel = args.securityLevel || context?.securityLevel || 'basic';
    const baseImage = args.baseImage;

    let prompt = `Generate an optimized Dockerfile for a ${language} application`;

    if (framework) {
      prompt += ` using ${framework}`;
    }

    prompt += `.\n\nRequirements:\n- Security level: ${securityLevel}`;

    if (baseImage) {
      prompt += `\n- Use base image: ${baseImage}`;
    }

    if (context?.dependencies?.length) {
      prompt += `\n- Dependencies: ${context.dependencies.join(', ')}`;
    }

    prompt += `\n- Follow containerization best practices`;
    prompt += `\n- Optimize for ${context?.optimization || 'balanced'} performance`;

    if (context?.focus) {
      prompt += `\n- Focus on: ${context.focus}`;
    }

    return prompt;
  }

  /**
   * Generate Kubernetes-specific prompt text
   */
  private generateK8sPrompt(args: Record<string, any>, context?: TemplateContext): string {
    const appName = args.appName;
    const replicas = args.replicas || 1;
    const environment = args.environment || context?.environment || 'development';
    const resourceLimits = args.resourceLimits;

    let prompt = `Generate Kubernetes deployment manifests for application "${appName}"`;
    prompt += `\n\nConfiguration:`;
    prompt += `\n- Environment: ${environment}`;
    prompt += `\n- Replicas: ${replicas}`;

    if (resourceLimits) {
      prompt += `\n- Resource limits: ${resourceLimits}`;
    }

    if (args.highAvailability) {
      prompt += `\n- High availability: enabled`;
    }

    if (args.securityContext) {
      prompt += `\n- Security context: strict`;
    }

    prompt += `\n\nInclude:\n- Deployment\n- Service\n- ConfigMap (if needed)\n- Ingress (if applicable)`;
    prompt += `\n\nFollow Kubernetes best practices and security guidelines.`;

    return prompt;
  }

  /**
   * Generate security analysis prompt text
   */
  private generateSecurityAnalysisPrompt(
    args: Record<string, any>,
    context?: TemplateContext,
  ): string {
    const configType = args.configType;
    const complianceStandard = args.complianceStandard;
    const environment = context?.environment;

    let prompt = `Analyze the ${configType} configuration for security vulnerabilities`;

    if (complianceStandard) {
      prompt += ` according to ${complianceStandard} standards`;
    }

    prompt += `.\n\nAnalysis should include:`;
    prompt += `\n- Vulnerability assessment`;
    prompt += `\n- Best practice compliance`;
    prompt += `\n- Risk evaluation`;
    prompt += `\n- Remediation recommendations`;

    if (environment === 'production' && args.productionChecks) {
      prompt += `\n- Production-specific security checks`;
    }

    return prompt;
  }

  /**
   * Generate strategy-specific optimization prompt
   */
  private generateStrategyPrompt(args: Record<string, any>, context?: TemplateContext): string {
    const strategy = args.strategy;

    let prompt = `Generate optimized containerization strategy for ${strategy} optimization`;

    if (context?.language) {
      prompt += ` for ${context.language} application`;
    }

    if (context?.framework) {
      prompt += ` using ${context.framework}`;
    }

    prompt += `.\n\nStrategy focus: ${strategy}`;

    if (context?.focus) {
      prompt += `\nSpecific focus: ${context.focus}`;
    }

    if (context?.environment) {
      prompt += `\nTarget environment: ${context.environment}`;
    }

    prompt += `\n\nProvide specific recommendations for optimizing the containerization approach.`;

    return prompt;
  }

  /**
   * Generate parameter validation prompt text
   */
  private generateParameterValidationPrompt(
    args: Record<string, any>,
    context?: TemplateContext,
  ): string {
    const toolName = args.toolName;
    const parameters = args.parameters;
    const validationRules = args.validationRules || 'Apply standard validation rules';

    let prompt = `Validate the parameters for the "${toolName}" tool and provide detailed feedback.\n\n`;

    prompt += `**Tool:** ${toolName}\n`;
    prompt += `**Parameters to validate:**\n${parameters}\n\n`;

    if (args.context) {
      prompt += `**Context:**\n${args.context}\n\n`;
    }

    prompt += `**Validation Requirements:**\n`;
    prompt += `- ${validationRules}\n`;
    prompt += `- Check for required parameters\n`;
    prompt += `- Validate parameter types and formats\n`;
    prompt += `- Ensure compatibility between parameters\n`;

    if (context?.environment === 'production') {
      prompt += `- Apply production-ready validation checks\n`;
    }

    if (context?.securityLevel === 'strict') {
      prompt += `- Apply strict security validation rules\n`;
    }

    if (context?.language) {
      prompt += `- Consider ${context.language}-specific requirements\n`;
    }

    prompt += `\n**Expected Response Format:**\n`;
    prompt += `Provide insights about any errors, warnings, or recommendations for improvement. `;
    prompt += `Focus on actionable feedback that helps users understand what needs to be fixed or optimized.`;

    return prompt;
  }

  /**
   * Generate parameter suggestions prompt text
   */
  private generateParameterSuggestionsPrompt(
    args: Record<string, any>,
    context?: TemplateContext,
  ): string {
    const toolName = args.toolName;
    const partialParameters = args.partialParameters;
    const existingParams = args.existingParams || 'none';

    let prompt = `Generate intelligent parameter suggestions for the "${toolName}" tool based on the provided context and partial parameters.\n\n`;

    prompt += `**Tool:** ${toolName}\n`;
    prompt += `**Current Parameters:**\n${partialParameters}\n`;
    prompt += `**Existing Parameter Keys:** ${existingParams}\n\n`;

    if (args.context) {
      prompt += `**Context:**\n${args.context}\n\n`;
    }

    prompt += `**Suggestion Requirements:**\n`;
    prompt += `- Suggest missing required parameters\n`;
    prompt += `- Recommend optimal parameter values based on best practices\n`;
    prompt += `- Consider tool-specific requirements and constraints\n`;
    prompt += `- Provide alternative parameter options where applicable\n`;

    if (context?.targetType) {
      prompt += `- Optimize for ${context.targetType} deployment\n`;
    }

    if (context?.environment) {
      prompt += `- Optimize for ${context.environment} environment\n`;
    }

    if (context?.securityLevel) {
      prompt += `- Apply ${context.securityLevel} security level requirements\n`;
    }

    if (context?.framework) {
      prompt += `- Consider ${context.framework} framework-specific optimizations\n`;
    }

    prompt += `\n**Expected Response Format:**\n`;
    prompt += `Provide specific parameter recommendations with explanations. `;
    prompt += `Focus on practical suggestions that improve tool execution and follow containerization best practices.`;

    return prompt;
  }
}
