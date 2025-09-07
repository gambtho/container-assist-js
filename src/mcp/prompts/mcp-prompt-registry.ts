/**
 * Optimized SDK Prompt Registry - Simplified using SDK features
 */

import type { Logger } from 'pino';
import { GetPromptResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Simplified prompt template definition
 */
interface PromptTemplate {
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  text: string;
}

/**
 * Optimized SDK Prompt Registry using simplified patterns
 */
export class MCPPromptRegistry {
  private templates: Map<string, PromptTemplate> = new Map();

  constructor(private logger: Logger) {
    this.logger = logger.child({ component: 'MCPPromptRegistry' });
    this.initializeTemplates();
  }

  /**
   * Get prompt with SDK compatibility and local fallback
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<GetPromptResult> {
    try {
      // In a full implementation, this would use SDK client
      // For now, fall back to local generation
      return this.generateLocalPrompt(name, args);
    } catch (error) {
      // Fall back to local prompt generation
      this.logger.warn(
        { name, error: error instanceof Error ? error.message : String(error) },
        'SDK prompt fetch failed, using local fallback',
      );
      return this.generateLocalPrompt(name, args);
    }
  }

  /**
   * Simplified local prompt generation
   */
  private generateLocalPrompt(name: string, args: Record<string, any> = {}): GetPromptResult {
    const template = this.templates.get(name);
    if (!template) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    return {
      name,
      description: template.description,
      arguments: template.arguments,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: this.renderTemplate(template.text, args),
          },
        },
      ],
    };
  }

  /**
   * Simple template rendering with {{variable}} syntax
   */
  private renderTemplate(template: string, args: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      args[key] !== undefined ? String(args[key]) : `{{${key}}}`,
    );
  }

  /**
   * Initialize simplified templates
   */
  private initializeTemplates(): void {
    const templates: Record<string, PromptTemplate> = {
      'dockerfile-sampling': {
        description: 'Generate Dockerfile variants for sampling',
        arguments: [
          { name: 'strategy', description: 'Optimization strategy', required: true },
          { name: 'language', description: 'Programming language', required: true },
          { name: 'context', description: 'Application context', required: false },
        ],
        text: `Generate an optimized Dockerfile for {{strategy}} strategy.

Language: {{language}}
Context: {{context}}

Requirements:
- Optimize for {{strategy}}
- Follow containerization best practices
- Use appropriate base images
- Include security considerations
- Minimize image size where possible

Please provide a production-ready Dockerfile.`,
      },

      'dockerfile-generation': {
        description: 'Generate optimized Dockerfile',
        arguments: [
          { name: 'language', description: 'Programming language', required: true },
          { name: 'framework', description: 'Application framework', required: false },
          { name: 'optimization', description: 'Optimization focus', required: false },
        ],
        text: `Generate an optimized Dockerfile for a {{language}} application.

{{#framework}}Framework: {{framework}}{{/framework}}
{{#optimization}}Optimization: {{optimization}}{{/optimization}}

Requirements:
- Use appropriate base image for {{language}}
- Implement multi-stage build if beneficial
- Include security best practices
- Optimize for production use
- Add health checks
- Use non-root user

Please provide a complete, production-ready Dockerfile.`,
      },

      'k8s-manifest-generation': {
        description: 'Generate Kubernetes deployment manifests',
        arguments: [
          { name: 'appName', description: 'Application name', required: true },
          { name: 'environment', description: 'Target environment', required: false },
          { name: 'replicas', description: 'Number of replicas', required: false },
        ],
        text: `Generate Kubernetes manifests for application "{{appName}}".

Environment: {{environment}}
Replicas: {{replicas}}

Include:
- Deployment with appropriate resource limits
- Service for internal communication  
- Ingress for external access (if applicable)
- ConfigMap for configuration
- HorizontalPodAutoscaler for production environments
- PodDisruptionBudget for high availability

Follow Kubernetes best practices and security guidelines.`,
      },

      'parameter-validation': {
        description: 'Validate tool parameters',
        arguments: [
          { name: 'toolName', description: 'Tool name', required: true },
          { name: 'parameters', description: 'Parameters to validate', required: true },
          { name: 'context', description: 'Validation context', required: false },
        ],
        text: `Validate parameters for the "{{toolName}}" tool.

Parameters: {{parameters}}
{{#context}}Context: {{context}}{{/context}}

Check for:
- Required parameter presence
- Parameter type validity
- Value range compliance
- Parameter compatibility
- Security considerations

Provide specific validation feedback with actionable recommendations.`,
      },

      'parameter-suggestions': {
        description: 'Suggest optimal parameters',
        arguments: [
          { name: 'toolName', description: 'Tool name', required: true },
          { name: 'partialParameters', description: 'Existing parameters', required: true },
          { name: 'context', description: 'Suggestion context', required: false },
        ],
        text: `Generate parameter suggestions for "{{toolName}}".

Current parameters: {{partialParameters}}
{{#context}}Context: {{context}}{{/context}}

Suggest:
- Missing required parameters
- Optimal parameter values
- Performance improvements
- Security enhancements
- Best practice configurations

Provide practical suggestions with explanations.`,
      },

      'security-analysis': {
        description: 'Analyze configuration security',
        arguments: [
          { name: 'configType', description: 'Configuration type', required: true },
          { name: 'content', description: 'Configuration content', required: true },
          { name: 'complianceStandard', description: 'Compliance standard', required: false },
        ],
        text: `Analyze {{configType}} configuration for security vulnerabilities.

Configuration:
{{content}}

{{#complianceStandard}}Apply {{complianceStandard}} compliance checks.{{/complianceStandard}}

Provide:
- Vulnerability assessment
- Risk evaluation  
- Compliance status
- Remediation recommendations
- Best practice suggestions`,
      },
    };

    for (const [name, template] of Object.entries(templates)) {
      this.templates.set(name, template);
    }

    this.logger.info({ templateCount: this.templates.size }, 'MCP prompt templates initialized');
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * List available prompts
   */
  listPrompts(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Get prompt template info
   */
  getPromptInfo(name: string): { description: string; arguments: any[] } | null {
    const template = this.templates.get(name);
    return template
      ? {
          description: template.description,
          arguments: template.arguments,
        }
      : null;
  }
}
