/**
 * Unified Session Manager - Single Source of Truth
 *
 * Consolidates functionality from:
 * - src/services/session.ts (main service)
 * - src/infrastructure/session-store.ts (storage layer)
 * - src/application/resources/session-resource.ts (MCP resource)
 *
 * Provides a simplified, clean interface for all session operations
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import {
  SessionSchema,
  type Session,
  type SessionManager,
  type SessionFilter,
} from '../types/session';

export interface SessionConfig {
  ttl?: number; // Session TTL in seconds (default: 24 hours)
  maxSessions?: number; // Max concurrent sessions (default: 1000)
  cleanupIntervalMs?: number; // Cleanup interval in ms (default: 5 minutes)
}

const DEFAULT_TTL = 86400; // 24 hours in seconds
const DEFAULT_MAX_SESSIONS = 1000;
const DEFAULT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Unified session manager implementation
 * Provides all session functionality in a single, clean interface
 */
export class UnifiedSessionManager implements SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupTimer: NodeJS.Timeout | undefined = undefined;
  private readonly logger: Logger;
  private readonly ttl: number;
  private readonly maxSessions: number;

  constructor(logger: Logger, config: SessionConfig = {}) {
    this.logger = logger.child({ service: 'session-manager' });
    this.ttl = config.ttl ?? DEFAULT_TTL;
    this.maxSessions = config.maxSessions ?? DEFAULT_MAX_SESSIONS;

    // Start automatic cleanup
    const cleanupInterval = config.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL;
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpiredSessions();
      } catch (err) {
        this.logger.warn({ error: err }, 'Session cleanup failed');
      }
    }, cleanupInterval);

    // Don't keep process alive for cleanup
    this.cleanupTimer.unref?.();

    this.logger.info(
      {
        maxSessions: this.maxSessions,
        ttlSeconds: this.ttl,
      },
      'Session manager initialized',
    );
  }

  /**
   * Create a new session
   */
  async create(data: Partial<Session> = {}): Promise<Session> {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      this.cleanupExpiredSessions();
      if (this.sessions.size >= this.maxSessions) {
        throw new Error(`Maximum sessions (${this.maxSessions}) reached`);
      }
    }

    const id = data.id ?? randomUUID();
    const now = new Date().toISOString();
    const expiresAt = data.expires_at ?? new Date(Date.now() + this.ttl * 1000).toISOString();

    const session: Session = {
      id,
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
      status: data.status ?? 'active',
      repo_path: data.repo_path ?? '',
      stage: data.stage,
      labels: data.labels,
      metadata: data.metadata,
      workflow_state: data.workflow_state ?? {
        completed_steps: [],
        errors: {},
        metadata: {},
      },
      version: 0,
      config: data.config,
      progress: data.progress,
      ...data,
    };

    // Validate session structure
    const validatedSession = SessionSchema.parse(session);

    this.sessions.set(id, validatedSession);
    this.logger.debug({ sessionId: id }, 'Session created');

    return validatedSession;
  }

  /**
   * Get a session by ID
   */
  async get(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      this.sessions.delete(id);
      this.logger.debug({ sessionId: id }, 'Expired session removed');
      return null;
    }

    return session;
  }

  /**
   * Update a session
   */
  async update(id: string, data: Partial<Session>): Promise<void> {
    const session = await this.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    const updatedSession: Session = {
      ...session,
      ...data,
      updated_at: new Date().toISOString(),
      version: session.version + 1,
    };

    // Validate updated session
    const validatedSession = SessionSchema.parse(updatedSession);

    this.sessions.set(id, validatedSession);
    this.logger.debug({ sessionId: id }, 'Session updated');
  }

  /**
   * Atomic update of a session using a function
   */
  async updateAtomic(id: string, updater: (session: Session) => Session): Promise<void> {
    const session = await this.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    try {
      const updatedSession = updater({ ...session });
      updatedSession.updated_at = new Date().toISOString();
      updatedSession.version = session.version + 1;

      // Validate updated session
      const validatedSession = SessionSchema.parse(updatedSession);

      this.sessions.set(id, validatedSession);
      this.logger.debug({ sessionId: id }, 'Session updated atomically');
    } catch (err) {
      this.logger.error({ sessionId: id, error: err }, 'Atomic session update failed');
      throw err;
    }
  }

  /**
   * Delete a session
   */
  async delete(id: string): Promise<void> {
    const existed = this.sessions.delete(id);
    if (existed) {
      this.logger.debug({ sessionId: id }, 'Session deleted');
    }
  }

  /**
   * List sessions with optional filtering
   */
  async list(filter?: SessionFilter): Promise<Session[]> {
    let sessions = Array.from(this.sessions.values());

    if (filter) {
      sessions = sessions.filter((session) => {
        // Filter by status
        if (filter.status && session.status !== filter.status) {
          return false;
        }

        // Filter by repo_path
        if (filter.repo_path && session.repo_path !== filter.repo_path) {
          return false;
        }

        // Filter by labels
        if (filter.labels) {
          for (const [key, value] of Object.entries(filter.labels)) {
            if (!session.labels || session.labels[key] !== value) {
              return false;
            }
          }
        }

        // Filter by creation date range
        if (filter.created_after && new Date(session.created_at) < filter.created_after) {
          return false;
        }
        if (filter.created_before && new Date(session.created_at) > filter.created_before) {
          return false;
        }

        return true;
      });
    }

    // Sort by creation date (newest first)
    sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return sessions;
  }

  /**
   * Get active sessions (convenience method for MCP resource)
   */
  async getActiveSessions(limit = 50): Promise<Session[]> {
    const sessions = await this.list({ status: 'active' });
    return sessions.slice(0, limit);
  }

  /**
   * Cleanup expired sessions and enforce session limits
   */
  async cleanup(): Promise<void> {
    this.cleanupExpiredSessions();
    this.logger.debug({ activeCount: this.sessions.size }, 'Session cleanup completed');
  }

  /**
   * Get session statistics
   */
  getStats(): { total: number; statusCounts: Record<string, number>; maxSessions: number } {
    const sessions = Array.from(this.sessions.values());
    const statusCounts = sessions.reduce(
      (acc, session) => {
        acc[session.status] = (acc[session.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total: sessions.length,
      statusCounts,
      maxSessions: this.maxSessions,
    };
  }

  /**
   * Close the session manager and stop cleanup
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.logger.info('Session manager closed');
  }

  /**
   * Private method to cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (session.expires_at && new Date(session.expires_at) < now) {
        this.sessions.delete(id);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.logger.debug({ expiredCount }, 'Expired sessions cleaned up');
    }
  }
}

/**
 * Factory function to create a session manager instance
 * This is the primary export that tools should use
 */
export function createSessionManager(logger: Logger, config?: SessionConfig): SessionManager {
  return new UnifiedSessionManager(logger, config);
}

/**
 * Default session manager instance (singleton pattern)
 * Can be used when a single session manager is sufficient
 */
let defaultManager: SessionManager | null = null;

export function getSessionManager(logger: Logger, config?: SessionConfig): SessionManager {
  if (!defaultManager) {
    defaultManager = createSessionManager(logger, config);
  }
  return defaultManager;
}
