/**
 * Error Recovery Service
 * Provides retry and error recovery functionality for tools
 */

import { retry as retryAsync, type RetryOptions as AsyncRetryOptions } from '../../shared/async.js';
import { normalizeError } from '../../errors/index.js';

// Re-export and alias types
export type RetryOptions = AsyncRetryOptions;

export interface ErrorSuggestions {
  suggestions: string[];
  recovery?: string;
}

/**
 * Retry with Result type handling
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  return retryAsync(fn, options);
}

/**
 * Execute with retry, throwing errors
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return retryAsync(fn, options);
}

/**
 * Execute with error recovery
 */
export async function executeWithRecovery<T>(
  fn: () => Promise<T>,
  recoveryFn?: (error: unknown) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  try {
    return await executeWithRetry(fn, options);
  } catch (error) {
    if (recoveryFn) {
      return recoveryFn(error);
    }
    throw normalizeError(error, 'Operation failed after retries');
  }
}

/**
 * Get build error suggestions
 */
export function getBuildErrorSuggestions(error: string): ErrorSuggestions {
  const suggestions: string[] = [];

  if (error.includes('dockerfile')) {
    suggestions.push('Check Dockerfile syntax');
    suggestions.push('Ensure all base images are accessible');
  }
  if (error.includes('permission')) {
    suggestions.push('Check Docker daemon permissions');
    suggestions.push('Ensure Docker socket is accessible');
  }
  if (error.includes('space')) {
    suggestions.push('Check available disk space');
    suggestions.push('Clean up unused Docker images');
  }

  return {
    suggestions,
    recovery: suggestions.length > 0 ? 'Try the suggestions above' : 'Check Docker logs for details'
  };
}

/**
 * Get deployment error suggestions
 */
export function getDeploymentErrorSuggestions(error: string): ErrorSuggestions {
  const suggestions: string[] = [];

  if (error.includes('kubernetes') || error.includes('k8s')) {
    suggestions.push('Check Kubernetes cluster connectivity');
    suggestions.push('Verify kubeconfig is valid');
  }
  if (error.includes('namespace')) {
    suggestions.push('Ensure namespace exists');
    suggestions.push('Check namespace permissions');
  }
  if (error.includes('resource')) {
    suggestions.push('Check resource quotas');
    suggestions.push('Verify manifest syntax');
  }

  return {
    suggestions,
    recovery: suggestions.length > 0 ? 'Try the suggestions above' : 'Check deployment logs'
  };
}

/**
 * Get scan error suggestions
 */
export function getScanErrorSuggestions(error: string): ErrorSuggestions {
  const suggestions: string[] = [];

  if (error.includes('trivy')) {
    suggestions.push('Ensure Trivy is installed');
    suggestions.push('Update Trivy vulnerability database');
  }
  if (error.includes('timeout')) {
    suggestions.push('Increase scan timeout');
    suggestions.push('Try scanning with reduced scope');
  }
  if (error.includes('image')) {
    suggestions.push('Verify image exists locally');
    suggestions.push('Pull image if necessary');
  }

  return {
    suggestions,
    recovery: suggestions.length > 0 ? 'Try the suggestions above' : 'Check scanner logs'
  };
}

/**
 * Get generic error suggestions
 */
export function getGenericErrorSuggestions(error: string): ErrorSuggestions {
  const suggestions: string[] = [];

  if (error.includes('network')) {
    suggestions.push('Check network connectivity');
    suggestions.push('Verify proxy settings if applicable');
  }
  if (error.includes('auth')) {
    suggestions.push('Check authentication credentials');
    suggestions.push('Verify registry access');
  }
  if (error.includes('timeout')) {
    suggestions.push('Increase timeout values');
    suggestions.push('Check system resources');
  }

  return {
    suggestions: suggestions.length > 0 ? suggestions : ['Check logs for more details'],
    recovery: 'Review error message and try again'
  };
}
