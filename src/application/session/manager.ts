/**
 * Session service for managing workflow sessions
 * Provides high-level operations on top of the session store
 */

import { Session, WorkflowState, ServiceError, ErrorCode } from '../../contracts/types/index';
import type { Logger } from 'pino';
import { SessionStore, SessionFilter } from '../../contracts/types/session-store';
import { SessionUtils } from './utils';
import { EventEmitter } from 'events';
import path from 'path';

// Time constants (in seconds)
const DEFAULT_SESSION_TTL = 86400; // 24 hours
const DEFAULT_MAX_SESSIONS = 1000;
const DEFAULT_PERSISTENCE_INTERVAL = 60; // 1 minute
const COMPLETED_SESSION_RETENTION = 7 * 24 * 60 * 60; // 7 days
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Validates and normalizes session service configuration
 * @param config - Raw configuration input
 * @returns Validated configuration with defaults applied
 */
function validateSessionConfig(config?: SessionServiceConfig): Required<SessionServiceConfig> {
  const validated = {
    defaultTTL: config?.defaultTTL ?? DEFAULT_SESSION_TTL,
    maxActiveSessions: config?.maxActiveSessions ?? DEFAULT_MAX_SESSIONS,
    persistencePath: config?.persistencePath ?? '',
    persistenceInterval: config?.persistenceInterval ?? DEFAULT_PERSISTENCE_INTERVAL
  };

  // Validate ranges
  if (validated.defaultTTL <= 0) {
    throw new Error('defaultTTL must be positive');
  }
  if (validated.maxActiveSessions <= 0) {
    throw new Error('maxActiveSessions must be positive');
  }
  if (validated.persistenceInterval <= 0) {
    throw new Error('persistenceInterval must be positive');
  }

  return validated;
}

export interface SessionServiceConfig {
  defaultTTL?: number; // Default session TTL in seconds
  maxActiveSessions?: number; // Maximum active sessions
  persistencePath?: string; // Optional path for JSON backup
  persistenceInterval?: number; // How often to save (seconds)
}

export interface SessionServiceEvents {
  'session:created': (session: Session) => void;
  'session:updated': (session: Session) => void;
  'session:deleted': (sessionId: string) => void;
  'session:expired': (sessionId: string) => void;
  'workflow:updated': (data: { session: Session; update?: Partial<WorkflowState> }) => void;
  cleanup: (data: { deletedCount: number }) => void;
}

/**
 * Session service for managing workflow sessions with persistence and event handling
 *
 * @example
 * ```typescript`
 * const sessionService = new SessionService(store, logger, {
 *   defaultTTL: 3600,  // 1 hour
 *   maxActiveSessions: 100
 * })
 *
 * const session = await sessionService.createSession('/path/to/project')
 * ````
 */
export class SessionService extends EventEmitter {
  private store: SessionStore;
  private logger: Logger;
  private config: Required<SessionServiceConfig>;
  private persistenceTimer?: NodeJS.Timeout;

  /**
   * Create a new SessionService instance
   *
   * @param store - The session store implementation
   * @param logger - Pino logger instance
   * @param config - Optional configuration overrides
   */
  constructor(store: SessionStore, logger: Logger, config?: SessionServiceConfig) {
    super();
    this.store = store;
    this.logger = logger.child({ component: 'SessionService' });
    this.config = validateSessionConfig(config);

    // Optional persistence to JSON for development/recovery
    if (this.config.persistencePath != null) {
      this.startPersistence();
      this.loadPersistedSessions().catch((err) =>
        this.logger.warn({ error: err }, 'Failed to load persisted sessions')
      );
    }

    this.logger.info(
      {
        maxActiveSessions: this.config.maxActiveSessions,
        defaultTTL: this.config.defaultTTL,
        persistence: !!this.config.persistencePath
      },
      'Session service initialized'
    );
  }

  private startPersistence(): void {
    if (!this.config.persistencePath) return;

    this.persistenceTimer = setInterval(async () => {
      try {
        await this.persistSessions();
      } catch (error) {
        this.logger.error({ error }); // Fixed logger call
      }
    }, this.config.persistenceInterval * MILLISECONDS_PER_SECOND);

    // Don't keep process alive just for persistence'
    if (this.persistenceTimer.unref) {
      this.persistenceTimer.unref();
    }

    // Also persist on process signals
    const persistOnExit = (): void => {
      this.persistSessions()
        .then(() => this.logger.info('Sessions persisted on exit'))
        .catch((err) => this.logger.error({ error: err })); // Fixed logger call
    };

    process.once('SIGTERM', persistOnExit);
    process.once('SIGINT', persistOnExit);
  }

  private async persistSessions(): Promise<void> {
    if (!this.config.persistencePath) return;

    const sessions = await this.store.list();
    const data = {
      version: '1.0.0',
      persisted_at: new Date().toISOString(),
      session_count: sessions.length,
      sessions
    };

    const dir = path.dirname(this.config.persistencePath);
    await fs.mkdir(dir, { recursive: true });

    // Write to temp file first, then rename for atomic operation
    const tempPath = `${this.config.persistencePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, this.config.persistencePath);

    this.logger.debug({ count: sessions.length, path: this.config.persistencePath }); // Fixed logger call
  }

  private async loadPersistedSessions(): Promise<void> {
    if (!this.config.persistencePath) return;

    try {
      const data = await fs.readFile(this.config.persistencePath, 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.sessions && Array.isArray(parsed.sessions)) {
        // Only load non-expired sessions
        const validSessions = parsed.sessions.filter((s: Session) => !SessionUtils.isExpired(s));

        if (validSessions.length > 0) {
          await this.store.createBatch(validSessions);
        }

        this.logger.info(
          {
            loaded: validSessions.length,
            total: parsed.sessions.length,
            expired: parsed.sessions.length - validSessions.length
          },
          'Loaded persisted sessions'
        );
      }
    } catch (error: unknown) {
      if (error.code !== 'ENOENT') {
        this.logger.error({ error: error.message ?? error }); // Fixed logger call
        throw error;
      }
      // File doesn't exist yet, that's ok
      this.logger.debug('No persisted sessions file found');
    }
  }

  /**
   * Create a new session (simplified interface for handlers)
   */
  async create(data: { projectName?: string; metadata?: unknown }): Promise<Session> {
    return this.createSession('', data);
  }

  /**
   * Get session (simplified interface for handlers)
   */
  async get(id: string): Promise<Session | null> {
    try {
      return await this.getSession(id);
    } catch {
      return null;
    }
  }

  /**
   * Update session atomically (simplified interface for handlers)
   */
  async updateAtomic(id: string, updater: (session: Session) => Session): Promise<void> {
    await this.store.updateAtomic(id, updater);
  }

  /**
   * Get active session count (simplified interface for handlers)
   */
  async getActiveCount(): Promise<number> {
    return this.store.getActiveCount();
  }

  /**
   * Create a new session for a repository
   *
   * @param repoPath - Path to the repository being containerized
   * @param data - Optional session data overrides
   * @returns Promise resolving to the created session
   * @throws Error if maximum active sessions limit is reached
   *
   * @example
   * ```typescript`
   * const session = await sessionService.createSession('/path/to/repo', {
   *   metadata: { projectName: 'my-app' },
   *   labels: { environment: 'dev' }
   * })
   * ````
   */
  async createSession(repoPath: string, data?: Partial<Session>): Promise<Session> {
    // Check active session limit
    const activeCount = await this.store.getActiveCount();
    if (activeCount >= this.config.maxActiveSessions) {
      throw new ServiceError(
        ErrorCode.ResourceLimitExceeded,
        `Maximum active sessions (${this.config.maxActiveSessions}) reached`
      );
    }

    const session = SessionUtils.createSession(repoPath, {
      ...data,
      expires_at:
        data?.expires_at ?? new Date(Date.now() + this.config.defaultTTL * MILLISECONDS_PER_SECOND).toISOString()
    });

    await this.store.create(session);

    this.logger.info({ sessionId: session.id, repoPath }); // Fixed logger call
    this.emit('session:created', session);

    return session;
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<Session> {
    const session = await this.store.get(id);

    if (!session) {
      throw new Error(`Session ${id} not found`);
    }

    return session;
  }

  /**
   * Update a session
   */
  async updateSession(id: string, updates: Partial<Session>): Promise<Session> {
    await this.store.updateAtomic(id, (current) => ({
      ...current,
      ...updates,
      id: current.id, // Prevent ID changes
      created_at: current.created_at, // Preserve creation time
      version: current.version // Will be incremented by store
    }));

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated session ${id}`);
    }

    this.logger.debug({ sessionId: id, status: updated.status }); // Fixed logger call
    this.emit('session:updated', updated);

    return updated;
  }

  /**
   * Update workflow state for a session
   */
  async updateWorkflowState(id: string, stateUpdate: Partial<WorkflowState>): Promise<Session> {
    await this.store.updateAtomic(id, (current) => ({
      ...current,
      workflow_state: SessionUtils.mergeWorkflowState(current.workflow_state ?? {}, stateUpdate)
    }));

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated session ${id}`);
    }

    this.logger.debug(
      {
        sessionId: id,
        stage: updated.stage,
        progress: updated.progress?.percentage
      },
      'Workflow state updated'
    );

    this.emit('workflow:updated', { session: updated, update: stateUpdate });

    return updated;
  }

  /**
   * Mark a workflow step as completed
   */
  async markStepCompleted(id: string, step: string): Promise<Session> {
    await this.store.updateAtomic(id, (current) => SessionUtils.markStepCompleted(current, step));

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated session ${id}`);
    }

    this.logger.info({ sessionId: id, step, progress: updated.progress?.percentage }); // Fixed logger call

    return updated;
  }

  /**
   * Set the current workflow step
   */
  async setCurrentStep(id: string, step: string | null): Promise<Session> {
    await this.store.updateAtomic(id, (current) => SessionUtils.setCurrentStep(current, step));

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated session ${id}`);
    }

    this.logger.debug({ sessionId: id, step }); // Fixed logger call

    return updated;
  }

  /**
   * Add an error for a workflow step
   */
  async addStepError(id: string, step: string, error: Error | string): Promise<Session> {
    await this.store.updateAtomic(id, (current) => SessionUtils.addStepError(current, step, error));

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated session ${id}`);
    }

    const errorMsg = error instanceof Error ? error.message : error;
    this.logger.error({ sessionId: id, step, error: errorMsg }); // Fixed logger call

    return updated;
  }

  /**
   * Complete a session
   */
  async completeSession(id: string, success: boolean = true): Promise<Session> {
    return this.updateSession(id, {
      status: success ? 'completed' : 'failed',
      expires_at: new Date(
        Date.now() + COMPLETED_SESSION_RETENTION * MILLISECONDS_PER_SECOND
      ).toISOString()
    });
  }

  /**
   * Extend session expiration
   */
  async extendSession(id: string, additionalSeconds: number): Promise<Session> {
    await this.store.updateAtomic(id, (current) => {
      const currentExpiry = current.expires_at
        ? new Date(current.expires_at).getTime()
        : Date.now();

      return {
        ...current,
        expires_at: new Date(
          currentExpiry + additionalSeconds * MILLISECONDS_PER_SECOND
        ).toISOString()
      };
    });

    const updated = await this.store.get(id);
    if (!updated) {
      throw new Error(`Failed to retrieve extended session ${id}`);
    }

    this.logger.info({ sessionId: id, additionalSeconds }); // Fixed logger call

    return updated;
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    await this.store.delete(id);
    this.logger.info({ sessionId: id }); // Fixed logger call
    this.emit('session:deleted', id);
  }

  /**
   * List sessions with optional filter
   */
  async listSessions(filter?: SessionFilter): Promise<Session[]> {
    return this.store.list(filter);
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<Session[]> {
    return this.store.getByStatus('active');
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(): Promise<{
    total: number;
    active: number;
    completed: number;
    failed: number;
    expired: number;
    pending: number;
    analyzing: number;
    building: number;
    deploying: number;
  }> {
    const [active, completed, failed, expired, pending, analyzing, building, deploying] =
      await Promise.all([
        this.store.getByStatus('active'),
        this.store.getByStatus('completed'),
        this.store.getByStatus('failed'),
        this.store.getByStatus('expired'),
        this.store.getByStatus('pending'),
        this.store.getByStatus('analyzing'),
        this.store.getByStatus('building'),
        this.store.getByStatus('deploying')
      ]);

    return {
      total:
        active.length +
        completed.length +
        failed.length +
        expired.length +
        pending.length +
        analyzing.length +
        building.length +
        deploying.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      expired: expired.length,
      pending: pending.length,
      analyzing: analyzing.length,
      building: building.length,
      deploying: deploying.length
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    const deleted = await this.store.deleteExpired();

    if (deleted > 0) {
      this.logger.info({ count: deleted }); // Fixed logger call
      this.emit('cleanup', { deletedCount: deleted });
    }

    return deleted;
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }

    // Final persistence
    if (this.config.persistencePath != null) {
      try {
        await this.persistSessions();
      } catch (error) {
        this.logger.error({ error }); // Fixed logger call
      }
    }

    await this.store.close();

    this.logger.info('Session service shut down');
  }

  /**
   * Close the service (alias for shutdown for compatibility)
   */
  async close(): Promise<void> {
    await this.shutdown();
  }
}
