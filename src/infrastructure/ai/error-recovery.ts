/**
 * Simple error recovery system with retry logic
 * Following the simplified approach from the implementation plan
 */

import type { Result } from '../../domain/types/result.js'
import { fail } from '../../domain/types/result.js'

/**
 * Retry options for error recovery
 */
export interface RetryOptions {
  maxAttempts?: number
  delayMs?: number
  backoff?: 'linear' | 'exponential'
}

/**
 * Execute operation with retry logic
 */
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

/**
 * Execute operation with retry and return Result
 * Simple usage in handlers as shown in the plan
 */
export async function executeWithRetry<T>(
  operation: () => Promise<Result<T>>,
  context: string
): Promise<Result<T>> {
  const { maxAttempts = 3, delayMs = 1000, backoff = 'exponential' } = {}
  let lastError: string = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation()
      if (result.success) {
        return result
      }

      lastError = result.error?.message || 'Unknown error'

      if (attempt === maxAttempts) break

      const delay = backoff === 'exponential' ? delayMs * attempt : delayMs
      await new Promise(resolve => setTimeout(resolve, delay))
    } catch (error) {
      lastError = (error as Error).message

      if (attempt === maxAttempts) break

      const delay = backoff === 'exponential' ? delayMs * attempt : delayMs
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return fail(`${context} failed after retries: ${lastError}`)
}

/**
 * Get helpful error suggestions based on error type and context
 */
export function getBuildErrorSuggestions(error: Error | undefined, language?: string): string[] {
  const message = error?.message || ''
  const suggestions: string[] = []

  // File and path errors
  if (message.includes('no such file') || message.includes('file not found')) {
    suggestions.push('- Verify all COPY/ADD paths exist in build context')
    suggestions.push('- Check .dockerignore for excluded files')
    suggestions.push('- Ensure file paths are relative to build context')
  }

  // Network and connectivity errors
  if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    suggestions.push('- Check network connectivity')
    suggestions.push('- Try using different package manager mirrors')
    suggestions.push('- Increase timeout values in build commands')
  }

  // Permission errors
  if (message.includes('permission denied') || message.includes('access denied')) {
    suggestions.push('- Ensure files have correct permissions (chmod)')
    suggestions.push('- Consider using non-root user in Dockerfile')
    suggestions.push('- Check if files are owned by correct user')
  }

  // Dependency and package errors
  if (message.includes('dependency') || message.includes('package') || message.includes('module')) {
    if (language) {
      switch (language.toLowerCase()) {
        case 'javascript':
        case 'nodejs':
        case 'typescript':
          suggestions.push('- Run npm cache clean --force')
          suggestions.push('- Use npm ci instead of npm install')
          suggestions.push('- Check package.json for correct dependencies')
          break
        case 'python':
          suggestions.push('- Update pip: pip install --upgrade pip')
          suggestions.push('- Use requirements.txt for consistent dependencies')
          suggestions.push('- Try using virtual environment')
          break
        case 'java':
          suggestions.push('- Clean Maven/Gradle cache')
          suggestions.push('- Verify repository URLs in pom.xml/build.gradle')
          suggestions.push('- Check Java version compatibility')
          break
        case 'go':
          suggestions.push('- Run go mod tidy to clean dependencies')
          suggestions.push('- Check go.mod for correct module versions')
          suggestions.push('- Verify GOPROXY settings')
          break
      }
    } else {
      suggestions.push('- Clear package manager cache')
      suggestions.push('- Verify dependency versions and repositories')
      suggestions.push('- Check for dependency conflicts')
    }
  }

  // Build tool specific errors
  if (message.includes('maven') || message.includes('mvn')) {
    suggestions.push('- Run mvn dependency:resolve to check dependencies')
    suggestions.push('- Use mvn dependency:go-offline for offline builds')
    suggestions.push('- Check Maven settings.xml configuration')
  }

  if (message.includes('gradle')) {
    suggestions.push('- Run gradle --refresh-dependencies')
    suggestions.push('- Clear Gradle cache: ~/.gradle/caches')
    suggestions.push('- Check build.gradle for syntax errors')
  }

  if (message.includes('npm') || message.includes('yarn')) {
    suggestions.push('- Clear npm cache: npm cache clean --force')
    suggestions.push('- Delete node_modules and package-lock.json')
    suggestions.push('- Use exact versions in package.json')
  }

  if (message.includes('pip')) {
    suggestions.push('- Upgrade pip: pip install --upgrade pip')
    suggestions.push('- Use pip cache purge to clear cache')
    suggestions.push('- Pin dependency versions in requirements.txt')
  }

  // Memory and resource errors
  if (message.includes('memory') || message.includes('out of space') || message.includes('disk')) {
    suggestions.push('- Increase Docker memory limits')
    suggestions.push('- Clean up unused Docker images and containers')
    suggestions.push('- Use multi-stage builds to reduce image size')
    suggestions.push('- Add .dockerignore to exclude unnecessary files')
  }

  // Generic Docker errors
  if (message.includes('docker') || message.includes('container')) {
    suggestions.push('- Verify Docker daemon is running')
    suggestions.push('- Check Docker version compatibility')
    suggestions.push('- Try rebuilding with --no-cache flag')
  }

  // If no specific suggestions, provide generic ones
  if (suggestions.length === 0) {
    suggestions.push('- Review Dockerfile and build context')
    suggestions.push('- Check logs for more detailed error information')
    suggestions.push('- Verify all required files are present')
    suggestions.push('- Try building with verbose logging enabled')
  }

  return suggestions
}

/**
 * Get error recovery suggestions for different operation types
 */
export function getRecoverySuggestions(
  operationType: 'build' | 'push' | 'scan' | 'deploy' | 'general',
  error: Error,
  language?: string
): string[] {
  const suggestions: string[] = []

  switch (operationType) {
    case 'build':
      suggestions.push(...getBuildErrorSuggestions(error, language))
      break

    case 'push':
      if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
        suggestions.push('- Verify registry credentials')
        suggestions.push('- Check if logged in to correct registry')
        suggestions.push('- Ensure push permissions for the repository')
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        suggestions.push('- Check network connectivity to registry')
        suggestions.push('- Try pushing to different registry')
        suggestions.push('- Verify registry URL is correct')
      } else {
        suggestions.push('- Verify image exists locally')
        suggestions.push('- Check image tag format')
        suggestions.push('- Ensure registry is accessible')
      }
      break

    case 'scan':
      if (error.message.includes('trivy') || error.message.includes('scanner')) {
        suggestions.push('- Update vulnerability database')
        suggestions.push('- Verify scanner installation')
        suggestions.push('- Check if image exists and is accessible')
      } else {
        suggestions.push('- Verify image name and tag')
        suggestions.push('- Ensure scanning tool is available')
        suggestions.push('- Check network access for database updates')
      }
      break

    case 'deploy':
      if (error.message.includes('kubernetes') || error.message.includes('k8s')) {
        suggestions.push('- Verify Kubernetes cluster connectivity')
        suggestions.push('- Check kubectl configuration')
        suggestions.push('- Ensure sufficient cluster resources')
        suggestions.push('- Verify namespace exists and is accessible')
      } else {
        suggestions.push('- Check deployment configuration')
        suggestions.push('- Verify all required resources exist')
        suggestions.push('- Ensure proper permissions')
      }
      break

    default:
      suggestions.push('- Review error message for specific details')
      suggestions.push('- Check system resources and connectivity')
      suggestions.push('- Verify all prerequisites are met')
      suggestions.push('- Try the operation again after addressing issues')
      break
  }

  return suggestions
}

/**
 * Enhanced execute with retry that includes operation-specific suggestions
 */
export async function executeWithRecovery<T>(
  operation: () => Promise<Result<T>>,
  context: string,
  operationType: 'build' | 'push' | 'scan' | 'deploy' | 'general' = 'general',
  language?: string
): Promise<Result<T>> {
  try {
    return await withRetry(operation, { maxAttempts: 3 })
  } catch (error) {
    const suggestions = getRecoverySuggestions(operationType, error as Error, language)
    const errorMsg = `${context} failed after retries: ${(error as Error).message}`
    const fullMessage = `${errorMsg}\n\nSuggestions:\n${suggestions.join('\n')}`

    return fail(fullMessage)
  }
}


