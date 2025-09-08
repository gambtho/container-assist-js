/**
 * Sampling Service
 *
 * Consolidates CompletionSamplingService, MCPSampler, and workflow sampling
 * into a single, strategy-pattern based implementation with fallback support.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '@types';
import { MCPClient } from '@mcp/client/mcp-client';
import type { DockerfileVariant } from '@workflows/sampling/types';
import {
  DEFAULT_SAMPLING_FEATURES,
  type Sampler as SamplerType,
  type SamplingConfig,
  type SamplingResult,
  type SamplingContext,
  type SamplingQuality,
  type SamplingStrategy,
  type TransportMode,
  type SamplerCapabilities,
  type StrategySamplingConfig,
  type DiversitySamplingConfig,
  type DockerfileSamplingResult,
  type SamplingFeatureFlags,
} from './types';

/**
 * Base transport interface for different sampling backends
 */
interface SamplingTransport {
  name: TransportMode;
  isAvailable(): boolean;
  sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<string[]>>;
  initialize?(): Promise<Result<void>>;
  cleanup?(): Promise<void>;
}

/**
 * SDK-based transport using MCPClient completion
 */
class SDKTransport implements SamplingTransport {
  name: TransportMode = 'sdk';
  private client: MCPClient;
  private initialized = false;

  constructor(logger: Logger) {
    this.client = MCPClient.createWithStdio(logger, {
      capabilities: {
        completion: true,
        sampling: true,
        prompts: true,
        resources: false,
      },
    });
  }

  async initialize(): Promise<Result<void>> {
    if (this.initialized) return Success(undefined);

    const result = await this.client.initialize();
    if (result.ok) {
      this.initialized = true;
    }
    return result;
  }

  isAvailable(): boolean {
    return this.client.isConnected() || !this.initialized;
  }

  async sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<string[]>> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Failure(`SDK initialization failed: ${initResult.error}`);
      }
    }

    const samples = config.samples || 3;
    const batchResult = await this.client.completeBatch(prompt, samples, {
      type: 'sampling',
      strategy: config.strategy,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens || 2000,
    });

    return batchResult;
  }

  async cleanup(): Promise<void> {
    if (this.initialized) {
      await this.client.disconnect();
      this.initialized = false;
    }
  }
}

/**
 * MCP transport using SDK MCP sampling
 */
class MCPTransport implements SamplingTransport {
  name: TransportMode = 'native';
  private client: MCPClient;

  constructor(logger: Logger) {
    this.client = MCPClient.createWithStdio(logger, {
      capabilities: {
        completion: true,
        sampling: true,
        prompts: true,
        resources: false,
      },
    });
  }

  async initialize(): Promise<Result<void>> {
    return this.client.initialize();
  }

  isAvailable(): boolean {
    return this.client.isConnected();
  }

  async sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<string[]>> {
    if (!this.client.isConnected()) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Failure(`MCP client initialization failed: ${initResult.error}`);
      }
    }

    // Use MCP sampling with optimized parameters
    const samples = config.samples || 3;
    const batchResult = await this.client.completeBatch(prompt, samples, {
      type: 'mcp-sampling',
      method: config.method || 'nucleus',
      temperature: config.temperature || 0.7,
      topP: config.topP || 0.9,
      maxTokens: config.maxTokens || 2000,
      diversityBoost: config.diversityBoost,
    });

    return batchResult;
  }

  async cleanup(): Promise<void> {
    await this.client.disconnect();
  }
}

/**
 * Completion-based transport using direct completion API
 */
class CompletionTransport implements SamplingTransport {
  name: TransportMode = 'completion';
  private client: MCPClient;

  constructor(logger: Logger) {
    this.client = MCPClient.createWithStdio(logger, {
      capabilities: {
        completion: true,
        sampling: false,
        prompts: true,
        resources: false,
      },
    });
  }

  async initialize(): Promise<Result<void>> {
    return this.client.initialize();
  }

  isAvailable(): boolean {
    return this.client.isConnected();
  }

  async sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<string[]>> {
    if (!this.client.isConnected()) {
      const initResult = await this.initialize();
      if (!initResult.ok) {
        return Failure(`Completion client initialization failed: ${initResult.error}`);
      }
    }

    const samples = config.samples || 3;
    const results: string[] = [];

    // Generate multiple completions sequentially with varied parameters
    for (let i = 0; i < samples; i++) {
      const temperature = (config.temperature || 0.7) + i * 0.1;
      const result = await this.client.complete(prompt, {
        temperature: Math.min(temperature, 1.0),
        topP: config.topP || 0.9,
        maxTokens: config.maxTokens || 2000,
      });

      if (result.ok) {
        results.push(result.value);
      }
    }

    if (results.length === 0) {
      return Failure('No completions generated');
    }

    return Success(results);
  }

  async cleanup(): Promise<void> {
    await this.client.disconnect();
  }
}

/**
 * Sampling Service with strategy pattern and transport fallback
 */
export class Sampler implements SamplerType {
  private transports: Map<TransportMode, SamplingTransport>;
  private featureFlags: SamplingFeatureFlags;

  constructor(
    private logger: Logger,
    featureFlags?: Partial<SamplingFeatureFlags>,
  ) {
    this.featureFlags = { ...DEFAULT_SAMPLING_FEATURES, ...featureFlags };

    // Initialize available transports based on feature flags
    this.transports = new Map();

    if (this.featureFlags.enableSDKTransport) {
      this.transports.set('sdk', new SDKTransport(logger));
    }

    if (this.featureFlags.enableNativeTransport) {
      this.transports.set('native', new MCPTransport(logger));
    }

    if (this.featureFlags.enableCompletionTransport) {
      this.transports.set('completion', new CompletionTransport(logger));
    }

    this.logger.debug(
      {
        availableTransports: Array.from(this.transports.keys()),
        preferredTransport: this.featureFlags.preferredTransport,
      },
      'Sampler initialized',
    );
  }

  async initialize(): Promise<Result<void>> {
    const initResults = await Promise.allSettled(
      Array.from(this.transports.values()).map(
        (transport) => transport.initialize?.() || Promise.resolve(Success(undefined)),
      ),
    );

    const failures = initResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);

    if (failures.length > 0) {
      this.logger.warn({ failures }, 'Some transports failed to initialize');
    }

    return Success(undefined);
  }

  async sampleCompletions(prompt: string, config: SamplingConfig): Promise<Result<SamplingResult>> {
    const startTime = Date.now();

    this.logger.debug(
      {
        promptLength: prompt.length,
        strategy: config.strategy,
        samples: config.samples,
        transportMode: config.transportMode,
      },
      'Starting sampling',
    );

    // Select transport based on config or feature flags
    const transport = this.selectTransport(config.transportMode);
    if (!transport) {
      return Failure('No available sampling transport');
    }

    try {
      // Generate samples using selected transport
      const samplesResult = await transport.sampleCompletions(prompt, config);
      if (!samplesResult.ok) {
        // Try fallback transports
        const fallbackResult = await this.tryFallbackTransports(prompt, config, transport.name);
        if (!fallbackResult.ok) {
          return fallbackResult;
        }

        const samples = fallbackResult.value.samples;
        const transportUsed = fallbackResult.value.metadata.transportUsed;

        return this.buildSamplingResult(samples, config, startTime, transportUsed);
      }

      const samples = samplesResult.value;
      return this.buildSamplingResult(samples, config, startTime, transport.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message, transport: transport.name }, 'Sampling failed');
      return Failure(`Sampling failed with ${transport.name}: ${message}`);
    }
  }

  async sampleDockerfileStrategies(
    prompt: string,
    config: StrategySamplingConfig,
  ): Promise<Result<DockerfileSamplingResult>> {
    if (!this.featureFlags.enableStrategyOptimization) {
      return Failure('Strategy optimization is disabled');
    }

    const strategies = config.strategies || ['security', 'performance', 'size', 'balanced'];
    const results: Record<string, DockerfileVariant[]> = {};

    for (const strategy of strategies) {
      const strategyConfig: SamplingConfig = {
        ...config,
        strategy,
        samples: config.variantCount || 1,
        temperature: this.getTemperatureForStrategy(strategy),
      };

      const strategyPrompt = this.buildStrategyPrompt(prompt, strategy, config.context);
      const result = await this.sampleCompletions(strategyPrompt, strategyConfig);

      if (result.ok && result.value.samples.length > 0) {
        const variants = result.value.samples.map((content, index) =>
          this.createDockerfileVariant(content, strategy, index, config.context),
        );
        results[strategy] = variants;
      }
    }

    const allVariants = Object.values(results).flat();
    if (allVariants.length === 0) {
      return Failure('No strategy variants generated');
    }

    // Select best variant (could be enhanced with scoring)
    const bestVariant = allVariants[0];

    const dockerfileResult: DockerfileSamplingResult = {
      samples: allVariants.map((v) => v.content),
      strategy: 'multi-strategy',
      parameters: config,
      quality: this.assessSampleQuality(
        allVariants.map((v) => v.content),
        prompt,
      ),
      metadata: {
        generationTime: Date.now(),
        tokensGenerated: this.estimateTokenCount(allVariants.map((v) => v.content)),
        samplingMethod: 'strategy-based',
        transportUsed: this.featureFlags.preferredTransport,
        strategy: 'balanced',
      },
      variants: allVariants,
      bestVariant: bestVariant ||
        allVariants[0] || {
          id: 'fallback',
          content: '',
          strategy: 'balanced',
          metadata: {
            baseImage: 'alpine:latest',
            optimization: 'balanced' as const,
            features: [],
            estimatedSize: '0MB',
            buildComplexity: 'low' as const,
            securityFeatures: [],
          },
          generated: new Date(),
        },
      context: config.context,
    };

    this.logger.info(
      {
        strategiesGenerated: Object.keys(results),
        totalVariants: allVariants.length,
      },
      'Strategy-based Dockerfile sampling completed',
    );

    return Success(dockerfileResult);
  }

  async sampleWithDiversityBoost(
    prompt: string,
    config: DiversitySamplingConfig,
  ): Promise<Result<string[]>> {
    if (!this.featureFlags.enableDiversityBoost) {
      return Failure('Diversity boost is disabled');
    }

    let bestSamples: string[] = [];
    let bestDiversity = 0;

    for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
      const adjustedConfig: SamplingConfig = {
        ...config,
        temperature: (config.temperature || 0.7) + attempt * 0.1,
        topP: (config.topP || 0.9) - attempt * 0.05,
        diversityBoost: (config.boostFactor || 1) * (attempt + 1),
      };

      const result = await this.sampleCompletions(prompt, adjustedConfig);
      if (result.ok) {
        const diversity = result.value.quality.diversity;
        if (diversity > bestDiversity) {
          bestSamples = result.value.samples;
          bestDiversity = diversity;
        }

        if (diversity >= config.targetDiversity) {
          this.logger.debug(
            {
              attempt: attempt + 1,
              diversity,
              target: config.targetDiversity,
            },
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

  isAvailable(): boolean {
    return Array.from(this.transports.values()).some((transport) => transport.isAvailable());
  }

  getCapabilities(): SamplerCapabilities {
    return {
      mcpSampling: this.transports.has('native'),
      strategies: ['security', 'performance', 'size', 'balanced', 'creative'],
      methods: ['temperature', 'top_p', 'top_k', 'nucleus'],
      transports: Array.from(this.transports.keys()),
      maxSamples: 10,
      maxTokens: 4000,
      supportsDiversity: this.featureFlags.enableDiversityBoost,
      supportsStrategy: this.featureFlags.enableStrategyOptimization,
    };
  }

  getSupportedTransports(): TransportMode[] {
    return [this.featureFlags.preferredTransport, ...this.featureFlags.fallbackTransports].filter(
      (transport) => this.transports.has(transport),
    );
  }

  async cleanup(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.transports.values()).map(
        (transport) => transport.cleanup?.() || Promise.resolve(),
      ),
    );
  }

  // Private helper methods

  private selectTransport(requested?: TransportMode): SamplingTransport | null {
    const preferredOrder = requested
      ? [requested, ...this.getSupportedTransports()]
      : this.getSupportedTransports();

    for (const transportName of preferredOrder) {
      const transport = this.transports.get(transportName);
      if (transport?.isAvailable()) {
        return transport;
      }
    }

    return null;
  }

  private async tryFallbackTransports(
    prompt: string,
    config: SamplingConfig,
    excludeTransport: TransportMode,
  ): Promise<Result<SamplingResult>> {
    const fallbacks = this.getSupportedTransports().filter((t) => t !== excludeTransport);

    for (const transportName of fallbacks) {
      const transport = this.transports.get(transportName);
      if (transport?.isAvailable()) {
        this.logger.debug({ fallbackTransport: transportName }, 'Trying fallback transport');

        try {
          const result = await transport.sampleCompletions(prompt, config);
          if (result.ok) {
            return this.buildSamplingResult(result.value, config, Date.now(), transportName);
          }
        } catch (error) {
          this.logger.warn({ transport: transportName, error }, 'Fallback transport failed');
          continue;
        }
      }
    }

    return Failure('All transports failed');
  }

  private buildSamplingResult(
    samples: string[],
    config: SamplingConfig,
    startTime: number,
    transportUsed: TransportMode,
  ): Result<SamplingResult> {
    const generationTime = Date.now() - startTime;
    const quality = this.featureFlags.enableQualityAssessment
      ? this.assessSampleQuality(samples, '')
      : { diversity: 0.5, coherence: 0.5, relevance: 0.5 };

    const result: SamplingResult = {
      samples,
      strategy: config.strategy || 'balanced',
      parameters: config,
      quality,
      metadata: {
        generationTime,
        tokensGenerated: this.estimateTokenCount(samples),
        samplingMethod: config.method || 'default',
        transportUsed,
        strategy: config.strategy || 'balanced',
      },
    };

    return Success(result);
  }

  private buildStrategyPrompt(
    prompt: string,
    strategy: SamplingStrategy,
    context: SamplingContext,
  ): string {
    let enhancedPrompt = `${prompt}\n\nOptimization focus: ${strategy}\n`;

    enhancedPrompt += `\nApplication context:\n`;
    enhancedPrompt += `- Language: ${context.language}\n`;
    if (context.framework) enhancedPrompt += `- Framework: ${context.framework}\n`;
    enhancedPrompt += `- Dependencies: ${context.dependencies.slice(0, 5).join(', ')}\n`;
    enhancedPrompt += `- Ports: ${context.ports.join(', ')}\n`;
    enhancedPrompt += `- Environment: ${context.environment}\n`;

    switch (strategy) {
      case 'security':
        enhancedPrompt +=
          '\nSecurity requirements:\n- Use minimal base images\n- Run as non-root user\n- Implement vulnerability scanning';
        break;
      case 'performance':
        enhancedPrompt +=
          '\nPerformance requirements:\n- Optimize for fast startup\n- Use efficient caching\n- Minimize layer operations';
        break;
      case 'size':
        enhancedPrompt +=
          '\nSize optimization:\n- Use alpine or distroless images\n- Remove unnecessary files\n- Combine RUN commands';
        break;
      case 'balanced':
        enhancedPrompt +=
          '\nBalanced approach:\n- Follow Docker best practices\n- Include health checks\n- Maintain readability';
        break;
    }

    return enhancedPrompt;
  }

  private createDockerfileVariant(
    content: string,
    strategy: string,
    index: number,
    context: SamplingContext,
  ): DockerfileVariant {
    return {
      id: `${strategy}-${index}`,
      content,
      strategy: `${strategy}`,
      metadata: {
        baseImage: this.extractBaseImage(content) || this.getDefaultBaseImage(context.language),
        optimization: strategy as any,
        features: this.extractFeatures(content),
        estimatedSize: this.estimateImageSize(content, strategy),
        buildComplexity: this.assessBuildComplexity(content),
        securityFeatures: this.extractSecurityFeatures(content),
        aiEnhanced: true,
      },
      generated: new Date(),
    };
  }

  private getTemperatureForStrategy(strategy: SamplingStrategy): number {
    const temperatures: Record<SamplingStrategy, number> = {
      security: 0.3,
      performance: 0.5,
      size: 0.4,
      balanced: 0.7,
      creative: 0.8,
    };
    return temperatures[strategy] || 0.5;
  }

  private assessSampleQuality(samples: string[], prompt: string): SamplingQuality {
    const diversity = this.calculateDiversity(samples);
    const coherence = this.calculateCoherence(samples, prompt);
    const relevance = this.calculateRelevance(samples, prompt);

    return {
      diversity: Math.round(diversity * 100) / 100,
      coherence: Math.round(coherence * 100) / 100,
      relevance: Math.round(relevance * 100) / 100,
    };
  }

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

    return 1 - totalSimilarity / comparisons;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  private calculateCoherence(samples: string[], prompt: string): number {
    if (!prompt) return 0.8; // Default coherence when no prompt provided

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

  private calculateRelevance(samples: string[], prompt: string): number {
    if (!prompt) return 0.8; // Default relevance when no prompt provided

    const promptType = this.detectPromptType(prompt);
    let totalRelevance = 0;

    for (const sample of samples) {
      const relevance = this.assessTypeRelevance(sample, promptType);
      totalRelevance += relevance;
    }

    return totalRelevance / samples.length;
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 20);
  }

  private detectPromptType(prompt: string): string {
    const lower = prompt.toLowerCase();
    if (lower.includes('dockerfile')) return 'dockerfile';
    if (lower.includes('kubernetes')) return 'kubernetes';
    return 'general';
  }

  private assessTypeRelevance(sample: string, type: string): number {
    const sampleLower = sample.toLowerCase();
    const typeIndicators: Record<string, string[]> = {
      dockerfile: ['from', 'run', 'copy', 'expose', 'cmd'],
      kubernetes: ['apiversion', 'kind', 'metadata', 'spec'],
      general: ['recommendation', 'suggestion', 'approach'],
    };

    const indicators = typeIndicators[type] ||
      typeIndicators.general || ['recommendation', 'suggestion', 'approach'];
    const foundIndicators = indicators.filter((indicator) =>
      sampleLower.includes(indicator),
    ).length;
    return foundIndicators / indicators.length;
  }

  private estimateTokenCount(samples: string[]): number {
    return samples.reduce((total, sample) => total + Math.ceil(sample.length / 4), 0);
  }

  private extractBaseImage(content: string): string | null {
    const match = content.match(/^FROM\s+(\S+)/m);
    return match ? match[1] || null : null;
  }

  private getDefaultBaseImage(language: string): string {
    const images: Record<string, string> = {
      javascript: 'node:18-alpine',
      typescript: 'node:18-alpine',
      python: 'python:3.11-alpine',
      go: 'golang:1.20-alpine',
      java: 'openjdk:17-alpine',
    };
    return images[language] || 'alpine:latest';
  }

  private extractFeatures(content: string): string[] {
    const features: string[] = [];
    const contentLower = content.toLowerCase();

    if ((content.match(/^FROM /gm) || []).length > 1) features.push('multi-stage');
    if (contentLower.includes('user ') && !contentLower.includes('user root'))
      features.push('non-root-user');
    if (contentLower.includes('healthcheck')) features.push('health-check');
    if (contentLower.includes('alpine') || contentLower.includes('distroless'))
      features.push('minimal-base');

    return features.length > 0 ? features : ['standard'];
  }

  private extractSecurityFeatures(content: string): string[] {
    const features: string[] = [];
    const contentLower = content.toLowerCase();

    if (contentLower.includes('user ') && !contentLower.includes('user root'))
      features.push('non-root-user');
    if (contentLower.includes('scan') || contentLower.includes('trivy'))
      features.push('vulnerability-scanning');

    return features;
  }

  private estimateImageSize(content: string, strategy: string): string {
    let sizeInMB = 150;
    const contentLower = content.toLowerCase();

    if (contentLower.includes('alpine')) sizeInMB = 50;
    else if (contentLower.includes('distroless')) sizeInMB = 30;

    if (strategy === 'size') sizeInMB *= 0.7;
    else if (strategy === 'security') sizeInMB *= 1.1;

    return `${Math.round(sizeInMB)}MB`;
  }

  private assessBuildComplexity(content: string): 'low' | 'medium' | 'high' {
    const lines = content.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
    const runCommands = (content.match(/^RUN /gm) || []).length;

    if (runCommands > 10 || lines.length > 50) return 'high';
    if (runCommands > 5 || lines.length > 25) return 'medium';
    return 'low';
  }
}
