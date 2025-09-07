/**
 * Session Manager Implementation
 *
 * Simplified session management functionality providing:
 * - Session lifecycle management
 * - Simple WorkflowState storage
 * - Thread-safe operations
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { WorkflowState } from '../types/session.js';

interface SessionConfig {
  ttl?: number; // Session TTL in seconds (default: 24 hours)
  maxSessions?: number; // Max concurrent sessions (default: 1000)
  cleanupIntervalMs?: number; // Cleanup interval in ms (default: 5 minutes)
}

const DEFAULT_TTL = 86400; // 24 hours in seconds
const DEFAULT_MAX_SESSIONS = 1000;
const DEFAULT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Internal session storage with timestamps
interface InternalSession {
  id: string;
  workflowState: WorkflowState;
  created_at: Date;
  updated_at: Date;
}

/**
 * Simple session manager implementation
 */
export class SessionManager {
  private sessions = new Map<string, InternalSession>();
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
  async create(sessionId?: string): Promise<WorkflowState> {
    // Check session limit
    if (this.sessions.size >= this.maxSessions) {
      this.cleanupExpiredSessions();
      if (this.sessions.size >= this.maxSessions) {
        throw new Error(`Maximum sessions (${this.maxSessions}) reached`);
      }
    }

    const id = sessionId ?? randomUUID();
    const now = new Date();

    const workflowState: WorkflowState = {
      metadata: {},
      completed_steps: [],
      errors: {},
      current_step: null,
    };

    const session: InternalSession = {
      id,
      workflowState,
      created_at: now,
      updated_at: now,
    };

    this.sessions.set(id, session);
    this.logger.debug({ sessionId: id }, 'Session created');

    return workflowState;
  }

  /**
   * Get a session by ID
   */
  async get(sessionId: string): Promise<WorkflowState | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() - session.created_at.getTime() > this.ttl * 1000) {
      this.sessions.delete(sessionId);
      this.logger.debug({ sessionId }, 'Expired session removed');
      return null;
    }

    return session.workflowState;
  }

  /**
   * Update a session
   */
  async update(sessionId: string, state: Partial<WorkflowState>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update workflow state
    const updatedWorkflowState: WorkflowState = {
      ...session.workflowState,
      ...state,
      metadata: { ...session.workflowState.metadata, ...state.metadata },
      completed_steps: state.completed_steps ?? session.workflowState.completed_steps,
      errors: { ...session.workflowState.errors, ...state.errors },
    };

    const updatedSession: InternalSession = {
      ...session,
      workflowState: updatedWorkflowState,
      updated_at: new Date(),
    };

    this.sessions.set(sessionId, updatedSession);
    this.logger.debug({ sessionId }, 'Session updated');
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.logger.debug({ sessionId }, 'Session deleted');
    }
  }

  /**
   * List all session IDs
   */
  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  /**
   * Cleanup old sessions
   */
  async cleanup(olderThan: Date): Promise<void> {
    let cleanedCount = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.created_at < olderThan) {
        this.sessions.delete(id);
        cleanedCount++;
      }
    }
    this.logger.debug({ cleanedCount }, 'Session cleanup completed');
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
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.created_at.getTime() > this.ttl * 1000) {
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
  return new SessionManager(logger, config);
}
