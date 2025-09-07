/**
 * Native MCP Sampling Implementation
 *
 * Implements MCP-native sampling patterns using the SDK client
 * for generating diverse, high-quality completions with proper
 * sampling parameters and strategies.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../core/types';
import { MCPClient } from '../client/mcp-client';

/**
 * Sampling configuration for MCP-native sampling
 */
export interface SamplingConfig {
  method?: 'temperature' | 'top_p' | 'top_k' | 'nucleus';
  temperature?: number;
  topP?: number;
  topK?: number;
  samples?: number;
  maxTokens?: number;
  strategy?: 'security' | 'performance' | 'size' | 'balanced' | 'creative';
  diversityBoost?: number;
}

/**
 * Sampling result with metadata
 */
export interface SamplingResult {
  samples: string[];
  strategy: string;
  parameters: SamplingConfig;
  quality: {
    diversity: number;
    coherence: number;
    relevance: number;
  };
  metadata: {
    generationTime: number;
    tokensGenerated: number;
    samplingMethod: string;
  };
}

/**
 * Native MCP Sampling Service
 *
 * Provides MCP-native sampling capabilities using the SDK client
 * with intelligent parameter selection and quality assessment.
 */
export class NativeMCPSampling {
  private logger: Logger;
  private sdkClient: MCPClient;

  constructor(logger: Logger) {
    this.logger = logger;
    this.sdkClient = new MCPClient(logger, {
      capabilities: {
        completion: true,
        sampling: true,
        prompts: true,
        resources: false,
      },
    });
  }

  /**
   * Generate multiple completion samples using native MCP sampling
   */
  async sampleCompletions(
    prompt: string,
    config: SamplingConfig = {},
  ): Promise<Result<SamplingResult>> {
    try {
      const startTime = Date.now();

      this.logger.debug(
        {
          promptLength: prompt.length,
          strategy: config.strategy,
          samples: config.samples,
        },
        'Starting native MCP sampling',
      );

      // Optimize sampling parameters based on strategy
      const optimizedConfig = this.optimizeSamplingParameters(config);

      // Generate samples using SDK client
      const samplesResult = await this.generateSamples(prompt, optimizedConfig);

      if (!samplesResult.ok) {
        return samplesResult;
      }

      const samples = samplesResult.value;
      const generationTime = Date.now() - startTime;

      // Assess sample quality
      const quality = this.assessSampleQuality(samples, prompt);

      const result: SamplingResult = {
        samples,
        strategy: config.strategy || 'balanced',
        parameters: optimizedConfig,
        quality,
        metadata: {
          generationTime,
          tokensGenerated: this.estimateTokenCount(samples),
          samplingMethod: 'mcp-native',
        },
      };

      this.logger.info(
        {
          samplesGenerated: samples.length,
          generationTime,
          diversityScore: quality.diversity,
          coherenceScore: quality.coherence,
        },
        'Native MCP sampling completed',
      );

      return Success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { error: message, prompt: prompt.substring(0, 100) },
        'Native MCP sampling failed',
      );
      return Failure(`Native sampling failed: ${message}`);
    }
  }

  /**
   * Generate samples for specific dockerfile strategies
   */
  async sampleDockerfileStrategies(
    prompt: string,
    context: Record<string, unknown>,
  ): Promise<Result<Record<string, string>>> {
    const strategies: ('security' | 'performance' | 'size' | 'balanced')[] = [
      'security',
      'performance',
      'size',
      'balanced',
    ];
    const results: Record<string, string> = {};

    for (const strategy of strategies) {
      const config: SamplingConfig = {
        strategy,
        samples: 1,
        temperature: this.getTemperatureForStrategy(strategy),
        topP: 0.9,
        maxTokens: 2000,
      };

      const sampleResult = await this.sampleCompletions(prompt, config);

      if (sampleResult.ok && sampleResult.value.samples.length > 0) {
        const firstSample = sampleResult.value.samples[0];
        results[strategy] = firstSample || this.generateFallbackDockerfile(strategy, context);
      } else {
        this.logger.warn(
          { strategy, error: sampleResult.ok ? 'No samples' : sampleResult.error },
          'Failed to generate sample for strategy',
        );

        // Provide fallback for failed strategies
        results[strategy] = this.generateFallbackDockerfile(strategy, context);
      }
    }

    return Success(results);
  }

  /**
   * Generate samples with diversity optimization
   */
  async sampleWithDiversityBoost(
    prompt: string,
    targetDiversity: number = 0.8,
    maxAttempts: number = 3,
  ): Promise<Result<string[]>> {
    let bestSamples: string[] = [];
    let bestDiversity = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const config: SamplingConfig = {
        samples: 5,
        temperature: 0.7 + attempt * 0.1, // Increase temperature with attempts
        topP: 0.9 - attempt * 0.1, // Decrease top_p for more diversity
        diversityBoost: attempt + 1,
      };

      const result = await this.sampleCompletions(prompt, config);

      if (result.ok) {
        const diversity = result.value.quality.diversity;

        if (diversity > bestDiversity) {
          bestSamples = result.value.samples;
          bestDiversity = diversity;
        }

        // Return early if target diversity is reached
        if (diversity >= targetDiversity) {
          this.logger.debug(
            { attempt: attempt + 1, diversity, target: targetDiversity },
            'Target diversity achieved',
          );
          break;
        }
      }
    }

    if (bestSamples.length === 0) {
      return Failure('Failed to generate diverse samples');
    }

    return Success(bestSamples);
  }

  /**
   * Check if native sampling is available
   */
  isAvailable(): boolean {
    return this.sdkClient.isConnected() || process.env.USE_SDK_CLIENT === 'true';
  }

  /**
   * Get sampling capabilities
   */
  getCapabilities(): {
    nativeSampling: boolean;
    strategies: string[];
    methods: string[];
    maxSamples: number;
    maxTokens: number;
  } {
    return {
      nativeSampling: this.isAvailable(),
      strategies: ['security', 'performance', 'size', 'balanced', 'creative'],
      methods: ['temperature', 'top_p', 'top_k', 'nucleus'],
      maxSamples: 10,
      maxTokens: 4000,
    };
  }

  /**
   * Optimize sampling parameters based on strategy
   */
  private optimizeSamplingParameters(config: SamplingConfig): SamplingConfig {
    const strategy = config.strategy || 'balanced';

    const strategyDefaults: Record<string, Partial<SamplingConfig>> = {
      security: {
        temperature: 0.3,
        topP: 0.8,
        samples: config.samples || 3,
        method: 'temperature',
      },
      performance: {
        temperature: 0.5,
        topP: 0.85,
        samples: config.samples || 4,
        method: 'top_p',
      },
      size: {
        temperature: 0.4,
        topP: 0.8,
        samples: config.samples || 3,
        method: 'temperature',
      },
      balanced: {
        temperature: 0.7,
        topP: 0.9,
        samples: config.samples || 5,
        method: 'nucleus',
      },
      creative: {
        temperature: 0.8,
        topP: 0.95,
        samples: config.samples || 6,
        method: 'nucleus',
      },
    };

    const defaults = strategyDefaults[strategy] || strategyDefaults.balanced;

    return {
      ...defaults,
      ...config,
      maxTokens: config.maxTokens || 2000,
    };
  }

  /**
   * Generate samples using the SDK client
   */
  private async generateSamples(prompt: string, config: SamplingConfig): Promise<Result<string[]>> {
    if (!this.sdkClient.isConnected()) {
      const initResult = await this.sdkClient.initialize();
      if (!initResult.ok) {
        return Failure(`SDK client initialization failed: ${initResult.error}`);
      }
    }

    // Use batch completion for multiple samples
    const batchResult = await this.sdkClient.completeBatch(prompt, config.samples || 5, {
      type: 'sampling',
      strategy: config.strategy,
      samplingConfig: config,
    });

    return batchResult;
  }

  /**
   * Assess the quality of generated samples
   */
  private assessSampleQuality(
    samples: string[],
    prompt: string,
  ): { diversity: number; coherence: number; relevance: number } {
    // Calculate diversity (how different the samples are from each other)
    const diversity = this.calculateDiversity(samples);

    // Calculate coherence (how well samples match the prompt)
    const coherence = this.calculateCoherence(samples, prompt);

    // Calculate relevance (how relevant samples are to the task)
    const relevance = this.calculateRelevance(samples, prompt);

    return {
      diversity: Math.round(diversity * 100) / 100,
      coherence: Math.round(coherence * 100) / 100,
      relevance: Math.round(relevance * 100) / 100,
    };
  }

  /**
   * Calculate diversity score between samples
   */
  private calculateDiversity(samples: string[]): number {
    if (samples.length < 2) return 0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const sample1 = samples[i];
        const sample2 = samples[j];
        if (sample1 && sample2) {
          const similarity = this.calculateSimilarity(sample1, sample2);
          totalSimilarity += similarity;
          comparisons++;
        }
      }
    }

    // Diversity is inverse of average similarity
    return 1 - totalSimilarity / comparisons;
  }

  /**
   * Calculate similarity between two strings (simplified Jaccard similarity)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate coherence score (how well samples match the prompt intent)
   */
  private calculateCoherence(samples: string[], prompt: string): number {
    const promptKeywords = this.extractKeywords(prompt);
    let totalCoherence = 0;

    for (const sample of samples) {
      const sampleKeywords = this.extractKeywords(sample);
      const overlap = promptKeywords.filter((keyword) => sampleKeywords.includes(keyword)).length;

      const coherence = overlap / Math.max(promptKeywords.length, 1);
      totalCoherence += coherence;
    }

    return totalCoherence / samples.length;
  }

  /**
   * Calculate relevance score based on expected output type
   */
  private calculateRelevance(samples: string[], prompt: string): number {
    const promptType = this.detectPromptType(prompt);
    let totalRelevance = 0;

    for (const sample of samples) {
      const relevance = this.assessTypeRelevance(sample, promptType);
      totalRelevance += relevance;
    }

    return totalRelevance / samples.length;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 20); // Limit to top 20 keywords
  }

  /**
   * Detect prompt type for relevance assessment
   */
  private detectPromptType(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('dockerfile')) return 'dockerfile';
    if (lower.includes('kubernetes') || lower.includes('k8s')) return 'kubernetes';
    if (lower.includes('analyze') || lower.includes('analysis')) return 'analysis';
    if (lower.includes('enhance') || lower.includes('improvement')) return 'enhancement';

    return 'general';
  }

  /**
   * Assess how relevant a sample is for the expected type
   */
  private assessTypeRelevance(sample: string, type: string): number {
    const sampleLower = sample.toLowerCase();

    const typeIndicators: Record<string, string[]> = {
      dockerfile: ['from', 'run', 'copy', 'expose', 'cmd', 'workdir'],
      kubernetes: ['apiversion', 'kind', 'metadata', 'spec', 'deployment'],
      analysis: ['analysis', 'assessment', 'evaluation', 'recommendation'],
      enhancement: ['improvement', 'optimization', 'enhancement', 'recommendation'],
      general: ['recommendation', 'suggestion', 'approach', 'solution'],
    };

    const indicators = typeIndicators[type] ??
      typeIndicators.general ?? ['recommendation', 'suggestion', 'approach', 'solution'];
    const foundIndicators = indicators.filter((indicator) =>
      sampleLower.includes(indicator),
    ).length;

    return foundIndicators / indicators.length;
  }

  /**
   * Get temperature for specific strategy
   */
  private getTemperatureForStrategy(strategy: string): number {
    const temperatures: Record<string, number> = {
      security: 0.3,
      performance: 0.5,
      size: 0.4,
      balanced: 0.7,
      creative: 0.8,
    };

    return temperatures[strategy] || 0.7;
  }

  /**
   * Estimate token count for samples
   */
  private estimateTokenCount(samples: string[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    return samples.reduce((total, sample) => total + Math.ceil(sample.length / 4), 0);
  }

  /**
   * Generate fallback dockerfile for failed strategies
   */
  private generateFallbackDockerfile(strategy: string, context: Record<string, unknown>): string {
    const appName = (context.appName as string) || 'app';

    const templates: Record<string, string> = {
      security: `# Security-focused Dockerfile
FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S ${appName} -u 1001
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN chown -R ${appName}:nodejs /app
USER ${appName}
EXPOSE 3000
CMD ["npm", "start"]`,

      performance: `# Performance-optimized Dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`,

      size: `# Size-optimized Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && rm -rf /usr/local/lib/node_modules/npm
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]`,

      balanced: `# Balanced Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN addgroup -g 1001 -S nodejs && adduser -S ${appName} -u 1001
RUN chown -R ${appName}:nodejs /app
USER ${appName}
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/health || exit 1
CMD ["npm", "start"]`,
    };

    const selectedTemplate = templates[strategy];
    if (selectedTemplate) {
      return selectedTemplate;
    }
    return (
      templates.balanced ||
      `# Fallback Dockerfile\nFROM node:18-alpine\nWORKDIR /app\nCOPY . .\nCMD ["npm", "start"]`
    );
  }
}
