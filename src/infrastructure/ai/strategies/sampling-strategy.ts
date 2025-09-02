export enum TaskType {
  CODE_GENERATION = 'code_generation',
  ANALYSIS = 'analysis',
  DOCUMENTATION = 'documentation',
  ERROR_DIAGNOSIS = 'error_diagnosis',
  OPTIMIZATION = 'optimization',
  CONFIGURATION = 'configuration'
}

export interface SamplingParams {
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
}

export interface SamplingContext {
  retryCount?: number;
  complexity?: 'low' | 'medium' | 'high';
  contentLength?: number;
  timeConstraint?: 'fast' | 'standard' | 'thorough';
  previousErrors?: string[];
}

export class SamplingStrategy {
  private strategies: Map<TaskType, SamplingParams> = new Map([
    [
      TaskType.CODE_GENERATION,
      {
        temperature: 0.3,
        top_p: 0.95,
        frequency_penalty: 0.1,
        presence_penalty: 0.0
      }
    ],
    [
      TaskType.ANALYSIS,
      {
        temperature: 0.5,
        top_p: 0.9,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      }
    ],
    [
      TaskType.DOCUMENTATION,
      {
        temperature: 0.7,
        top_p: 0.85,
        frequency_penalty: 0.2,
        presence_penalty: 0.1
      }
    ],
    [
      TaskType.ERROR_DIAGNOSIS,
      {
        temperature: 0.2,
        top_p: 0.95,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      }
    ],
    [
      TaskType.OPTIMIZATION,
      {
        temperature: 0.4,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1
      }
    ],
    [
      TaskType.CONFIGURATION,
      {
        temperature: 0.3,
        top_p: 0.9,
        frequency_penalty: 0.05,
        presence_penalty: 0.0
      }
    ]
  ]);

  getParams(taskType: TaskType, context?: SamplingContext): SamplingParams {
    const baseParams = this.strategies.get(taskType) || this.getDefaultParams();

    if (!context) {
      return baseParams;
    }

    // Apply context-based adjustments
    let adjustedParams = { ...baseParams };

    // Retry adjustments - increase randomness for retries
    if (context.retryCount && context.retryCount > 0) {
      adjustedParams = this.adjustForRetry(adjustedParams, context.retryCount);
    }

    // Complexity adjustments
    if (context.complexity) {
      adjustedParams = this.adjustForComplexity(adjustedParams, context.complexity);
    }

    // Content length adjustments
    if (context.contentLength) {
      adjustedParams = this.adjustForContentLength(adjustedParams, context.contentLength);
    }

    // Time constraint adjustments
    if (context.timeConstraint != null) {
      adjustedParams = this.adjustForTimeConstraint(adjustedParams, context.timeConstraint);
    }

    // Error-based adjustments
    if (context.previousErrors && context.previousErrors.length > 0) {
      adjustedParams = this.adjustForErrors(adjustedParams, context.previousErrors);
    }

    // Ensure parameters are within valid bounds
    return this.constrainParameters(adjustedParams);
  }

  private getDefaultParams(): SamplingParams {
    return {
      temperature: 0.5,
      top_p: 0.9,
      frequency_penalty: 0.0,
      presence_penalty: 0.0
    };
  }

  private adjustForRetry(params: SamplingParams, retryCount: number): SamplingParams {
    // Increase temperature and reduce top_p for retries to explore different solutions
    const tempIncrease = Math.min(0.2, retryCount * 0.1);
    const topPIncrease = Math.min(0.1, retryCount * 0.05);

    return {
      ...params,
      temperature: params.temperature + tempIncrease,
      top_p: Math.min(1.0, params.top_p + topPIncrease)
    };
  }

  private adjustForComplexity(params: SamplingParams, complexity: string): SamplingParams {
    switch (complexity) {
      case 'low':
        return {
          ...params,
          temperature: Math.max(0.1, params.temperature - 0.1),
          top_p: Math.max(0.8, params.top_p - 0.05)
        };
      case 'high':
        return {
          ...params,
          temperature: Math.min(0.8, params.temperature + 0.1),
          top_p: Math.min(0.95, params.top_p + 0.05),
          presence_penalty: Math.min(0.5, params.presence_penalty + 0.1)
        };
      default:
        return params;
    }
  }

  private adjustForContentLength(params: SamplingParams, contentLength: number): SamplingParams {
    // For very long content, be more conservative
    if (contentLength > 10000) {
      return {
        ...params,
        temperature: Math.max(0.1, params.temperature - 0.1),
        frequency_penalty: Math.min(1.0, params.frequency_penalty + 0.1)
      };
    }

    // For very short content, allow more creativity
    if (contentLength < 1000) {
      return {
        ...params,
        temperature: Math.min(0.8, params.temperature + 0.1)
      };
    }

    return params;
  }

  private adjustForTimeConstraint(params: SamplingParams, constraint: string): SamplingParams {
    switch (constraint) {
      case 'fast':
        // Lower creativity for faster, more deterministic responses
        return {
          ...params,
          temperature: Math.max(0.1, params.temperature - 0.2),
          top_p: Math.max(0.7, params.top_p - 0.1)
        };
      case 'thorough':
        // Higher creativity for more thorough exploration
        return {
          ...params,
          temperature: Math.min(0.7, params.temperature + 0.1),
          top_p: Math.min(0.95, params.top_p + 0.05),
          presence_penalty: Math.min(0.3, params.presence_penalty + 0.1)
        };
      default:
        return params;
    }
  }

  private adjustForErrors(params: SamplingParams, errors: string[]): SamplingParams {
    const errorCount = errors.length;

    if (errorCount > 2) {
      // Many errors - be more conservative
      return {
        ...params,
        temperature: Math.max(0.1, params.temperature - 0.15),
        top_p: Math.max(0.8, params.top_p - 0.1),
        frequency_penalty: Math.min(1.0, params.frequency_penalty + 0.1)
      };
    }

    return params;
  }

  private constrainParameters(params: SamplingParams): SamplingParams {
    return {
      temperature: Math.max(0.0, Math.min(1.0, params.temperature)),
      top_p: Math.max(0.1, Math.min(1.0, params.top_p)),
      frequency_penalty: Math.max(-2.0, Math.min(2.0, params.frequency_penalty)),
      presence_penalty: Math.max(-2.0, Math.min(2.0, params.presence_penalty))
    };
  }

  // Helper method to create a sampling context
  createContext(options: Partial<SamplingContext> = {}): SamplingContext {
    return {
      retryCount: 0,
      complexity: 'medium',
      timeConstraint: 'standard',
      previousErrors: [],
      ...options
    };
  }

  // Get strategy for a specific task type without context
  getStrategyForTask(taskType: TaskType): SamplingParams {
    return this.strategies.get(taskType) || this.getDefaultParams();
  }

  // Update or add a strategy for a task type
  setStrategy(taskType: TaskType, params: SamplingParams): void {
    this.strategies.set(taskType, this.constrainParameters(params));
  }

  // Get all available task types
  getAvailableTaskTypes(): TaskType[] {
    return Object.values(TaskType);
  }

  // Analyze the effectiveness of current parameters (for optimization)
  analyzeEffectiveness(
    _taskType: TaskType,
    results: Array<{ params: SamplingParams; success: boolean; quality: number }>
  ): AnalysisResult {
    const successful = results.filter((r) => r.success);

    if (results.length === 0) {
      return { recommendation: 'insufficient_data', confidence: 0 };
    }

    const successRate = successful.length / results.length;
    const avgQuality =
      successful.length > 0
        ? successful.reduce((sum, r) => sum + r.quality, 0) / successful.length
        : 0;

    // Simple analysis - more sophisticated ML-based analysis could be added
    let recommendation: string;
    let confidence: number;

    if (successRate > 0.8 && avgQuality > 0.7) {
      recommendation = 'current_strategy_effective';
      confidence = 0.8;
    } else if (successRate < 0.5) {
      recommendation = 'reduce_creativity';
      confidence = 0.7;
    } else if (avgQuality < 0.5) {
      recommendation = 'increase_creativity';
      confidence = 0.6;
    } else {
      recommendation = 'minor_adjustments';
      confidence = 0.5;
    }

    return {
      recommendation,
      confidence,
      successRate,
      avgQuality,
      sampleSize: results.length
    };
  }
}

export interface AnalysisResult {
  recommendation: string;
  confidence: number;
  successRate?: number;
  avgQuality?: number;
  sampleSize?: number;
}
