/**
 * Compatibility Adapter for PromptRegistry
 *
 * Provides backward compatibility by adapting the SimpleTemplateEngine
 * to work with existing PromptRegistry interface usage patterns.
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
import { SimpleTemplateEngine } from './simple-template-engine';
// Result types imported for future use

/**
 * Template context interface (simplified from original)
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
 * Simplified prompt definition for compatibility
 */
interface CompatiblePromptDefinition {
  name: string;
  description: string;
  category?: string;
  arguments: PromptArgument[];
}

/**
 * Compatibility adapter that makes SimpleTemplateEngine work like PromptRegistry
 */
export class PromptRegistryCompatAdapter {
  private engine: SimpleTemplateEngine;
  private logger: Logger;
  private promptDefinitions: Map<string, CompatiblePromptDefinition> = new Map();

  constructor(engine: SimpleTemplateEngine, logger: Logger) {
    this.engine = engine;
    this.logger = logger.child({ component: 'PromptRegistryCompat' });
    this.initializePromptDefinitions();
  }

  /**
   * Initialize prompt definitions for known templates
   */
  private initializePromptDefinitions(): void {
    const definitions: CompatiblePromptDefinition[] = [
      {
        name: 'generate-dockerfile',
        description: 'Generate a Dockerfile for a project based on analysis',
        category: 'containerization',
        arguments: [
          { name: 'language', description: 'Programming language', required: true },
          { name: 'framework', description: 'Framework used', required: false },
          { name: 'ports', description: 'Comma-separated port numbers', required: false },
          { name: 'baseImage', description: 'Suggested base image', required: false },
          { name: 'requirements', description: 'Dependency information', required: false },
          { name: 'repoSummary', description: 'Repository summary', required: true },
        ],
      },
      {
        name: 'fix-dockerfile',
        description: 'Fix issues in an existing Dockerfile',
        category: 'containerization',
        arguments: [
          { name: 'dockerfileContent', description: 'Current Dockerfile content', required: true },
          { name: 'errors', description: 'Array of specific errors', required: false },
          { name: 'buildError', description: 'Build error message', required: false },
          { name: 'language', description: 'Programming language', required: false },
          { name: 'framework', description: 'Framework used', required: false },
          { name: 'analysis', description: 'Repository analysis context', required: false },
        ],
      },
      {
        name: 'generate-k8s-manifests',
        description: 'Generate Kubernetes manifests for containerized applications',
        category: 'orchestration',
        arguments: [
          { name: 'appName', description: 'Application name', required: true },
          { name: 'imageId', description: 'Docker image to deploy', required: true },
          { name: 'namespace', description: 'Kubernetes namespace', required: false },
          { name: 'replicas', description: 'Number of replicas', required: false },
          { name: 'ports', description: 'Comma-separated port numbers', required: false },
          { name: 'environment', description: 'Target environment', required: false },
        ],
      },
    ];

    definitions.forEach((def) => {
      this.promptDefinitions.set(def.name, def);
    });
  }

  /**
   * List all available prompts (SDK-compatible)
   */
  async listPrompts(category?: string): Promise<ListPromptsResult> {
    const allPrompts = Array.from(this.promptDefinitions.values());
    const filteredPrompts = category
      ? allPrompts.filter((p) => p.category === category)
      : allPrompts;

    const prompts = filteredPrompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    }));

    return { prompts };
  }

  /**
   * Get a specific prompt (SDK-compatible)
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<GetPromptResult> {
    const definition = this.promptDefinitions.get(name);
    if (!definition) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Render template using SimpleTemplateEngine
    const renderResult = this.engine.render(name, args || {});
    if (renderResult.isFailure()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Template rendering failed: ${renderResult.error}`,
      );
    }

    const messages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: renderResult.value,
        },
      },
    ];

    return {
      name: definition.name,
      description: definition.description,
      arguments: definition.arguments,
      messages,
    };
  }

  /**
   * Get prompts by category
   */
  getPromptsByCategory(category: string): CompatiblePromptDefinition[] {
    return Array.from(this.promptDefinitions.values()).filter(
      (prompt) => prompt.category === category,
    );
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.promptDefinitions.has(name) && this.engine.hasTemplate(name);
  }

  /**
   * Get all prompt names synchronously (for tests)
   */
  getPromptNames(): string[] {
    return Array.from(this.promptDefinitions.keys());
  }

  /**
   * Get prompt template info without rendering
   */
  getPromptInfo(name: string): { description: string; arguments: PromptArgument[] } | null {
    const definition = this.promptDefinitions.get(name);
    return definition
      ? {
          description: definition.description,
          arguments: definition.arguments,
        }
      : null;
  }

  /**
   * Get prompt with messages in ToolContext-compatible format
   */
  async getPromptWithMessages(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    description: string;
    messages: Array<{ role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }>;
  }> {
    const definition = this.promptDefinitions.get(name);
    if (!definition) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Render template
    const renderResult = this.engine.render(name, args || {});
    if (renderResult.isFailure()) {
      throw new McpError(
        ErrorCode.InternalError,
        `Template rendering failed: ${renderResult.error}`,
      );
    }

    const messages = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: renderResult.value }],
      },
    ];

    return {
      description: definition.description,
      messages,
    };
  }

  /**
   * Register a new prompt definition
   */
  register(definition: CompatiblePromptDefinition): void {
    this.promptDefinitions.set(definition.name, definition);
    this.logger.debug(
      { name: definition.name, category: definition.category },
      'Prompt definition registered',
    );
  }
}
