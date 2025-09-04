/**
 * AI Service - Simplified with direct client usage
 */

import type { Logger } from 'pino';
import { AIClient } from '../infrastructure/ai-client.js';
import type { SampleFunction } from '../infrastructure/ai/index.js';

export interface AIConfig {
  modelPreferences?: {
    default?: string;
    dockerfile?: string;
    kubernetes?: string;
  };
  maxTokens?: number;
  temperature?: number;
}

/**
 * Create an AI service instance
 */
export function createAIService(
  config: AIConfig,
  sampler: SampleFunction | undefined,
  logger: Logger,
): AIService {
  return new AIService(config, sampler, logger);
}

export class AIService {
  private client: AIClient;
  private logger: Logger;

  constructor(config: AIConfig, sampler: SampleFunction | undefined, logger: Logger) {
    this.logger = logger.child({ service: 'ai' });
    this.client = new AIClient(config, this.logger, sampler);
  }

  async initialize(): Promise<void> {
    await Promise.resolve();
    this.logger.debug('AI service initialized');
  }

  /**
   * Update the sampler function (used after server initialization)
   */
  setSampler(sampler: SampleFunction): void {
    this.client.setSampler(sampler);
  }

  /**
   * Set MCP server directly (convenience method)
   */
  setMCPServer(server: any): void {
    this.client.setMCPServer(server);
  }

  async generateDockerfile(context: {
    language?: string;
    dependencies?: string[];
    buildSystem?: string;
    ports?: number[];
  }): Promise<string> {
    return this.client.generateDockerfile(context);
  }

  async analyzeRepository(
    repoPath: string,
    files?: string[],
  ): Promise<{
    language: string;
    buildSystem: string;
    dependencies: string[];
    ports: number[];
    hasTests: boolean;
    hasDatabase: boolean;
    recommendations: string[];
    rawAnalysis?: string;
  }> {
    return this.client.analyzeRepository(repoPath, files);
  }

  async suggestOptimizations(dockerfile: string): Promise<string[]> {
    return this.client.suggestOptimizations(dockerfile);
  }

  async fixDockerfile(dockerfile: string, error: string): Promise<string> {
    return this.client.fixDockerfile(dockerfile, error);
  }

  isAvailable(): boolean {
    return this.client.isAvailable();
  }

  getModelPreference(taskType: string): string {
    return this.client.getModelPreference(taskType);
  }
}

// Export a singleton getter for convenience
let _aiService: AIService | undefined;

export function getAIService(
  config: AIConfig,
  sampler: SampleFunction | undefined,
  logger: Logger,
): AIService {
  if (!_aiService) {
    _aiService = createAIService(config, sampler, logger);
  }
  return _aiService;
}
