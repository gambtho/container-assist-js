/**
 * MCP Prompt Templates System
 *
 * Provides context-aware prompt templates for AI interaction.
 * Templates adapt based on repository analysis and user context.
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../../types/core.js';
import type {
  PromptArgument,
  GetPromptResult,
  ListPromptsResult,
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
  securityLevel?: 'basic' | 'enhanced' | 'strict';
  environment?: 'development' | 'staging' | 'production';
  customVariables?: Record<string, string>;
}

/**
 * Prompt template definition with MCP SDK compatibility
 */
export interface AiPromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  context: TemplateContext;
  arguments?: PromptArgument[];
  dynamicArguments?: (context: TemplateContext) => PromptArgument[];
}

/**
 * Prompt Templates Manager
 */
export class PromptTemplatesManager {
  private templates: Map<string, AiPromptTemplate> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'PromptTemplatesManager' });
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default prompt templates
   */
  private initializeDefaultTemplates(): void {
    const defaultTemplates: AiPromptTemplate[] = [
      {
        id: 'dockerfile-generation',
        name: 'Generate Dockerfile',
        description: 'Generate an optimized Dockerfile for the given application',
        category: 'containerization',
        context: {},
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
      },
      {
        id: 'k8s-manifest-generation',
        name: 'Generate Kubernetes Manifests',
        description: 'Generate Kubernetes deployment manifests with best practices',
        category: 'orchestration',
        context: {},
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
      },
      {
        id: 'security-analysis',
        name: 'Security Analysis',
        description: 'Analyze container configuration for security vulnerabilities',
        category: 'security',
        context: {},
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
      },
      {
        id: 'troubleshooting-assistant',
        name: 'Troubleshooting Assistant',
        description: 'Help diagnose and fix containerization issues',
        category: 'support',
        context: {},
        arguments: [
          {
            name: 'issueType',
            description: 'Type of issue (build, deployment, runtime)',
            required: true,
          },
          {
            name: 'errorMessage',
            description: 'Error message or symptoms',
            required: true,
          },
          {
            name: 'environment',
            description: 'Environment where issue occurred',
            required: false,
          },
        ],
        dynamicArguments: (context) => [
          ...(context.language
            ? [
                {
                  name: 'languageSpecific',
                  description: `${context.language}-specific troubleshooting steps`,
                  required: false,
                },
              ]
            : []),
        ],
      },
    ];

    defaultTemplates.forEach((template) => {
      this.templates.set(template.id, template);
    });

    this.logger.info({ count: defaultTemplates.length }, 'Default prompt templates initialized');
  }

  /**
   * List all available prompt templates
   */
  async listPrompts(category?: string): Promise<Result<ListPromptsResult>> {
    try {
      const templates = Array.from(this.templates.values());

      const filteredTemplates = category
        ? templates.filter((t) => t.category === category)
        : templates;

      const prompts = filteredTemplates.map((template) => ({
        name: template.name,
        description: template.description,
        arguments: template.arguments || [],
      }));

      this.logger.debug(
        {
          category,
          totalTemplates: templates.length,
          filteredCount: prompts.length,
        },
        'Listed prompt templates',
      );

      return Success({ prompts });
    } catch (error) {
      this.logger.error({ error, category }, 'Failed to list prompts');
      return Failure(
        `Failed to list prompts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a specific prompt template with context-aware arguments
   */
  async getPrompt(name: string, context?: TemplateContext): Promise<Result<GetPromptResult>> {
    try {
      const template = this.findTemplateByName(name);
      if (!template) {
        return Failure(`Prompt template not found: ${name}`);
      }

      // Build arguments with dynamic context
      let arguments_: PromptArgument[] = [...(template.arguments || [])];

      if (template.dynamicArguments && context) {
        const dynamicArgs = template.dynamicArguments(context);
        arguments_ = [...arguments_, ...dynamicArgs];
      }

      // Generate context-aware description
      const contextualDescription = this.generateContextualDescription(template, context);

      const result: GetPromptResult = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: contextualDescription,
            },
          },
        ],
        name: template.name,
        description: contextualDescription,
        arguments: arguments_,
      };

      this.logger.debug(
        {
          templateId: template.id,
          argumentCount: arguments_.length,
          hasContext: !!context,
        },
        'Generated prompt template',
      );

      return Success(result);
    } catch (error) {
      this.logger.error({ error, name, context }, 'Failed to get prompt');
      return Failure(
        `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Register a custom prompt template
   */
  async registerTemplate(template: AiPromptTemplate): Promise<Result<void>> {
    try {
      // Validate template structure
      if (!template.id || !template.name || !template.description) {
        return Failure('Template must have id, name, and description');
      }

      this.templates.set(template.id, template);

      this.logger.info(
        {
          templateId: template.id,
          name: template.name,
          category: template.category,
        },
        'Custom prompt template registered',
      );

      return Success(undefined);
    } catch (error) {
      this.logger.error({ error, template }, 'Failed to register template');
      return Failure(
        `Failed to register template: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update template context for dynamic argument generation
   */
  updateTemplateContext(templateId: string, context: TemplateContext): Result<void> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        return Failure(`Template not found: ${templateId}`);
      }

      template.context = { ...template.context, ...context };

      this.logger.debug(
        {
          templateId,
          contextKeys: Object.keys(context),
        },
        'Template context updated',
      );

      return Success(undefined);
    } catch (error) {
      this.logger.error({ error, templateId, context }, 'Failed to update template context');
      return Failure(
        `Failed to update template context: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): AiPromptTemplate[] {
    return Array.from(this.templates.values()).filter((template) => template.category === category);
  }

  /**
   * Get template statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<string, number>;
    withDynamicArgs: number;
  } {
    const templates = Array.from(this.templates.values());
    const byCategory: Record<string, number> = {};

    templates.forEach((template) => {
      byCategory[template.category] = (byCategory[template.category] || 0) + 1;
    });

    const withDynamicArgs = templates.filter((t) => !!t.dynamicArguments).length;

    return {
      total: templates.length,
      byCategory,
      withDynamicArgs,
    };
  }

  /**
   * Find template by name (case-insensitive)
   */
  private findTemplateByName(name: string): AiPromptTemplate | undefined {
    for (const template of this.templates.values()) {
      if (
        template.name.toLowerCase() === name.toLowerCase() ||
        template.id.toLowerCase() === name.toLowerCase()
      ) {
        return template;
      }
    }
    return undefined;
  }

  /**
   * Generate context-aware description for a template
   */
  private generateContextualDescription(
    template: AiPromptTemplate,
    context?: TemplateContext,
  ): string {
    let description = template.description;

    if (context) {
      // Add context-specific information to description
      const contextInfo: string[] = [];

      if (context.language) {
        contextInfo.push(`optimized for ${context.language}`);
      }

      if (context.framework) {
        contextInfo.push(`using ${context.framework} framework`);
      }

      if (context.environment) {
        contextInfo.push(`for ${context.environment} environment`);
      }

      if (context.securityLevel && context.securityLevel !== 'basic') {
        contextInfo.push(`with ${context.securityLevel} security`);
      }

      if (contextInfo.length > 0) {
        description += ` (${contextInfo.join(', ')})`;
      }
    }

    return description;
  }
}
