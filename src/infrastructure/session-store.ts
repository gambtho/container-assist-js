/**
 * Simple in-memory session storage with automatic cleanup
 */

import type { Logger } from 'pino';
import { Session, SessionSchema } from '../domain/types/session';

export interface SessionStoreOptions {
  cleanupIntervalMs?: number;
  maxSessions?: number;
  defaultTtlMs?: number;
}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private cleanup?: NodeJS.Timeout;
  private readonly logger: Logger;
  private readonly maxSessions: number;
  private readonly defaultTtlMs: number;

  constructor(logger: Logger, options: SessionStoreOptions = {}) {
    this.logger = logger.child({ component: 'SessionStore' });
    this.maxSessions = options.maxSessions ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 4 * 60 * 60 * 1000; // 4 hours

    // Start cleanup timer
    const cleanupInterval = options.cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes
    this.cleanup = setInterval(() => {
      try {
        this.cleanExpired();
      } catch (err) {
        this.logger.warn({ error: err }, 'Session cleanup failed');
      }
    }, cleanupInterval);

    // Don't keep process alive for cleanup
    this.cleanup.unref?.();

    this.logger.info({ maxSessions: this.maxSessions }, 'Session store initialized');
  }

  /**
   * Get a session by ID
   */
  get(id: string): Session | null {
    const session = this.sessions.get(id);

    if (!session) {
      return null;
    }

    // Check expiration
    if (this.isExpired(session)) {
      this.sessions.delete(id);
      this.logger.debug({ sessionId: id }, 'Session expired and removed');
      return null;
    }

    return session;
  }

  /**
   * Create or update a session
   */
  set(id: string, session: Partial<Session>): void {
    // Get existing session to preserve version counter
    const existing = this.sessions.get(id);

    // Validate and complete session data
    const now = new Date().toISOString();
    const fullSession: Session = {
      id,
      created_at: session.created_at ?? existing?.created_at ?? now,
      updated_at: now,
      expires_at: session.expires_at ?? new Date(Date.now() + this.defaultTtlMs).toISOString(),
      status: session.status ?? 'active',
      repo_path: session.repo_path ?? '',
      workflow_state: session.workflow_state ?? {
        completed_steps: [],
        errors: {},
        metadata: {},
        dockerfile_fix_history: [],
      },
      version: (existing?.version ?? 0) + 1,
      ...session,
    };

    // Validate schema
    const validated = SessionSchema.parse(fullSession);

    // Enforce session limit
    if (!this.sessions.has(id) && this.sessions.size >= this.maxSessions) {
      this.evictOldest();
    }

    this.sessions.set(id, validated);
    this.logger.debug({ sessionId: id, version: validated.version }, 'Session stored');
  }

  /**
   * Update an existing session
   */
  update(id: string, updater: (session: Session) => Partial<Session>): Session | null {
    const existing = this.get(id);
    if (!existing) {
      return null;
    }

    const updated = updater(existing);
    this.set(id, { ...existing, ...updated });
    return this.get(id);
  }

  /**
   * Atomic update operation
   */
  updateAtomic(id: string, updater: (session: Session) => Session): void {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Session ${id} not found`);
    }

    const updated = updater(existing);
    this.set(id, updated);
  }

  /**
   * Delete a session
   */
  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.logger.debug({ sessionId: id }, 'Session deleted');
    }
    return deleted;
  }

  /**
   * List sessions with optional filtering
   */
  list(filter?: { status?: Session['status']; limit?: number; createdAfter?: Date }): Session[] {
    let sessions = Array.from(this.sessions.values());

    // Remove expired sessions during listing
    sessions = sessions.filter((session) => !this.isExpired(session));

    // Apply filters
    if (filter?.status) {
      sessions = sessions.filter((s) => s.status === filter.status);
    }

    if (filter?.createdAfter) {
      const createdAfter = filter.createdAfter;
      sessions = sessions.filter((s) => new Date(s.created_at) > createdAfter);
    }

    // Sort by updated_at desc
    sessions.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Apply limit
    if (filter?.limit) {
      sessions = sessions.slice(0, filter.limit);
    }

    return sessions;
  }

  /**
   * Get active session count
   */
  getActiveCount(): number {
    return this.list({ status: 'active' }).length;
  }

  /**
   * Clean up expired sessions
   */
  private cleanExpired(): number {
    let removed = 0;

    try {
      const now = Date.now();

      for (const [id, session] of Array.from(this.sessions)) {
        if (this.isExpired(session, now)) {
          this.sessions.delete(id);
          removed++;
        }
      }

      if (removed > 0) {
        this.logger.debug({ removed }, 'Cleaned expired sessions');
      }
    } catch (err) {
      this.logger.warn({ error: err }, 'Error during session cleanup');
    }

    return removed;
  }

  /**
   * Check if session is expired
   */
  private isExpired(session: Session, now = Date.now()): boolean {
    if (!session.expires_at) return false;
    return new Date(session.expires_at).getTime() < now;
  }

  /**
   * Evict oldest session to make room
   */
  private evictOldest(): void {
    let oldest: [string, Session] | null = null;

    for (const [id, session] of Array.from(this.sessions)) {
      if (!oldest || new Date(session.updated_at) < new Date(oldest[1].updated_at)) {
        oldest = [id, session];
      }
    }

    if (oldest) {
      this.sessions.delete(oldest[0]);
      this.logger.debug({ sessionId: oldest[0] }, 'Evicted oldest session');
    }
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    maxSessions: number;
  } {
    return {
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter((s) => s.status === 'active')
        .length,
      maxSessions: this.maxSessions,
    };
  }

  /**
   * Shutdown and cleanup
   */
  close(): void {
    if (this.cleanup) {
      clearInterval(this.cleanup);
    }
    this.sessions.clear();
    this.logger.info('Session store closed');
  }

  /**
   * Export sessions for backup/migration
   */
  exportSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Import sessions from backup/migration
   */
  importSessions(sessions: Session[]): void {
    for (const session of sessions) {
      if (!this.isExpired(session)) {
        this.sessions.set(session.id, session);
      }
    }
    this.logger.info({ count: sessions.length }, 'Sessions imported');
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.logger.warn('All sessions cleared');
  }
}
