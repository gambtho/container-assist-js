// Interface adapters to bridge Team Alpha/Beta implementations with Team Epsilon interfaces

import type { Logger } from 'pino'
import type { McpResourceManager } from '../../mcp/resources/manager.js'
import type { McpProgressNotifier } from '../../mcp/events/emitter.js'
import type { ResourceManager, ProgressNotifier } from './types.js'
import { Result, Success, Failure } from '../../types/core.js'

// Adapter for Team Alpha ResourceManager
export class ResourceManagerAdapter implements ResourceManager {
  constructor(
    private mcpResourceManager: McpResourceManager,
    private logger: Logger
  ) {}

  async publish(uri: string, content: unknown, ttl?: number): Promise<string> {
    const result = await this.mcpResourceManager.publish(uri, content, ttl)
    if (!result.ok) {
      throw new Error(result.error)
    }
    return result.value
  }

  async read(uri: string): Promise<unknown> {
    const result = await this.mcpResourceManager.read(uri)
    if (!result.ok) {
      throw new Error(result.error)
    }
    if (!result.value) {
      throw new Error(`Resource not found: ${uri}`)
    }
    return result.value.content
  }

  async invalidate(pattern: string): Promise<void> {
    const result = await this.mcpResourceManager.invalidate(pattern)
    if (!result.ok) {
      throw new Error(result.error)
    }
  }

  async cleanup(olderThan: Date): Promise<void> {
    // Team Alpha's cleanup doesn't take a date parameter, it cleans up expired resources
    const result = await this.mcpResourceManager.cleanup()
    if (!result.ok) {
      throw new Error(result.error)
    }
    this.logger.debug({ olderThan }, 'Cleanup completed (Team Alpha implementation ignores olderThan parameter)')
  }
}

// Adapter for Team Alpha ProgressNotifier  
export class ProgressNotifierAdapter implements ProgressNotifier {
  constructor(
    private mcpProgressNotifier: McpProgressNotifier,
    private logger: Logger
  ) {}

  notifyProgress(progress: { token: string; value: number; message?: string }): void {
    try {
      this.mcpProgressNotifier.notifyProgress(progress)
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : String(error),
        progress
      }, 'Failed to notify progress')
    }
  }

  notifyComplete(token: string): void {
    try {
      this.mcpProgressNotifier.notifyComplete(token)
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : String(error),
        token
      }, 'Failed to notify completion')
    }
  }

  notifyError(token: string, error: string): void {
    try {
      this.mcpProgressNotifier.notifyError(token, error)
    } catch (err) {
      this.logger.error({
        error: err instanceof Error ? err.message : String(err),
        token,
        originalError: error
      }, 'Failed to notify error')
    }
  }
}