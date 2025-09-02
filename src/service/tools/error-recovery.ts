/**
 * Error Recovery Service
 * Provides retry logic and error suggestions
 */

import { z } from 'zod'
import { Result, ok, fail } from '../../domain/types/result.js'

export interface RetryOptions {
  maxAttempts?: number
  delayMs?: number
  backoff?: 'linear' | 'exponential'
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = 'exponential' } = options
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt === maxAttempts) break

      const delay = backoff === 'exponential' ? delayMs * attempt : delayMs
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

export async function executeWithRetry<T>(
  operation: () => Promise<Result<T>>,
  context: string,
  options: RetryOptions = {}
): Promise<Result<T>> {
  try {
    return await withRetry(operation, options)
  } catch (error) {
    return fail(`${context} failed after retries: ${(error as Error).message}`)
  }
}

export interface ErrorSuggestions {
  suggestions: string[]
  action: 'retry' | 'fix' | 'skip' | 'abort'
}

export function getBuildErrorSuggestions(error?: Error): ErrorSuggestions {
  const message = error?.message?.toLowerCase() || ''
  const suggestions: string[] = []

  if (message.includes('no such file') || message.includes('not found')) {
    suggestions.push('- Verify all COPY/ADD paths exist in build context')
    suggestions.push('- Check .dockerignore for excluded files')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('network') || message.includes('timeout')) {
    suggestions.push('- Check network connectivity')
    suggestions.push('- Try using different package manager mirrors')
    return { suggestions, action: 'retry' }
  }

  if (message.includes('permission denied')) {
    suggestions.push('- Ensure files have correct permissions')
    suggestions.push('- Consider using non-root user in Dockerfile')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('space') || message.includes('disk')) {
    suggestions.push('- Free up disk space')
    suggestions.push('- Clean up Docker images and containers')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('dependency') || message.includes('package')) {
    suggestions.push('- Check package names and versions')
    suggestions.push('- Verify repository availability')
    return { suggestions, action: 'retry' }
  }

  return {
    suggestions: ['- Review Dockerfile and build context', '- Check build logs for specific errors'],
    action: 'retry'
  }
}

export function getDeploymentErrorSuggestions(error?: Error): ErrorSuggestions {
  const message = error?.message?.toLowerCase() || ''
  const suggestions: string[] = []

  if (message.includes('imagepullbackoff') || message.includes('pull access denied')) {
    suggestions.push('- Verify image name and tag')
    suggestions.push('- Check registry credentials')
    suggestions.push('- Ensure image exists in registry')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('crashloopbackoff')) {
    suggestions.push('- Check application logs')
    suggestions.push('- Review resource limits')
    suggestions.push('- Verify health check configuration')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('insufficient') || message.includes('resource')) {
    suggestions.push('- Check cluster resources')
    suggestions.push('- Adjust resource requests/limits')
    suggestions.push('- Scale cluster if needed')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('port') || message.includes('bind')) {
    suggestions.push('- Check for port conflicts')
    suggestions.push('- Verify service configuration')
    suggestions.push('- Review ingress settings')
    return { suggestions, action: 'fix' }
  }

  return {
    suggestions: ['- Check deployment status', '- Review pod logs', '- Verify cluster connectivity'],
    action: 'retry'
  }
}

export function getScanErrorSuggestions(error?: Error): ErrorSuggestions {
  const message = error?.message?.toLowerCase() || ''
  const suggestions: string[] = []

  if (message.includes('vulnerabilities') || message.includes('cve')) {
    suggestions.push('- Review vulnerability report')
    suggestions.push('- Update base image to latest version')
    suggestions.push('- Consider using distroless images')
    return { suggestions, action: 'fix' }
  }

  if (message.includes('scanner') || message.includes('trivy')) {
    suggestions.push('- Check scanner installation')
    suggestions.push('- Verify image accessibility')
    suggestions.push('- Try different scanner options')
    return { suggestions, action: 'retry' }
  }

  return {
    suggestions: ['- Check image format', '- Verify scanner configuration'],
    action: 'retry'
  }
}

export function getGenericErrorSuggestions(error?: Error, context?: string): ErrorSuggestions {
  const message = error?.message?.toLowerCase() || ''
  const suggestions: string[] = []

  if (message.includes('timeout')) {
    suggestions.push('- Increase timeout values')
    suggestions.push('- Check network connectivity')
    return { suggestions, action: 'retry' }
  }

  if (message.includes('authentication') || message.includes('unauthorized')) {
    suggestions.push('- Check credentials and permissions')
    suggestions.push('- Verify API access')
    return { suggestions, action: 'fix' }
  }

  if (context) {
    suggestions.push(`- Review ${context} configuration`)
    suggestions.push(`- Check ${context} logs for details`)
  } else {
    suggestions.push('- Review operation parameters')
    suggestions.push('- Check system logs')
  }

  return { suggestions, action: 'retry' }
}

