/**
 * Progress Emitter
 * Provides real-time progress tracking with event streaming and history
 */

import { EventEmitter } from 'events'
import type { Logger } from '../../domain/types/index.js'
import type {
  ProgressEmitter as IProgressEmitter,
  ProgressUpdate,
  ProgressListener,
  ProgressFilter
} from '../../../domain/types/index.js'

export class ProgressEmitter implements IProgressEmitter {
  private eventEmitter = new EventEmitter()
  private progressListeners = new Set<ProgressListener>()
  private history = new Map<string, ProgressUpdate[]>()
  private maxHistoryPerSession = 1000
  private cleanupInterval?: NodeJS.Timeout
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ProgressEmitter' })

    this.startHistoryCleanup()

    this.logger.info('Progress emitter initialized')
  }

  /**
   * Emit a progress update
   */
  async emit(update: Partial<ProgressUpdate>): Promise<void> {
    // Validate and complete the update
    if (!update.sessionId || !update.step || !update.status) {
      throw new Error('Progress update must have sessionId, step, and status')
    }

    const fullUpdate: ProgressUpdate = {
      sessionId: update.sessionId,
      step: update.step,
      status: update.status,
      progress: update.progress ?? 0,
      timestamp: update.timestamp || new Date().toISOString()
    }

    // Add optional properties only if they have values
    if (update.message !== undefined) {
      fullUpdate.message = update.message
    }
    if (update.metadata !== undefined) {
      fullUpdate.metadata = update.metadata
    }

    // Store in history
    this.addToHistory(fullUpdate)

    // Emit to EventEmitter listeners (for internal use)
    this.eventEmitter.emit('progress', fullUpdate)
    this.eventEmitter.emit(`progress:${fullUpdate.sessionId}`, fullUpdate)
    this.eventEmitter.emit(`step:${fullUpdate.step}`, fullUpdate)

    // Notify registered listeners
    const promises = Array.from(this.progressListeners).map(listener =>
      Promise.resolve(listener.onProgress(fullUpdate)).catch(error => {
        this.logger.error({ error, listener: listener.constructor.name }, 'Progress listener error')
      })
    )

    await Promise.all(promises)

    // Log progress (debug level to avoid spam)
    this.logger.debug({
      sessionId: fullUpdate.sessionId,
      step: fullUpdate.step,
      status: fullUpdate.status,
      progress: Math.round(fullUpdate.progress * 100)
    }, 'Progress update emitted')
  }

  /**
   * Add a progress listener
   */
  addListener(listener: ProgressListener): void {
    this.progressListeners.add(listener)
    this.logger.debug({ listenerCount: this.progressListeners.size }, 'Progress listener added')
  }

  /**
   * Remove a progress listener
   */
  removeListener(listener: ProgressListener): void {
    this.progressListeners.delete(listener)
    this.logger.debug({ listenerCount: this.progressListeners.size }, 'Progress listener removed')
  }

  /**
   * Get progress history for a session
   */
  getHistory(sessionId: string, filter?: ProgressFilter): ProgressUpdate[] {
    let updates = this.history.get(sessionId) || []

    // Apply filters
    if (filter?.step) {
      updates = updates.filter(u => u.step === filter.step)
    }

    if (filter?.status) {
      updates = updates.filter(u => u.status === filter.status)
    }

    if (filter?.since) {
      const sinceTime = filter.since.getTime()
      updates = updates.filter(u => new Date(u.timestamp).getTime() >= sinceTime)
    }

    if (filter?.limit && filter.limit > 0) {
      updates = updates.slice(-filter.limit); // Get most recent
    }

    return updates
  }

  /**
   * Get progress history across multiple sessions
   */
  getAllHistory(filter?: ProgressFilter): ProgressUpdate[] {
    let allUpdates: ProgressUpdate[] = []

    // Collect updates from all sessions
    for (const [sessionId, updates] of this.history) {
      if (filter?.sessionId && sessionId !== filter.sessionId) {
        continue
      }
      allUpdates.push(...updates)
    }

    // Sort by timestamp
    allUpdates.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Apply filters
    if (filter?.step) {
      allUpdates = allUpdates.filter(u => u.step === filter.step)
    }

    if (filter?.status) {
      allUpdates = allUpdates.filter(u => u.status === filter.status)
    }

    if (filter?.since) {
      const sinceTime = filter.since.getTime()
      allUpdates = allUpdates.filter(u => new Date(u.timestamp).getTime() >= sinceTime)
    }

    if (filter?.limit && filter.limit > 0) {
      allUpdates = allUpdates.slice(-filter.limit)
    }

    return allUpdates
  }

  /**
   * Get current progress summary for a session
   */
  getCurrentProgress(sessionId: string): {
    currentStep?: string
    progress: number
    completedSteps: string[]
    failedSteps: string[]
  } {
    const updates = this.history.get(sessionId) || []

    if (updates.length === 0) {
      return {
        progress: 0,
        completedSteps: [],
        failedSteps: []
      }
    }

    // Get the latest update (safe since we checked updates.length > 0)
    const latest = updates[updates.length - 1]!

    // Collect completed and failed steps
    const completedSteps = new Set<string>()
    const failedSteps = new Set<string>()

    for (const update of updates) {
      if (update.status === 'completed') {
        completedSteps.add(update.step)
        failedSteps.delete(update.step); // Remove if previously failed
      } else if (update.status === 'failed') {
        failedSteps.add(update.step)
      }
    }

    const result: {
      currentStep?: string
      progress: number
      completedSteps: string[]
      failedSteps: string[]
    } = {
      progress: latest.progress,
      completedSteps: Array.from(completedSteps),
      failedSteps: Array.from(failedSteps)
    }

    // Only add currentStep if it has a value
    if (latest.status === 'starting' || latest.status === 'in_progress') {
      result.currentStep = latest.step
    }

    return result
  }

  /**
   * Clear history for a session
   */
  clearHistory(sessionId: string): void {
    this.history.delete(sessionId)
    this.logger.debug({ sessionId }, 'Progress history cleared for session')
  }

  /**
   * Clear all history
   */
  clearAllHistory(): void {
    this.history.clear()
    this.logger.info('All progress history cleared')
  }

  /**
   * Create an async iterator for real-time progress updates
   */
  createProgressStream(sessionId: string, includeHistory: boolean = true): AsyncIterable<ProgressUpdate> {
    const emitter = this

    return {
      async *[Symbol.asyncIterator]() {
        const updates: ProgressUpdate[] = []
        let isStreamActive = true

        // Event listener for new updates
        const listener = (update: ProgressUpdate) => {
          if (update.sessionId === sessionId && isStreamActive) {
            updates.push(update)
          }
        }

        // Register listener
        emitter.eventEmitter.on(`progress:${sessionId}`, listener)

        try {
          // Yield existing history first if requested
          if (includeHistory) {
            const history = emitter.getHistory(sessionId)
            for (const update of history) {
              yield update
            }
          }

          // Yield new updates as they come
          while (isStreamActive) {
            // Wait for new updates or timeout
            if (updates.length > 0) {
              const update = updates.shift()!
              yield update

              // Stop if workflow is completed or failed
              if (update.step === 'workflow' &&
                  (update.status === 'completed' || update.status === 'failed')) {
                break
              }
            } else {
              // Wait a bit for new updates
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        } finally {
          isStreamActive = false
          emitter.eventEmitter.off(`progress:${sessionId}`, listener)
        }
      }
    }
  }

  /**
   * Get active sessions (sessions with recent progress updates)
   */
  getActiveSessions(withinMinutes: number = 30): string[] {
    const cutoffTime = Date.now() - (withinMinutes * 60 * 1000)
    const activeSessions: string[] = []

    for (const [sessionId, updates] of this.history) {
      if (updates.length > 0) {
        const latestUpdate = updates[updates.length - 1]!; // Safe since we checked length > 0
        if (new Date(latestUpdate.timestamp).getTime() > cutoffTime) {
          activeSessions.push(sessionId)
        }
      }
    }

    return activeSessions
  }

  /**
   * Get progress statistics
   */
  getStatistics(): {
    totalSessions: number
    activeSessions: number
    totalUpdates: number
    averageUpdatesPerSession: number
    listenerCount: number
  } {
    let totalUpdates = 0
    for (const updates of this.history.values()) {
      totalUpdates += updates.length
    }

    const totalSessions = this.history.size
    const activeSessions = this.getActiveSessions().length

    return {
      totalSessions,
      activeSessions,
      totalUpdates,
      averageUpdatesPerSession: totalSessions > 0 ? Math.round(totalUpdates / totalSessions) : 0,
      listenerCount: this.progressListeners.size
    }
  }

  /**
   * Add update to history with size limits
   */
  private addToHistory(update: ProgressUpdate): void {
    const sessionHistory = this.history.get(update.sessionId) || []
    sessionHistory.push(update)

    // Enforce size limit
    if (sessionHistory.length > this.maxHistoryPerSession) {
      sessionHistory.shift(); // Remove oldest
    }

    this.history.set(update.sessionId, sessionHistory)
  }

  /**
   * Start periodic cleanup of old history
   */
  private startHistoryCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldHistory()
    }, 5 * 60 * 1000); // Every 5 minutes

    // Don't keep process alive just for cleanup
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Clean up old progress history to prevent memory leaks
   */
  private cleanupOldHistory(): void {
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = Date.now() - maxAgeMs
    let cleanedSessions = 0

    for (const [sessionId, updates] of this.history) {
      if (updates.length === 0) {
        this.history.delete(sessionId)
        cleanedSessions++
        continue
      }

      // Check if all updates are old
      const latestUpdate = updates[updates.length - 1]!; // Safe since we checked length > 0
      if (new Date(latestUpdate.timestamp).getTime() < cutoffTime) {
        this.history.delete(sessionId)
        cleanedSessions++
      } else {
        // Remove old updates from this session
        const filteredUpdates = updates.filter(
          update => new Date(update.timestamp).getTime() >= cutoffTime
        )

        if (filteredUpdates.length < updates.length) {
          this.history.set(sessionId, filteredUpdates)
        }
      }
    }

    if (cleanedSessions > 0) {
      this.logger.debug({ cleanedSessions }, 'Old progress history cleaned')
    }
  }

  /**
   * Shutdown the progress emitter
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.progressListeners.clear()
    this.eventEmitter.removeAllListeners()

    this.logger.info('Progress emitter shut down')
  }
}


