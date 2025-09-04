/**
 * Dynamic Sampling Strategy
 * Provides context-aware parameter selection for AI requests
 */

/**
 * Sampling parameters for AI requests
 */
export interface SamplingParams {
  temperature: number;
  maxTokens: number;
  topP?: number | undefined;
  model?: string | undefined;
}

/**
 * Context information that affects sampling parameters
 */
export interface SamplingContext {
  isRetry?: boolean;
  attemptNumber?: number;
  complexity?: 'low' | 'medium' | 'high';
  errorCount?: number;
  previousErrors?: string[];
  taskType?: 'generation' | 'analysis' | 'fix' | 'optimization';
  contentLength?: number;
  timeConstraint?: 'fast' | 'normal' | 'thorough';
}

/**
 * Template-specific sampling strategies
 */
const TEMPLATE_STRATEGIES: Record<string, SamplingParams> = {
  // Generation tasks - moderate creativity needed
  'dockerfile-generation': {
    temperature: 0.2,
    maxTokens: 1500,
    topP: 0.95,
  },

  // Analysis tasks - high accuracy needed
  'repository-analysis': {
    temperature: 0.1,
    maxTokens: 800,
    topP: 0.9,
  },

  // Fix tasks - balanced creativity and accuracy
  'dockerfile-fix': {
    temperature: 0.3,
    maxTokens: 1000,
    topP: 0.9,
  },

  // Error analysis - high precision needed
  'error-analysis': {
    temperature: 0.2,
    maxTokens: 600,
    topP: 0.85,
  },

  // Optimization suggestions - higher creativity
  'optimization-suggestion': {
    temperature: 0.4,
    maxTokens: 800,
    topP: 0.9,
  },

  // JSON repair - very low temperature for precision
  'json-repair': {
    temperature: 0.1,
    maxTokens: 500,
    topP: 1.0,
  },

  // Kubernetes generation
  'k8s-generation': {
    temperature: 0.2,
    maxTokens: 1800,
    topP: 0.95,
  },

  // Kubernetes fixes
  'k8s-fix': {
    temperature: 0.3,
    maxTokens: 1200,
    topP: 0.9,
  },
};

/**
 * Intelligent sampling strategy provider
 */
export class SamplingStrategy {
  /**
   * Get optimized sampling parameters for a given template and context
   * @param templateId - Template identifier
   * @param context - Optional context for adjustments
   */
  static getParameters(templateId: string, context?: SamplingContext): SamplingParams {
    // Start with template-specific base parameters
    const baseParams = TEMPLATE_STRATEGIES[templateId] || {
      temperature: 0.2,
      maxTokens: 1000,
      topP: 0.9,
    };

    // Apply context-based adjustments
    if (!context) {
      return { ...baseParams };
    }

    let adjustedParams = { ...baseParams };

    // Retry adjustments - increase temperature for more variety
    if (context.isRetry ?? (context.attemptNumber && context.attemptNumber > 1)) {
      adjustedParams = this.adjustForRetry(adjustedParams, context.attemptNumber ?? 1);
    }

    // Error-based adjustments - increase precision if errors are frequent
    if (context.errorCount && context.errorCount > 0) {
      adjustedParams = this.adjustForErrors(adjustedParams, context.errorCount);
    }

    // Complexity adjustments
    if (context.complexity) {
      adjustedParams = this.adjustForComplexity(adjustedParams, context.complexity);
    }

    // Task type adjustments
    if (context.taskType) {
      adjustedParams = this.adjustForTaskType(adjustedParams, context.taskType);
    }

    // Content length adjustments
    if (context.contentLength) {
      adjustedParams = this.adjustForContentLength(adjustedParams, context.contentLength);
    }

    // Time constraint adjustments
    if (context.timeConstraint != null) {
      adjustedParams = this.adjustForTimeConstraint(adjustedParams, context.timeConstraint);
    }

    // Ensure parameters stay within reasonable bounds
    return this.enforceConstraints(adjustedParams);
  }

  /**
   * Adjust parameters for retry attempts
   * Increases temperature for more variety on subsequent attempts
   */
  private static adjustForRetry(params: SamplingParams, attemptNumber: number): SamplingParams {
    const tempIncrease = Math.min(0.1 * (attemptNumber - 1), 0.3);
    return {
      ...params,
      temperature: Math.min(params.temperature + tempIncrease, 0.8),
      // Slightly increase tokens for more detailed attempts
      maxTokens: Math.min(params.maxTokens + 100, params.maxTokens * 1.2),
    };
  }

  /**
   * Adjust parameters based on error frequency
   * Reduces temperature for higher precision when errors are common
   */
  private static adjustForErrors(params: SamplingParams, errorCount: number): SamplingParams {
    const tempDecrease = Math.min(0.05 * errorCount, 0.15);
    return {
      ...params,
      temperature: Math.max(params.temperature - tempDecrease, 0.05),
      topP: Math.max((params.topP ?? 0.9) - 0.05 * errorCount, 0.7),
    };
  }

  /**
   * Adjust parameters based on task complexity
   */
  private static adjustForComplexity(
    params: SamplingParams,
    complexity: 'low' | 'medium' | 'high',
  ): SamplingParams {
    switch (complexity) {
      case 'low':
        return {
          ...params,
          temperature: Math.max(params.temperature - 0.05, 0.1),
          maxTokens: Math.max(params.maxTokens * 0.8, 300),
        };

      case 'high':
        return {
          ...params,
          temperature: Math.min(params.temperature + 0.1, 0.6),
          maxTokens: Math.min(params.maxTokens * 1.3, 2500),
        };

      default: // medium
        return params;
    }
  }

  /**
   * Adjust parameters based on task type
   */
  private static adjustForTaskType(
    params: SamplingParams,
    taskType: SamplingContext['taskType'],
  ): SamplingParams {
    switch (taskType) {
      case 'analysis':
        return {
          ...params,
          temperature: Math.max(params.temperature - 0.05, 0.1), // More precise
        };

      case 'generation':
        return {
          ...params,
          temperature: Math.min(params.temperature + 0.05, 0.5), // Slightly more creative
        };

      case 'optimization':
        return {
          ...params,
          temperature: Math.min(params.temperature + 0.1, 0.6), // More creative
          maxTokens: Math.min(params.maxTokens * 1.2, 2000), // More space for suggestions
        };

      default:
        return params;
    }
  }

  /**
   * Adjust parameters based on content length
   */
  private static adjustForContentLength(
    params: SamplingParams,
    contentLength: number,
  ): SamplingParams {
    if (contentLength > 5000) {
      // Large content - increase tokens, reduce temperature for focus
      return {
        ...params,
        temperature: Math.max(params.temperature - 0.05, 0.1),
        maxTokens: Math.min(params.maxTokens * 1.5, 3000),
      };
    } else if (contentLength < 500) {
      // Small content - reduce tokens
      return {
        ...params,
        maxTokens: Math.max(params.maxTokens * 0.7, 200),
      };
    }

    return params;
  }

  /**
   * Adjust parameters based on time constraints
   */
  private static adjustForTimeConstraint(
    params: SamplingParams,
    constraint: 'fast' | 'normal' | 'thorough',
  ): SamplingParams {
    switch (constraint) {
      case 'fast':
        return {
          ...params,
          maxTokens: Math.max(params.maxTokens * 0.7, 200), // Shorter responses
          temperature: Math.max(params.temperature - 0.1, 0.1), // More focused
        };

      case 'thorough':
        return {
          ...params,
          maxTokens: Math.min(params.maxTokens * 1.4, 2500), // Longer responses
          temperature: Math.min(params.temperature + 0.05, 0.4), // Slightly more explorative
        };

      default:
        return params;
    }
  }

  /**
   * Enforce parameter constraints to prevent extreme values
   */
  private static enforceConstraints(params: SamplingParams): SamplingParams {
    return {
      temperature: Math.max(0.05, Math.min(0.9, params.temperature)),
      maxTokens: Math.max(100, Math.min(4000, Math.round(params.maxTokens))),
      topP: params.topP ? Math.max(0.1, Math.min(1.0, params.topP)) : params.topP,
      model: params.model,
    };
  }

  /**
   * Get default parameters for unknown templates
   */
  static getDefaultParameters(): SamplingParams {
    return {
      temperature: 0.2,
      maxTokens: 1000,
      topP: 0.9,
    };
  }

  /**
   * Create sampling context from common scenarios
   */
  static createContext(options: Partial<SamplingContext> = {}): SamplingContext {
    return {
      complexity: 'medium',
      taskType: 'generation',
      timeConstraint: 'normal',
      ...options,
    };
  }

  /**
   * Get template-specific base parameters (for inspection/testing)
   */
  static getTemplateDefaults(templateId: string): SamplingParams | null {
    return TEMPLATE_STRATEGIES[templateId] || null;
  }
}
