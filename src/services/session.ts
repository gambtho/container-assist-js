/**
 * Session Service
 */

import type { Logger } from 'pino';
import type { Session, WorkflowState } from '../contracts/types/index';
import { InMemorySessionStore } from '../runtime/persistence/memory-store';
import type { SessionStore } from '../contracts/types/session-store';
import type { SessionService as ISessionService } from '../application/services/interfaces';

export interface SessionConfig {
  storeType?: 'memory' | 'file';
  storePath?: string;
  ttl?: number; // Session TTL in seconds
}

const DEFAULT_TTL = 86400; // 24 hours

/**
 * Create a session service instance
 */
export async function createSessionService(
  config: SessionConfig,
  logger: Logger
): Promise<SessionService> {
  const service = new SessionService(config, logger);
  await service.initialize();
  return service;
}

export class SessionService implements ISessionService {
  private store: SessionStore;
  private logger: Logger;
  private ttl: number;

  constructor(config: SessionConfig, logger: Logger) {
    this.logger = logger.child({ service: 'session' });
    this.ttl = config.ttl ?? DEFAULT_TTL;

    // Use memory store
    this.store = new InMemorySessionStore(this.logger);
  }

  async initialize(): Promise<void> {
    // SessionStore doesn't have initialize method - it's ready to use
    this.logger.info('Session service initialized');
  }

  async create(data: Partial<Session>): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: data.id ?? uuidv4(),
      version: data.version ?? 1,
      status: data.status ?? 'pending',
      repo_path: data.repo_path ?? '',
      workflow_state: data.workflow_state ?? {
        completed_steps: [],
        errors: {},
        metadata: {},
        dockerfile_fix_history: []
      },
      created_at: now,
      updated_at: now,
      ...data
    };

    await this.store.create(session);
    this.logger.info({ sessionId: session.id }, 'Session created');
    return session;
  }

  async get(id: string): Promise<Session | null> {
    const session = await this.store.get(id);
    return session;
  }

  async update(id: string, updates: Partial<Session>): Promise<void> {
    const currentSession = await this.store.get(id);
    if (!currentSession) {
      throw new Error('Session not found');
    }

    const updated: Session = {
      ...currentSession,
      ...updates,
      updated_at: new Date().toISOString()
    };

    await this.store.update(id, updated);
    this.logger.info({ sessionId: id }, 'Session updated');
  }

  async updateWorkflowState(id: string, state: Partial<WorkflowState>): Promise<Session> {
    const session = await this.store.get(id);
    if (!session) {
      throw new Error('Session not found');
    }

    const updatedState = {
      ...session.workflow_state,
      ...state
    };

    await this.update(id, { workflow_state: updatedState });
    const updatedSession = await this.store.get(id);
    if (!updatedSession) {
      throw new Error('Failed to retrieve updated session');
    }
    return updatedSession;
  }

  async delete(id: string): Promise<void> {
    await this.store.delete(id);
    this.logger.info({ sessionId: id }, 'Session deleted');
  }

  async list(filter?: SessionFilter): Promise<Session[]> {
    const sessions = await this.store.list(filter ?? {});
    return sessions;
  }

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.ttl * 1000;
    const cutoffDate = new Date(cutoff).toISOString();

    const sessions = await this.store.list({});

    let deleted = 0;
    for (const session of sessions) {
      if (session.updated_at < cutoffDate) {
        try {
          await this.store.delete(session.id);
          deleted++;
        } catch (error) {
          this.logger.warn(
            { sessionId: session.id, error },
            'Failed to delete session during cleanup'
          );
        }
      }
    }

    this.logger.info({ deleted }, 'Session cleanup completed');
    return deleted;
  }

  // Additional methods needed by resource providers
  async updateAtomic(id: string, updater: (session: Session) => Session): Promise<void> {
    await this.store.updateAtomic(id, updater);
  }

  async query(params: SessionFilter): Promise<Session[]> {
    return this.list(params);
  }

  async close(): Promise<void> {
    await this.store.close();
    this.logger.info('Session service closed');
  }
}

// Export a singleton getter for convenience
let _sessionService: SessionService | undefined;

export async function getSessionService(
  config: SessionConfig,
  logger: Logger
): Promise<SessionService> {
  if (!_sessionService) {
    _sessionService = await createSessionService(config, logger);
  }
  return _sessionService;
}
