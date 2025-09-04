/**
 * Common AI types and configurations
 */

/**
 * Enhanced AI service configuration
 */
export type EnhancedAIConfig = {
  /** Model preferences for different tasks */
  models?: {
    default?: string;
    dockerfile?: string;
    kubernetes?: string;
    analysis?: string;
  };

  /** Default sampling parameters */
  sampling?: {
    temperature?: number;
    maxTokens?: number;
  };

  /** Cache configuration */
  cache?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };

  /** Error recovery settings */
  errorRecovery?: {
    maxAttempts?: number;
    baseDelay?: number;
    enableRecovery?: boolean;
  };

  /** Enable performance monitoring */
  enableMetrics?: boolean;
};

/**
 * AI operation context
 */
export type AIContext = {
  sessionId?: string;
  userId?: string;
  operation: string;
  startTime: number;
  metadata?: Record<string, unknown>;
};

/**
 * AI metrics for monitoring
 */
export type AIMetrics = {
  requestCount: number;
  successCount: number;
  errorCount: number;
  averageLatency: number;
  totalTokensUsed: number;
  cacheHitRate: number;
};
