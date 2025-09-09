/**
 * Simple Template Engine - Replacement for over-engineered PromptRegistry
 *
 * Provides simple file-based template loading with mustache-style replacement.
 * Dramatically simplifies the template system while maintaining all functionality.
 */

import { promises as fs } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { glob } from 'glob';
import yaml from 'yaml';
import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../domain/types';

/**
 * Simple template definition
 */
export interface SimpleTemplate {
  name: string;
  content: string;
  description?: string;
  variables?: string[];
}

/**
 * Template file format (supports both simple and complex formats)
 */
interface TemplateFile {
  name?: string;
  description?: string;
  template?: string;
  content?: string;
  user?: string;
  system?: string;
  variables?: Array<{ name: string; description?: string; required?: boolean; default?: string }>;
}

/**
 * Simple Template Engine
 *
 * Replaces the complex PromptRegistry with a minimal file-based template system.
 * Supports both inline templates and external YAML files.
 */
export class SimpleTemplateEngine {
  private templates: Map<string, SimpleTemplate> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'SimpleTemplateEngine' });
  }

  /**
   * Load templates from directory
   */
  async loadFromDirectory(directory: string): Promise<Result<void>> {
    try {
      const templateDir = resolve(directory);
      const files = await glob(`${templateDir}/**/*.{yaml,yml,json}`, { absolute: true });

      this.logger.debug({ directory: templateDir, fileCount: files.length }, 'Loading templates');

      for (const file of files) {
        const loadResult = await this.loadTemplateFile(file);
        if (!loadResult.ok) {
          this.logger.warn({ file, error: loadResult.error }, 'Failed to load template file');
          continue;
        }
      }

      this.logger.info({ templateCount: this.templates.size }, 'Templates loaded');
      return Success(undefined);
    } catch (error) {
      const message = `Failed to load templates from ${directory}: ${error instanceof Error ? error.message : 'unknown error'}`;
      this.logger.error({ directory, error }, message);
      return Failure(message);
    }
  }

  /**
   * Load a single template file
   */
  private async loadTemplateFile(filePath: string): Promise<Result<void>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const template = this.parseTemplateFile(content, filePath);

      this.templates.set(template.name, template);
      this.logger.debug({ name: template.name, file: filePath }, 'Template loaded');

      return Success(undefined);
    } catch (error) {
      return Failure(
        `Failed to load template ${filePath}: ${error instanceof Error ? error.message : 'parse error'}`,
      );
    }
  }

  /**
   * Parse template file content
   */
  private parseTemplateFile(content: string, filePath: string): SimpleTemplate {
    const fileName = basename(filePath, extname(filePath));

    try {
      const parsed = yaml.parse(content) as TemplateFile;

      // Extract template content from various possible formats
      let templateContent = '';

      if (parsed.template) {
        templateContent = parsed.template;
      } else if (parsed.user) {
        // Handle system + user format
        templateContent = parsed.system ? `${parsed.system}\n\n${parsed.user}` : parsed.user;
      } else if (parsed.content) {
        templateContent = parsed.content;
      } else {
        // Treat entire content as template
        templateContent = content;
      }

      return {
        name: parsed.name || parsed.id || fileName,
        content: templateContent,
        description: parsed.description || undefined,
        variables: parsed.variables?.map((v) => v.name) || undefined,
      };
    } catch {
      // Fallback: treat as plain text template
      return {
        name: fileName,
        content,
        description: `Plain text template from ${filePath}`,
      };
    }
  }

  /**
   * Register inline template
   */
  registerTemplate(template: SimpleTemplate): void {
    this.templates.set(template.name, template);
    this.logger.debug({ name: template.name }, 'Inline template registered');
  }

  /**
   * Render template with parameters
   * Supports {{variable}} and {{#conditional}}...{{/conditional}} syntax
   */
  render(templateName: string, params: Record<string, any> = {}): Result<string> {
    const template = this.templates.get(templateName);
    if (!template) {
      return Failure(`Template not found: ${templateName}`);
    }

    try {
      const rendered = this.renderTemplate(template.content, params);
      return Success(rendered);
    } catch (error) {
      return Failure(
        `Template rendering failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Simple template rendering with mustache-style replacement
   */
  private renderTemplate(template: string, params: Record<string, any>): string {
    let result = template;

    // Handle conditional blocks {{#var}}...{{/var}}
    result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
      const value = params[key];
      // Include content if variable exists and is truthy
      if (value !== undefined && value !== null && value !== false && value !== '') {
        return this.renderTemplate(content, params); // Recursive render
      }
      return '';
    });

    // Handle simple variables {{var}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = params[key];
      return value !== undefined ? String(value) : '';
    });

    // Clean up extra whitespace
    result = result
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/^\n+/, '') // Remove leading newlines
      .replace(/\n+$/, '\n'); // Single trailing newline

    return result;
  }

  /**
   * List all available templates
   */
  listTemplates(): Array<{ name: string; description?: string }> {
    return Array.from(this.templates.values()).map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  /**
   * Check if template exists
   */
  hasTemplate(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * Get template info without rendering
   */
  getTemplateInfo(name: string): SimpleTemplate | null {
    return this.templates.get(name) || null;
  }

  /**
   * Clear all templates (useful for testing)
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Get template count
   */
  get templateCount(): number {
    return this.templates.size;
  }
}
