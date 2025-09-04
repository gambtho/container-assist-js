/**
 * Simplified AI Service using MCP SDK built-in sampling
 * 
 * This service leverages the MCP SDK's native `server.createMessage()` functionality
 * to eliminate the need for custom AI clients, complex caching, and error recovery systems.
 * It focuses purely on business logic for containerization assistance.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Logger } from 'pino';
<<<<<<< HEAD
import { AIClient } from '../infrastructure/ai-client';
import type { SampleFunction } from '../infrastructure/ai/index';
=======
>>>>>>> 8f344a2 (cleaning up kubernetes & docker service)
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Core types for AI operations
export interface DockerfileGenerationContext {
  language?: string;
  framework?: string;
  dependencies?: string[];
  buildSystem?: string;
  ports?: number[];
  projectPath?: string;
  files?: string[];
}

export interface RepositoryAnalysis {
  language: string;
  framework: string;
  buildSystem: string;
  dependencies: string[];
  ports: number[];
  hasTests: boolean;
  hasDatabase: boolean;
  recommendations: string[];
}

export interface OptimizationSuggestion {
  type: 'security' | 'performance' | 'size' | 'best-practice';
  title: string;
  description: string;
  fix?: string | undefined;
  priority: 'low' | 'medium' | 'high';
}

// Validation schemas
const RepositoryAnalysisSchema = z.object({
  language: z.string(),
  framework: z.string(),
  buildSystem: z.string(),
  dependencies: z.array(z.string()),
  ports: z.array(z.number()),
  hasTests: z.boolean(),
  hasDatabase: z.boolean(),
  recommendations: z.array(z.string())
});

const OptimizationSuggestionsSchema = z.array(z.object({
  type: z.enum(['security', 'performance', 'size', 'best-practice']),
  title: z.string(),
  description: z.string(),
  fix: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high'])
}));

/**
 * Template-based AI service using MCP SDK sampling
 */
export class AIService {
  private server: McpServer;
  private logger: Logger;
  private templatesPath: string;

  constructor(server: McpServer, logger: Logger) {
    this.server = server;
    this.logger = logger.child({ service: 'ai-simplified' });
    this.templatesPath = join(process.cwd(), 'resources', 'ai-templates');
  }

  /**
   * Generate optimized Dockerfile using AI
   */
  async generateDockerfile(context: DockerfileGenerationContext): Promise<string> {
    this.logger.debug({ context }, 'Generating Dockerfile');

    try {
      const template = await this.loadTemplate('dockerfile-generation.yaml');
      const prompt = this.buildDockerfilePrompt(template, context);

      const response = await this.server.server.createMessage({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: prompt
          }
        }],
        maxTokens: 2000,
        temperature: 0.1 // Low temperature for consistent, deterministic output
      });

      const dockerfile = this.extractTextContent(response);
      this.logger.debug({ dockerfileLength: dockerfile.length }, 'Dockerfile generated successfully');
      
      return dockerfile;
    } catch (error) {
      this.logger.error({ error, context }, 'Failed to generate Dockerfile');
      throw new Error(`Dockerfile generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze repository structure and dependencies
   */
  async analyzeRepository(repoPath: string, files?: string[]): Promise<RepositoryAnalysis> {
    this.logger.debug({ repoPath, filesCount: files?.length }, 'Analyzing repository');

    try {
      const template = await this.loadTemplate('repository-analysis.yaml');
      const context = await this.buildRepositoryContext(repoPath, files);
      const prompt = this.buildAnalysisPrompt(template, context);

      const response = await this.server.server.createMessage({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: prompt
          }
        }],
        maxTokens: 1500,
        temperature: 0.2 // Slightly higher for more nuanced analysis
      });

      const rawAnalysis = this.extractTextContent(response);
      
      // Parse and validate the JSON response
      let analysis: RepositoryAnalysis;
      try {
        const parsed = JSON.parse(rawAnalysis);
        analysis = RepositoryAnalysisSchema.parse(parsed);
      } catch (parseError) {
        this.logger.warn({ rawAnalysis, parseError }, 'Failed to parse analysis JSON, using fallback');
        analysis = this.createFallbackAnalysis(repoPath, files);
      }

      this.logger.debug({ analysis }, 'Repository analysis completed');
      return analysis;
    } catch (error) {
      this.logger.error({ error, repoPath }, 'Failed to analyze repository');
      throw new Error(`Repository analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Suggest optimizations for existing Dockerfile
   */
  async suggestOptimizations(dockerfile: string): Promise<OptimizationSuggestion[]> {
    this.logger.debug({ dockerfileLength: dockerfile.length }, 'Analyzing Dockerfile for optimizations');

    try {
      const template = await this.loadTemplate('optimization-suggestion.yaml');
      const prompt = this.buildOptimizationPrompt(template, dockerfile);

      const response = await this.server.server.createMessage({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: prompt
          }
        }],
        maxTokens: 2000,
        temperature: 0.3 // Allow for creative optimization suggestions
      });

      const rawSuggestions = this.extractTextContent(response);
      
      // Parse and validate suggestions
      let suggestions: OptimizationSuggestion[];
      try {
        const parsed = JSON.parse(rawSuggestions);
        suggestions = OptimizationSuggestionsSchema.parse(parsed);
      } catch (parseError) {
        this.logger.warn({ rawSuggestions, parseError }, 'Failed to parse suggestions JSON');
        suggestions = [];
      }

      this.logger.debug({ suggestionsCount: suggestions.length }, 'Optimization suggestions generated');
      return suggestions;
    } catch (error) {
      this.logger.error({ error }, 'Failed to generate optimization suggestions');
      throw new Error(`Optimization analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fix problematic Dockerfile based on error
   */
  async fixDockerfile(dockerfile: string, error: string): Promise<string> {
    this.logger.debug({ dockerfileLength: dockerfile.length, error }, 'Fixing Dockerfile');

    try {
      const template = await this.loadTemplate('dockerfile-fix.yaml');
      const prompt = this.buildFixPrompt(template, dockerfile, error);

      const response = await this.server.server.createMessage({
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: prompt
          }
        }],
        maxTokens: 2000,
        temperature: 0.1 // Low temperature for precise fixes
      });

      const fixedDockerfile = this.extractTextContent(response);
      this.logger.debug({ fixedLength: fixedDockerfile.length }, 'Dockerfile fixed successfully');
      
      return fixedDockerfile;
    } catch (fixError) {
      this.logger.error({ error: fixError, originalError: error }, 'Failed to fix Dockerfile');
      throw new Error(`Dockerfile fix failed: ${fixError instanceof Error ? fixError.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if AI service is available
   */
  isAvailable(): boolean {
    return !!this.server?.server;
  }

  // Private helper methods

  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = join(this.templatesPath, templateName);
      return await readFile(templatePath, 'utf-8');
    } catch (error) {
      this.logger.error({ error, templateName }, 'Failed to load template');
      throw new Error(`Template loading failed: ${templateName}`);
    }
  }

  private buildDockerfilePrompt(template: string, context: DockerfileGenerationContext): string {
    return template
      .replace(/\{\{language\}\}/g, context.language || 'unknown')
      .replace(/\{\{framework\}\}/g, context.framework || 'none')
      .replace(/\{\{buildSystem\}\}/g, context.buildSystem || 'unknown')
      .replace(/\{\{dependencies\}\}/g, context.dependencies?.join(', ') || 'none specified')
      .replace(/\{\{ports\}\}/g, context.ports?.join(', ') || '8080')
      .replace(/\{\{files\}\}/g, context.files?.join('\n') || 'No files provided');
  }

  private buildAnalysisPrompt(template: string, context: { path: string; structure: string; files: string[] }): string {
    return template
      .replace(/\{\{repoPath\}\}/g, context.path)
      .replace(/\{\{structure\}\}/g, context.structure)
      .replace(/\{\{files\}\}/g, context.files.join('\n'));
  }

  private buildOptimizationPrompt(template: string, dockerfile: string): string {
    return template.replace(/\{\{dockerfile\}\}/g, dockerfile);
  }

  private buildFixPrompt(template: string, dockerfile: string, error: string): string {
    return template
      .replace(/\{\{dockerfile\}\}/g, dockerfile)
      .replace(/\{\{error\}\}/g, error);
  }

  private extractTextContent(response: any): string {
    if (response.content?.type === 'text') {
      return response.content.text;
    }
    throw new Error('Unexpected response format - expected text content');
  }

  private async buildRepositoryContext(repoPath: string, files?: string[]): Promise<{ path: string; structure: string; files: string[] }> {
    // Build a simple structure representation
    const fileList = files || [];
    const structure = fileList.length > 0 ? fileList.join('\n') : 'No files provided';
    
    return {
      path: repoPath,
      structure,
      files: fileList
    };
  }

  private createFallbackAnalysis(_repoPath: string, files?: string[]): RepositoryAnalysis {
    // Basic fallback analysis based on file patterns
    const fileList = files || [];
    
    const hasPackageJson = fileList.some(f => f.includes('package.json'));
    const hasPomXml = fileList.some(f => f.includes('pom.xml'));
    const hasBuildGradle = fileList.some(f => f.includes('build.gradle'));
    const hasRequirements = fileList.some(f => f.includes('requirements.txt'));
    const hasCsproj = fileList.some(f => f.includes('.csproj'));

    let language = 'unknown';
    let framework = 'none';
    let buildSystem = 'unknown';

    if (hasPackageJson) {
      language = 'javascript';
      framework = fileList.some(f => f.includes('next.config')) ? 'nextjs' : 
                  fileList.some(f => f.includes('package.json')) ? 'nodejs' : 'javascript';
      buildSystem = 'npm';
    } else if (hasPomXml) {
      language = 'java';
      framework = 'spring-boot';
      buildSystem = 'maven';
    } else if (hasBuildGradle) {
      language = 'java';
      framework = 'spring-boot';
      buildSystem = 'gradle';
    } else if (hasRequirements) {
      language = 'python';
      framework = fileList.some(f => f.includes('django')) ? 'django' : 
                  fileList.some(f => f.includes('flask')) ? 'flask' : 'python';
      buildSystem = 'pip';
    } else if (hasCsproj) {
      language = 'csharp';
      framework = 'aspnet-core';
      buildSystem = 'msbuild';
    }

    return {
      language,
      framework,
      buildSystem,
      dependencies: [],
      ports: [8080],
      hasTests: fileList.some(f => f.includes('test')),
      hasDatabase: fileList.some(f => f.includes('database') || f.includes('db')),
      recommendations: ['Enable AI analysis for better insights']
    };
  }
}

/**
 * Factory function to create AI service instance
 */
export function createAIService(server: McpServer, logger: Logger): AIService {
  return new AIService(server, logger);
}
