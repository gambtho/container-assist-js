/**
 * In-memory session store implementation
 * Suitable for single-process MCP servers
 */

import { Session, SessionSchema } from '../../domain/types/session.js'
import {
  SessionStore,
  SessionFilter,
  SessionNotFoundError,
  SessionAlreadyExistsError
} from '../../domain/types/session-store.js'
import { SessionUtils } from '../../service/session/utils.js'
import type { Logger } from 'pino'

// Cleanup interval constants
const CLEANUP_INTERVAL_MINUTES = 5
const MILLISECONDS_PER_MINUTE = 60 * 1000

// Utility function for deep cloning sessions safely
function deepCloneSession(session: Session): Session {
  // Use structuredClone if available (Node 17+), otherwise fallback to JSON
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(session)
  }
  return JSON.parse(JSON.stringify(session))
}

// Utility function for deep cloning session arrays
function deepCloneSessionArray(sessions: Session[]): Session[] {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(sessions)
  }
  return sessions.map(s => JSON.parse(JSON.stringify(s)))
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>()
  private logger: Logger
  private cleanupInterval?: NodeJS.Timeout

  // Mutex-like lock for atomic operations
  private locks = new Map<string, Promise<void>>()

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'InMemorySessionStore' })
    this.startCleanupTimer()
    this.logger.info('In-memory session store initialized')
  }

  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.deleteExpired().catch(err =>
        this.logger.error({ error: err }, 'Cleanup failed')
      )
    }, CLEANUP_INTERVAL_MINUTES * MILLISECONDS_PER_MINUTE)

    // Also cleanup on unref to not keep process alive
    if (this.cleanupInterval.unref !== undefined) {
      this.cleanupInterval.unref()
    }
  }

  async create(session: Session): Promise<void> {
    const validated = SessionSchema.parse(session)

    if (this.sessions.has(validated.id)) {
      throw new SessionAlreadyExistsError(validated.id)
    }

    this.sessions.set(validated.id, validated)
    this.logger.debug({ sessionId: validated.id }, 'Session created')
  }

  async get(id: string): Promise<Session | null> {
    const session = this.sessions.get(id)

    if (!session) {
      return null
    }

    // Check expiration
    if (SessionUtils.isExpired(session)) {
      this.sessions.delete(id)
      this.logger.debug({ sessionId: id }, 'Session expired and removed')
      return null
    }

    // Return a deep copy to prevent external mutations
    return deepCloneSession(session)
  }

  async update(id: string, session: Session): Promise<void> {
    const validated = SessionSchema.parse(session)

    if (!this.sessions.has(id)) {
      throw new SessionNotFoundError(id)
    }

    // Ensure ID matches
    if (validated.id !== id) {
      throw new Error(`Session ID mismatch: ${id} !== ${validated.id}`)
    }

    this.sessions.set(id, validated)
    this.logger.debug({ sessionId: id, version: validated.version }, 'Session updated')
  }

  async updateAtomic(
    id: string,
    updater: (current: Session) => Session
  ): Promise<void> {
    // Acquire lock for this session
    const currentLock = this.locks.get(id)
    if (currentLock) {
      await currentLock
    }

    let resolver: () => void
    const lockPromise = new Promise<void>(resolve => {
      resolver = resolve
    })
    this.locks.set(id, lockPromise)

    try {
      const current = this.sessions.get(id)

      if (!current) {
        throw new SessionNotFoundError(id)
      }

      if (SessionUtils.isExpired(current)) {
        this.sessions.delete(id)
        throw new Error(`Session ${id} has expired`)
      }

      // Apply update
      const updated = updater(current)

      // Increment version for optimistic locking
      updated.version = (current.version || 0) + 1
      updated.updated_at = new Date().toISOString()

      // Update progress if workflow state changed
      if (updated.workflow_state) {
        const progress = SessionUtils.calculateProgress(updated.workflow_state)
        updated.progress = {
          current_step: progress.current,
          total_steps: progress.total,
          percentage: progress.percentage,
          estimated_completion: undefined,
        }
        updated.stage = SessionUtils.getCurrentStage(updated.workflow_state)
      }

      // Update status based on workflow
      const withStatus = SessionUtils.updateSessionStatus(updated)

      // Validate and store
      const validated = SessionSchema.parse(withStatus)
      this.sessions.set(id, validated)

      this.logger.debug({
        sessionId: id,
        version: validated.version,
        status: validated.status,
        stage: validated.stage
      }, 'Session atomically updated')

    } finally {
      // Release lock
      this.locks.delete(id)
      resolver!()
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.sessions.delete(id)) {
      throw new SessionNotFoundError(id)
    }

    // Clean up any pending locks
    this.locks.delete(id)

    this.logger.debug({ sessionId: id }, 'Session deleted')
  }

  async list(filter?: SessionFilter): Promise<Session[]> {
    let sessions = Array.from(this.sessions.values())

    // Remove expired sessions
    sessions = sessions.filter(s => !SessionUtils.isExpired(s))

    if (filter) {
      if (filter.status) {
        sessions = sessions.filter(s => s.status === filter.status)
      }

      if (filter.createdAfter) {
        sessions = sessions.filter(s =>
          new Date(s.created_at) > filter.createdAfter!
        )
      }

      if (filter.createdBefore) {
        sessions = sessions.filter(s =>
          new Date(s.created_at) < filter.createdBefore!
        )
      }

      if (filter.stage) {
        sessions = sessions.filter(s => s.stage === filter.stage)
      }

      if (filter.labels) {
        sessions = sessions.filter(s => {
          if (!s.labels) return false
          return Object.entries(filter.labels!).every(
            ([key, value]) => s.labels![key] === value
          )
        })
      }

      if (filter.limit) {
        sessions = sessions.slice(0, filter.limit)
      }
    }

    // Sort by updated_at desc
    sessions.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )

    // Return deep copies
    return deepCloneSessionArray(sessions)
  }

  async createBatch(sessions: Session[]): Promise<void> {
    for (const session of sessions) {
      await this.create(session)
    }
    this.logger.info({ count: sessions.length }, 'Batch created sessions')
  }

  async deleteExpired(): Promise<number> {
    let deleted = 0
    const now = Date.now()

    for (const [id, session] of this.sessions) {
      if (session.expires_at && new Date(session.expires_at).getTime() < now) {
        this.sessions.delete(id)
        this.locks.delete(id)
        deleted++
      }
    }

    if (deleted > 0) {
      this.logger.info({ count: deleted }, 'Deleted expired sessions')
    }

    return deleted
  }

  async getActiveCount(): Promise<number> {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'active' && !SessionUtils.isExpired(s))
      .length
  }

  async getByStatus(status: Session['status']): Promise<Session[]> {
    return this.list({ status })
  }

  async getRecentlyUpdated(limit: number): Promise<Session[]> {
    const sessions = await this.list()
    return sessions.slice(0, limit)
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.sessions.clear()
    this.locks.clear()
    this.logger.info('In-memory session store closed')
  }

  async vacuum(): Promise<void> {
    // Remove expired sessions
    const deleted = await this.deleteExpired()
    this.logger.debug({ deleted }, 'Store vacuumed')
  }

  // Additional methods for debugging/testing
  getSize(): number {
    return this.sessions.size
  }

  getAllSessions(): Map<string, Session> {
    // Return a copy for safety
    return new Map(this.sessions)
  }

  clearAll(): void {
    this.sessions.clear()
    this.locks.clear()
    this.logger.warn('All sessions cleared')
  }

  // Export/import for persistence between restarts
  exportSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  async importSessions(sessions: Session[]): Promise<void> {
    for (const session of sessions) {
      // Skip expired sessions
      if (!SessionUtils.isExpired(session)) {
        const validated = SessionSchema.parse(session)
        this.sessions.set(validated.id, validated)
      }
    }
    this.logger.info({ count: sessions.length }, 'Sessions imported')
  }
}
