/**
 * Simple Functional Error Recovery
 * Replaces complex strategy pattern with direct function-based error handling
 */

import type { AIRequest } from './requests';

/**
 * Error handler function type - much simpler than strategy classes
 */
export type ErrorHandler = (error: Error, request: AIRequest) => AIRequest | null;

/**
 * Error recovery result using discriminated union
 */
export type RecoveryResult =
  | { success: true; request: AIRequest; strategy: string }
  | { success: false; error: string };

/**
 * Main error recovery function - replaces complex coordinator
 */
export function recoverFromError(error: Error, request: AIRequest): RecoveryResult {
  const errorMessage = error.message.toLowerCase();

  // Try each handler in order of specificity
  const handlers = [
    ['json', ['parse', 'invalid json', 'malformed', 'syntax', 'unexpected token']],
    ['timeout', ['timeout', 'took too long', 'request timeout']],
    ['rate-limit', ['rate limit', '429', 'too many requests', 'quota exceeded']],
    ['token-limit', ['maximum context', 'too many tokens', 'context length', 'token limit']],
  ] as const;

  for (const [handlerName, patterns] of handlers) {
    if (patterns.some((pattern) => errorMessage.includes(pattern))) {
      const handler = ERROR_HANDLERS[handlerName];
      const recoveredRequest = handler?.(error, request);

      if (recoveredRequest) {
        return {
          success: true,
          request: recoveredRequest,
          strategy: handlerName,
        };
      }
    }
  }

  return {
    success: false,
    error: `No recovery strategy available for: ${error.message}`,
  };
}

/**
 * Error handler implementations - replace complex strategy classes
 */
const ERROR_HANDLERS: Record<string, ErrorHandler> = {
  json: handleJsonParseError,
  timeout: handleTimeoutError,
  'rate-limit': handleRateLimitError,
  'token-limit': handleTokenLimitError,
};

/**
 * JSON parse error recovery - lower temperature for deterministic output
 */
function handleJsonParseError(error: Error, request: AIRequest): AIRequest {
  // Extract any malformed JSON from error message for context
  const jsonMatch = error.message.match(/(?:JSON|json)[\s\S]*?(\{[\s\S]*?\}|\[[\s\S]*?\])/);
  const malformedContent = jsonMatch?.[1] ?? '';

  return {
    ...request,
    temperature: 0.1, // Very low for precise JSON
    maxTokens: Math.min(request.maxTokens ?? 1000, 2000),
    prompt: `${request.prompt}\n\nIMPORTANT: Return only valid JSON with no additional text or formatting.`,
    context: {
      ...request.context,
      recovery: {
        type: 'json-parse',
        originalError: error.message,
        malformedContent,
        instruction: 'Fix JSON syntax and return valid JSON only',
      },
    },
  };
}

/**
 * Timeout error recovery - reduce token count and simplify
 */
function handleTimeoutError(_error: Error, request: AIRequest): AIRequest {
  const currentTokens = request.maxTokens ?? 1000;

  return {
    ...request,
    maxTokens: Math.floor(currentTokens * 0.7), // 30% reduction
    temperature: Math.max(0.1, (request.temperature ?? 0.2) * 0.9), // Slightly lower
    prompt: `${request.prompt}\n\nProvide a concise, focused response.`,
    context: {
      ...request.context,
      recovery: {
        type: 'timeout',
        originalTokens: currentTokens,
        instruction: 'Reduce response length and complexity',
      },
    },
  };
}

/**
 * Rate limit error recovery - return request as-is for retry with backoff
 */
function handleRateLimitError(_error: Error, request: AIRequest): AIRequest {
  return {
    ...request,
    context: {
      ...request.context,
      recovery: {
        type: 'rate-limit',
        instruction: 'Retry with exponential backoff',
        retryAfter: extractRetryAfter(_error.message || 'no message'),
      },
    },
  };
}

/**
 * Token limit error recovery - reduce both prompt and max tokens
 */
function handleTokenLimitError(_error: Error, request: AIRequest): AIRequest {
  const currentTokens = request.maxTokens ?? 1000;

  // Truncate prompt if very long (rough heuristic: 1 token ≈ 4 characters)
  let prompt = request.prompt;
  if (prompt.length > 2000) {
    prompt = `${prompt.substring(0, 2000)}\n\n[Content truncated due to length limits]`;
  }

  return {
    ...request,
    prompt,
    maxTokens: Math.min(currentTokens * 0.6, 1000), // Aggressive reduction
    context: {
      ...request.context,
      recovery: {
        type: 'token-limit',
        originalTokens: currentTokens,
        truncatedPrompt: prompt.length < request.prompt.length,
        instruction: 'Provide essential information only',
      },
    },
  };
}

/**
 * Extract retry delay from rate limit error message
 */
function extractRetryAfter(errorMessage: string): number {
  const match = errorMessage.match(/retry after (\d+)/i);
  return match?.[1] ? parseInt(match[1]) * 1000 : 2000; // Default 2 seconds
}

/**
 * Simple retry with exponential backoff utility
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries - 1) {
        throw lastError;
      }

      // Handle rate limiting with custom delay
      const isRateLimit =
        error instanceof Error && error.message.toLowerCase().includes('rate limit');

      let delay = baseDelay * Math.pow(2, attempt); // Exponential backoff

      if (isRateLimit) {
        delay = Math.max(delay, extractRetryAfter(error.message));
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Enhanced retry with error recovery - replaces executeWithEnhancedRecovery
 */
export async function executeWithRecovery<T>(
  operation: (request: AIRequest) => Promise<T>,
  initialRequest: AIRequest,
  maxAttempts: number = 3,
): Promise<T> {
  let currentRequest = initialRequest;
  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation(currentRequest);
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts - 1) {
        throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
      }

      // Try to recover from the error
      const recovery = recoverFromError(lastError, currentRequest);

      if (!recovery.success) {
        throw new Error(`Recovery failed: ${recovery.error}`);
      }

      currentRequest = recovery.request;

      // Add delay between attempts (with special handling for rate limits)
      const isRateLimit = lastError.message.toLowerCase().includes('rate limit');
      const delay = isRateLimit ? extractRetryAfter(lastError.message) : 1000 * (attempt + 1);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Utility functions for working with recovery results
 */
export function isSuccessResult(
  result: RecoveryResult,
): result is Extract<RecoveryResult, { success: true }> {
  return result.success;
}

export function isErrorResult(
  result: RecoveryResult,
): result is Extract<RecoveryResult, { success: false }> {
  return !result.success;
}

/**
 * Get recovery statistics for monitoring (simplified version)
 */
export interface SimpleRecoveryStats {
  totalAttempts: number;
  successfulRecoveries: number;
  successRate: number;
  strategiesUsed: Record<string, number>;
}

// Global stats tracking (optional)
let globalStats: SimpleRecoveryStats = {
  totalAttempts: 0,
  successfulRecoveries: 0,
  successRate: 0,
  strategiesUsed: {},
};

export function getRecoveryStats(): SimpleRecoveryStats {
  return { ...globalStats };
}

export function resetRecoveryStats(): void {
  globalStats = {
    totalAttempts: 0,
    successfulRecoveries: 0,
    successRate: 0,
    strategiesUsed: {},
  };
}
