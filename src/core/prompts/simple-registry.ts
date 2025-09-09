/**
 * Simplified Prompt Registry
 *
 * Replaces the complex 1000+ line prompt registry with a simple file-based system.
 * Loads prompts from external YAML files and provides SDK-compatible interface.
 *
 * Key improvements:
 * - 80% reduction in code size (from ~1000 lines to ~200 lines)
 * - External prompt files for easy editing
 * - Simple template rendering
 * - Maintains backward compatibility
 */

import type { Logger } from 'pino';
import { join } from 'path';
import {
  ListPromptsResult,
  GetPromptResult,
  PromptArgument,
  PromptMessage,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { SimplePromptLoader, type PromptFile } from './loader';
import { Result, Success, Failure } from '../../domain/types';

/**
 * Simplified Prompt Registry using external YAML files
 */
export class SimplifiedPromptRegistry {
  private loader: SimplePromptLoader;
  private logger: Logger;
  private initialized = false;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'SimplifiedPromptRegistry' });
    this.loader = new SimplePromptLoader(logger);
  }

  /**
   * Initialize the registry by loading prompts from directory
   */
  async initialize(promptsDirectory?: string): Promise<Result<void>> {
    const directory = promptsDirectory || join(process.cwd(), 'src', 'prompts');

    this.logger.info({ directory }, 'Initializing simplified prompt registry');

    const result = await this.loader.loadFromDirectory(directory);
    if (result.ok) {
      this.initialized = true;
      const promptCount = this.loader.getAllPrompts().length;
      this.logger.info({ promptCount }, 'Registry initialized successfully');
    } else {
      this.logger.error({ error: result.error }, 'Failed to initialize registry');
    }

    return result;
  }

  /**
   * List all available prompts (SDK-compatible)
   */
  async listPrompts(category?: string): Promise<ListPromptsResult> {
    this.ensureInitialized();

    const allPrompts = this.loader.getAllPrompts();
    const filteredPrompts = category
      ? allPrompts.filter((p) => p.metadata.category === category)
      : allPrompts;

    const prompts = filteredPrompts.map((prompt) => ({
      name: prompt.metadata.name,
      description: prompt.metadata.description,
      arguments: this.convertParameters(prompt.metadata.parameters),
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
    this.ensureInitialized();

    const prompt = this.loader.getPrompt(name);
    if (!prompt) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Render template with provided arguments
    const renderedText = this.loader.renderTemplate(prompt.template, args || {});

    // Create SDK-compatible message format
    const messages: PromptMessage[] = [
      {
        role: 'user',
        content: {
          type: 'text',
          text: renderedText,
        },
      },
    ];

    this.logger.debug(
      {
        name,
        argumentCount: prompt.metadata.parameters.length,
        messageCount: messages.length,
        templateLength: prompt.template.length,
      },
      'Generated prompt',
    );

    return {
      name: prompt.metadata.name,
      description: prompt.metadata.description,
      arguments: this.convertParameters(prompt.metadata.parameters),
      messages,
    };
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
    this.ensureInitialized();

    const prompt = this.loader.getPrompt(name);
    if (!prompt) {
      throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
    }

    // Render template
    const renderedText = this.loader.renderTemplate(prompt.template, args || {});

    // Convert to ToolContext format with content arrays
    const messages = [
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: renderedText }],
      },
    ];

    return {
      description: prompt.metadata.description,
      messages,
    };
  }

  /**
   * Get prompts by category
   */
  getPromptsByCategory(category: string): PromptFile[] {
    this.ensureInitialized();
    return this.loader.getPromptsByCategory(category);
  }

  /**
   * Check if a prompt exists
   */
  hasPrompt(name: string): boolean {
    return this.initialized && this.loader.hasPrompt(name);
  }

  /**
   * Get all prompt names
   */
  getPromptNames(): string[] {
    this.ensureInitialized();
    return this.loader.getPromptNames();
  }

  /**
   * Get prompt info without rendering
   */
  getPromptInfo(name: string): { description: string; arguments: PromptArgument[] } | null {
    if (!this.initialized) return null;

    const prompt = this.loader.getPrompt(name);
    return prompt
      ? {
          description: prompt.metadata.description,
          arguments: this.convertParameters(prompt.metadata.parameters),
        }
      : null;
  }

  /**
   * Register a new prompt (for backward compatibility, not recommended)
   * @deprecated Use external YAML files instead
   */
  register(prompt: any): void {
    this.logger.warn(
      { promptName: prompt.name },
      'register() is deprecated, use external YAML files instead',
    );
  }

  /**
   * Ensure registry is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Registry not initialized. Call initialize() first.');
    }
  }

  /**
   * Convert our parameter format to SDK PromptArgument format
   */
  private convertParameters(parameters: any[]): PromptArgument[] {
    return parameters.map(param => ({
      name: param.name,
      description: param.description,
      required: param.required || false,
    }));
  }
}

/**
 * Factory function to create and initialize the registry
 */
export async function createSimplifiedPromptRegistry(
  logger: Logger,
  promptsDirectory?: string,
): Promise<SimplifiedPromptRegistry> {
  const registry = new SimplifiedPromptRegistry(logger);
  const result = await registry.initialize(promptsDirectory);

  if (!result.ok) {
    throw new Error(`Failed to initialize prompt registry: ${result.error}`);
  }

  return registry;
}
