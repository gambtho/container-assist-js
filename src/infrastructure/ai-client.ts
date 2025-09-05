/**
 * AI Client - Direct MCP integration without abstractions
 */

import type { Logger } from 'pino';
import { AIServiceError } from '../errors/index';
import { ErrorCode } from '../domain/types/errors';
import {
  createNativeMCPSampler,
  isSuccessResult,
  type SampleFunction,
  type AIRequest,
} from './ai/sampling';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface AIClientConfig {
  modelPreferences?: {
    default?: string;
    dockerfile?: string;
    kubernetes?: string;
  };
  maxTokens?: number;
  temperature?: number;
}

export interface AIGenerationOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface AIGenerationResult {
  text: string;
  model?: string;
  tokenCount?: number;
}

export interface DockerfileContext {
  language?: string;
  dependencies?: string[];
  buildSystem?: string;
  ports?: number[];
}

export interface RepositoryAnalysis {
  language: string;
  buildSystem: string;
  dependencies: string[];
  ports: number[];
  hasTests: boolean;
  hasDatabase: boolean;
  recommendations: string[];
  rawAnalysis?: string;
}

export class AIClient {
  private logger: Logger;
  private sampler: SampleFunction;
  private available = false;

  constructor(
    private config: AIClientConfig = {},
    logger: Logger,
    sampler?: SampleFunction,
  ) {
    this.logger = logger.child({ component: 'AIClient' });

    if (!sampler) {
      throw new Error('AI client requires a sampler function - no mock sampler available');
    }

    this.sampler = sampler;
    this.available = true;

    this.logger.info('AI client initialized with sampler function');
  }

  /**
   * Update the sampler function (used after server initialization)
   */
  setSampler(sampler: SampleFunction): void {
    this.sampler = sampler;
    this.available = true;

    this.logger.info('AI client updated with new sampler function');
  }

  /**
   * Create and set MCP sampler from server
   */
  setMCPServer(server: McpServer): void {
    this.sampler = createNativeMCPSampler(server, this.logger);
    this.available = true;

    this.logger.info('AI client updated with MCP server sampler');
  }

  async generateText(options: AIGenerationOptions): Promise<AIGenerationResult> {
    try {
      const request: AIRequest = {
        prompt: options.prompt,
        maxTokens: options.maxTokens ?? this.config.maxTokens ?? 2000,
        temperature: options.temperature ?? this.config.temperature ?? 0.7,
        model: options.model,
      };

      const result = await this.sampler(request);

      if (!isSuccessResult(result)) {
        throw new AIServiceError(
          `AI generation failed: ${result.error}`,
          ErrorCode.AI_GENERATION_FAILED,
          undefined,
          undefined,
          { prompt: `${options.prompt.substring(0, 100)}...` },
        );
      }

      const response: AIGenerationResult = {
        text: result.text,
        tokenCount: result.tokenCount ?? result.text.length, // Use actual or rough estimate
      };

      if (result.model ?? options.model) {
        response.model = result.model ?? options.model!;
      }

      return response;
    } catch (error) {
      if (error instanceof AIServiceError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AIServiceError(
        `Text generation failed: ${errorMessage}`,
        ErrorCode.AI_TEXT_GENERATION_FAILED,
        undefined,
        error instanceof Error ? error : undefined,
        { operation: 'generateText' },
      );
    }
  }

  async generateDockerfile(context: DockerfileContext): Promise<string> {
    const prompt = this.buildDockerfilePrompt(context);
    const result = await this.generateText({
      prompt,
      maxTokens: 2000,
      temperature: 0.7,
      model: this.getModelPreference('dockerfile'),
    });

    return result.text;
  }

  async analyzeRepository(repoPath: string, files?: string[]): Promise<RepositoryAnalysis> {
    const prompt = this.buildRepositoryAnalysisPrompt(repoPath, files);
    const result = await this.generateText({
      prompt,
      maxTokens: 1500,
      temperature: 0.5,
    });

    // Try to parse as JSON, fallback to raw text
    try {
      return JSON.parse(result.text) as RepositoryAnalysis;
    } catch {
      return {
        language: 'unknown',
        buildSystem: 'unknown',
        dependencies: [],
        ports: [],
        hasTests: false,
        hasDatabase: false,
        recommendations: [],
        rawAnalysis: result.text,
      };
    }
  }

  async suggestOptimizations(dockerfile: string): Promise<string[]> {
    const prompt = this.buildOptimizationPrompt(dockerfile);
    const result = await this.generateText({
      prompt,
      maxTokens: 1000,
      temperature: 0.6,
    });

    // Parse suggestions from response
    return result.text
      .split('\n')
      .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  async fixDockerfile(dockerfile: string, error: string): Promise<string> {
    const prompt = this.buildDockerfileFixPrompt(dockerfile, error);
    const result = await this.generateText({
      prompt,
      maxTokens: 2000,
      temperature: 0.5,
    });

    return result.text;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getModelPreference(taskType: string): string {
    const preferences = this.config.modelPreferences ?? {};
    return (
      preferences[taskType as keyof typeof preferences] ?? preferences.default ?? 'claude-3-sonnet'
    );
  }

  // Private prompt building methods
  private buildDockerfilePrompt(context: DockerfileContext): string {
    return `Generate a Dockerfile for the following project:

Language: ${context.language ?? 'unknown'}
Dependencies: ${JSON.stringify(context.dependencies ?? [])}
Build System: ${context.buildSystem ?? 'unknown'}
Ports: ${context.ports?.join(', ') ?? 'none specified'}

Requirements:
- Use appropriate base image for ${context.language}
- Install dependencies efficiently
- Expose necessary ports
- Follow Docker best practices
- Use multi-stage builds if beneficial
- Include health checks when appropriate

Return only the Dockerfile content, no explanation.`;
  }

  private buildRepositoryAnalysisPrompt(repoPath: string, files?: string[]): string {
    return `Analyze this repository and return a JSON object with the following structure:

Repository Path: ${repoPath}
${files ? `Files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}` : ''}

Return JSON with:
{
  "language": "detected primary language",
  "buildSystem": "npm|yarn|maven|gradle|pip|etc",
  "dependencies": ["list of key dependencies"],
  "ports": [list of detected ports],
  "hasTests": boolean,
  "hasDatabase": boolean,
  "recommendations": ["list of containerization recommendations"]
}

Analyze the code structure and return only the JSON, no explanation.`;
  }

  private buildOptimizationPrompt(dockerfile: string): string {
    return `Analyze this Dockerfile and suggest optimizations:

${dockerfile}

Provide optimization suggestions focusing on:
- Image size reduction
- Build speed improvements
- Security enhancements
- Best practices
- Caching strategies

Format each suggestion as a bullet point starting with - or *`;
  }

  private buildDockerfileFixPrompt(dockerfile: string, error: string): string {
    return `Fix this Dockerfile that's causing an error:

DOCKERFILE:
${dockerfile}

ERROR:
${error}

Provide a corrected version of the Dockerfile that fixes the error.
Return only the corrected Dockerfile content, no explanation.`;
  }
}
