/**
 * Centralized AI Augmentation Service
 *
 * Provides unified AI augmentation capabilities for tools, strategies, and workflows.
 * Consolidates all AI integration patterns using SDK-compatible interfaces.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../../domain/types';
import type { MCPHostAI } from '../mcp-host-ai';
import type { PromptRegistry } from '../../prompts/prompt-registry';

/**
 * AI augmentation request context
 */
export interface AIAugmentationContext {
  toolName?: string;
  strategy?: string;
  operation: 'augment-tool' | 'augment-strategy' | 'analyze-result' | 'optimize-config';
  target: 'dockerfile' | 'kubernetes' | 'analysis' | 'general';
  originalResult: any;
  metadata?: Record<string, unknown>;
  requirements?: {
    securityLevel?: 'basic' | 'standard' | 'strict';
    optimization?: 'security' | 'performance' | 'size' | 'balanced';
    environment?: 'development' | 'staging' | 'production';
  };
}

/**
 * AI augmentation result
 */
export interface AIAugmentationResult {
  augmented: boolean;
  originalValue: any;
  augmentedValue?: any;
  insights?: string[];
  recommendations?: string[];
  warnings?: string[];
  metadata: {
    aiProvider: string;
    processingTime?: number;
    tokensUsed?: number;
    augmentationType: string;
    confidence?: number;
  };
}

/**
 * Centralized AI Augmentation Service
 */
export class AIAugmentationService {
  private logger: Logger;

  constructor(
    private mcpHostAI: MCPHostAI,
    private promptRegistry: PromptRegistry,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'AIAugmentationService' });
  }

  /**
   * Augment tool execution results with AI insights
   */
  async augmentTool(
    toolName: string,
    result: any,
    context: Partial<AIAugmentationContext> = {},
  ): Promise<Result<AIAugmentationResult>> {
    try {
      const startTime = Date.now();

      // Check if AI augmentation is available
      if (!this.mcpHostAI.isAvailable()) {
        return Success(this.createBasicResult(result, false, 'AI not available'));
      }

      // Check if result is suitable for AI augmentation
      if (!this.shouldAugmentResult(result)) {
        return Success(
          this.createBasicResult(result, false, 'Result not suitable for AI augmentation'),
        );
      }

      // Build augmentation context
      const augmentationContext: AIAugmentationContext = {
        toolName,
        operation: 'augment-tool',
        target: this.detectTargetType(toolName),
        originalResult: result,
        metadata: context.metadata || {},
        requirements: context.requirements || {},
      };

      // Get appropriate prompt for tool augmentation
      const promptResult = await this.getAugmentationPrompt(augmentationContext);
      if (!promptResult.ok) {
        this.logger.warn(
          { toolName, error: promptResult.error },
          'Failed to get augmentation prompt',
        );
        return Success(
          this.createBasicResult(result, false, 'Failed to generate augmentation prompt'),
        );
      }

      // Submit AI augmentation request
      const aiResult = await this.mcpHostAI.submitPrompt(promptResult.value.prompt, {
        toolName,
        result: this.sanitizeResultForAI(result),
        context: augmentationContext,
      });

      const processingTime = Date.now() - startTime;

      if (aiResult.ok) {
        const augmentationResult: AIAugmentationResult = {
          augmented: true,
          originalValue: result,
          insights: [`AI augmentation requested for ${toolName} results`],
          recommendations: ['Check MCP host for detailed AI analysis'],
          metadata: {
            aiProvider: this.mcpHostAI.getHostType(),
            processingTime,
            augmentationType: 'tool-augmentation',
            confidence: 0.8, // Default confidence for MCP host processing
          },
        };

        this.logger.debug(
          {
            toolName,
            processingTime,
            augmented: true,
          },
          'Tool result augmented with AI',
        );

        return Success(augmentationResult);
      } else {
        this.logger.warn({ toolName, error: aiResult.error }, 'AI augmentation request failed');
        return Success(this.createBasicResult(result, false, 'AI augmentation request failed'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ toolName, error: message }, 'Tool augmentation failed');
      return Failure(`Tool augmentation failed: ${message}`);
    }
  }

  /**
   * Augment strategy execution with AI insights
   */
  async augmentStrategy(
    strategy: string,
    context: any,
    requirements?: AIAugmentationContext['requirements'],
  ): Promise<Result<AIAugmentationResult>> {
    try {
      const startTime = Date.now();

      if (!this.mcpHostAI.isAvailable()) {
        return Success(this.createBasicResult(context, false, 'AI not available'));
      }

      // Use strategy-specific prompt from registry
      const promptArgs = {
        strategy,
        context,
        language: context.language,
        framework: context.framework,
        optimization: requirements?.optimization || strategy,
        focus: this.getStrategyFocus(strategy),
      };

      const aiPrompt = await this.promptRegistry.getPrompt('strategy-optimization', promptArgs);

      const firstMessage = aiPrompt.messages?.[0];
      const promptText: string =
        firstMessage && typeof firstMessage.content === 'object' && 'text' in firstMessage.content
          ? (firstMessage.content as { text: string }).text || ''
          : '';

      const aiResult = await this.mcpHostAI.submitPrompt(promptText, {
        strategy,
        context,
        requirements,
      });

      const processingTime = Date.now() - startTime;

      if (aiResult.ok) {
        const augmentationResult: AIAugmentationResult = {
          augmented: true,
          originalValue: context,
          insights: [`AI strategy optimization requested for ${strategy}`],
          recommendations: ['Strategy-specific recommendations available from MCP host'],
          metadata: {
            aiProvider: this.mcpHostAI.getHostType(),
            processingTime,
            augmentationType: 'strategy-augmentation',
            confidence: 0.9, // High confidence for strategy optimization
          },
        };

        this.logger.debug(
          {
            strategy,
            processingTime,
            augmented: true,
          },
          'Strategy augmented with AI',
        );

        return Success(augmentationResult);
      } else {
        return Success(this.createBasicResult(context, false, 'AI strategy augmentation failed'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ strategy, error: message }, 'Strategy augmentation failed');
      return Failure(`Strategy augmentation failed: ${message}`);
    }
  }

  /**
   * Analyze and augment any result with AI
   */
  async analyzeResult(
    result: any,
    analysisType: 'security' | 'performance' | 'optimization' | 'general' = 'general',
    context?: Record<string, unknown>,
  ): Promise<Result<AIAugmentationResult>> {
    try {
      const startTime = Date.now();

      if (!this.mcpHostAI.isAvailable()) {
        return Success(this.createBasicResult(result, false, 'AI not available'));
      }

      const prompt = this.generateAnalysisPrompt(analysisType, result, context);

      const aiResult = await this.mcpHostAI.submitPrompt(prompt, {
        analysisType,
        result: this.sanitizeResultForAI(result),
        context: context || {},
      });

      const processingTime = Date.now() - startTime;

      if (aiResult.ok) {
        const augmentationResult: AIAugmentationResult = {
          augmented: true,
          originalValue: result,
          insights: [`AI ${analysisType} analysis completed`],
          recommendations: ['Detailed analysis available from MCP host'],
          metadata: {
            aiProvider: this.mcpHostAI.getHostType(),
            processingTime,
            augmentationType: 'result-analysis',
            confidence: 0.85,
          },
        };

        this.logger.debug(
          {
            analysisType,
            processingTime,
            augmented: true,
          },
          'Result analyzed with AI',
        );

        return Success(augmentationResult);
      } else {
        return Success(this.createBasicResult(result, false, 'AI analysis failed'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ analysisType, error: message }, 'Result analysis failed');
      return Failure(`Result analysis failed: ${message}`);
    }
  }

  /**
   * Check if AI augmentation is available
   */
  isAvailable(): boolean {
    return this.mcpHostAI.isAvailable();
  }

  /**
   * Get AI provider information
   */
  getProviderInfo(): { type: string; available: boolean } {
    return {
      type: this.mcpHostAI.getHostType(),
      available: this.mcpHostAI.isAvailable(),
    };
  }

  /**
   * Private helper methods
   */

  private createBasicResult(
    originalValue: any,
    augmented: boolean,
    reason: string,
  ): AIAugmentationResult {
    return {
      augmented,
      originalValue,
      insights: augmented ? [] : [reason],
      metadata: {
        aiProvider: this.mcpHostAI.getHostType(),
        augmentationType: 'none',
        confidence: 0,
      },
    };
  }

  private shouldAugmentResult(result: any): boolean {
    // Don't augment errors or null results
    if (!result || (typeof result === 'object' && 'ok' in result && !result.ok)) {
      return false;
    }

    // Don't augment trivial results
    if (typeof result === 'string' && result.length < 10) {
      return false;
    }

    // Don't augment binary data or very large objects
    if (typeof result === 'object') {
      const stringified = JSON.stringify(result);
      if (stringified.length > 10000) {
        return false;
      }
    }

    return true;
  }

  private detectTargetType(toolName: string): AIAugmentationContext['target'] {
    if (toolName.includes('dockerfile') || toolName.includes('container')) {
      return 'dockerfile';
    }
    if (
      toolName.includes('k8s') ||
      toolName.includes('kubernetes') ||
      toolName.includes('deploy')
    ) {
      return 'kubernetes';
    }
    if (toolName.includes('analyze') || toolName.includes('scan')) {
      return 'analysis';
    }
    return 'general';
  }

  private async getAugmentationPrompt(
    context: AIAugmentationContext,
  ): Promise<Result<{ prompt: string }>> {
    try {
      let promptName: string;

      switch (context.target) {
        case 'dockerfile':
          promptName = 'dockerfile-generation';
          break;
        case 'kubernetes':
          promptName = 'k8s-manifest-generation';
          break;
        case 'analysis':
          promptName = 'security-analysis';
          break;
        default: {
          // Generate a generic augmentation prompt
          const genericPrompt = `Analyze and augment the following result with actionable insights and recommendations:\n\n${JSON.stringify(context.originalResult, null, 2)}`;
          return Success({
            prompt: genericPrompt,
          });
        }
      }

      const promptResult = await this.promptRegistry.getPrompt(promptName, {
        toolName: context.toolName,
        operation: context.operation,
        ...context.metadata,
        ...context.requirements,
      });

      const firstMsg = promptResult.messages?.[0];
      const promptText: string =
        firstMsg && typeof firstMsg.content === 'object' && 'text' in firstMsg.content
          ? (firstMsg.content as { text: string }).text ||
            'Augment the provided result with insights and recommendations.'
          : 'Augment the provided result with insights and recommendations.';

      return Success({
        prompt: promptText,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Failed to generate augmentation prompt: ${message}`);
    }
  }

  private sanitizeResultForAI(result: any): any {
    // Remove sensitive information and limit size for AI processing
    try {
      const sanitized = JSON.parse(
        JSON.stringify(result, (key, value) => {
          // Remove sensitive keys
          if (
            typeof key === 'string' &&
            (key.toLowerCase().includes('password') ||
              key.toLowerCase().includes('secret') ||
              key.toLowerCase().includes('token') ||
              key.toLowerCase().includes('key'))
          ) {
            return '[REDACTED]';
          }
          return value;
        }),
      );

      // Limit size
      const stringified = JSON.stringify(sanitized);
      if (stringified.length > 5000) {
        return `${JSON.stringify(sanitized).substring(0, 5000)}...[TRUNCATED]`;
      }

      return sanitized;
    } catch {
      return '[Unable to sanitize result for AI processing]';
    }
  }

  private getStrategyFocus(strategy: string): string {
    const focuses = {
      'security-first': 'security hardening, non-root users, minimal attack surface',
      'performance-optimized':
        'multi-stage builds, layer caching, build optimization, runtime performance',
      'size-optimized':
        'minimal image size, distroless images, layer optimization, dependency pruning',
      balanced: 'balanced optimization across security, performance, and size',
    };
    return focuses[strategy as keyof typeof focuses] || 'general optimization';
  }

  private generateAnalysisPrompt(
    analysisType: string,
    result: any,
    context?: Record<string, unknown>,
  ): string {
    const basePrompt = `Perform a ${analysisType} analysis of the following result and provide actionable insights:`;
    const contextStr = context ? `\n\nContext: ${JSON.stringify(context, null, 2)}` : '';
    const resultStr = `\n\nResult to analyze:\n${JSON.stringify(this.sanitizeResultForAI(result), null, 2)}`;

    return `${basePrompt + contextStr + resultStr}\n\nProvide specific recommendations and highlight any concerns.`;
  }
}
