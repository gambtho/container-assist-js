import { Result, Success, Failure } from '../../types/core.js';
import type { Logger } from 'pino';
import {
  SessionContext,
  WorkflowConfig,
  WorkflowState,
  WorkflowStage,
  RepositoryInfo,
  DEFAULT_WORKFLOW_CONFIG,
} from './types.js';

export class SessionManager {
  private sessions: Map<string, SessionContext> = new Map();
  private readonly maxSessions: number = 100;
  private readonly sessionTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private logger: Logger) {}

  async createSession(
    repository: RepositoryInfo,
    config?: Partial<WorkflowConfig>,
  ): Promise<Result<SessionContext>> {
    try {
      // Generate unique session ID
      const sessionId = this.generateSessionId();

      // Clean up old sessions if needed
      await this.cleanupExpiredSessions();

      // Check session limit
      if (this.sessions.size >= this.maxSessions) {
        return Failure('Maximum number of concurrent sessions reached');
      }

      // Create session context
      const session: SessionContext = {
        id: sessionId,
        repository,
        config: { ...DEFAULT_WORKFLOW_CONFIG, ...config },
        state: {
          currentStage: WorkflowStage.ANALYSIS,
          completedStages: [],
          failedStages: [],
          retryCount: {} as Record<WorkflowStage, number>,
          errors: [],
        },
        artifacts: new Map(),
        startTime: new Date(),
        lastActivity: new Date(),
      };

      this.sessions.set(sessionId, session);

      this.logger.info({
        sessionId,
        repository: repository.name,
        config: session.config,
      }, 'Created new workflow session');

      return Success(session);

    } catch (error) {
      this.logger.error({ error }, 'Failed to create session');
      return Failure(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSession(sessionId: string): Promise<Result<SessionContext>> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Update last activity
    session.lastActivity = new Date();

    return Success(session);
  }

  async updateSession(sessionId: string, updates: Partial<SessionContext>): Promise<Result<SessionContext>> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Failure(`Session ${sessionId} not found`);
    }

    // Update session with provided changes
    Object.assign(session, updates);
    session.lastActivity = new Date();

    this.logger.debug({
      sessionId,
      updates: Object.keys(updates),
    }, 'Updated session');

    return Success(session);
  }

  async updateSessionState(
    sessionId: string,
    stage: WorkflowStage,
    status: 'started' | 'completed' | 'failed',
  ): Promise<Result<SessionContext>> {
    const sessionResult = await this.getSession(sessionId);
    if (!sessionResult.ok) {
      return sessionResult;
    }

    const session = sessionResult.value;

    switch (status) {
      case 'started':
        session.state.currentStage = stage;
        break;

      case 'completed':
        if (!session.state.completedStages.includes(stage)) {
          session.state.completedStages.push(stage);
        }
        // Remove from failed stages if it was there
        session.state.failedStages = session.state.failedStages.filter((s: WorkflowStage) => s !== stage);
        break;

      case 'failed':
        if (!session.state.failedStages.includes(stage)) {
          session.state.failedStages.push(stage);
        }
        // Increment retry count
        session.state.retryCount[stage] = (session.state.retryCount[stage] || 0) + 1;
        break;
    }

    session.lastActivity = new Date();

    this.logger.debug({
      sessionId,
      stage,
      status,
      state: session.state,
    }, 'Updated session state');

    return Success(session);
  }

  async addSessionArtifact(
    sessionId: string,
    name: string,
    resourceUri: string,
  ): Promise<Result<void>> {
    const sessionResult = await this.getSession(sessionId);
    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const session = sessionResult.value;
    session.artifacts.set(name, resourceUri);
    session.lastActivity = new Date();

    this.logger.debug({
      sessionId,
      artifactName: name,
      resourceUri,
    }, 'Added session artifact');

    return Success(undefined);
  }

  async getSessionArtifact(sessionId: string, name: string): Promise<Result<string>> {
    const sessionResult = await this.getSession(sessionId);
    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const session = sessionResult.value;
    const resourceUri = session.artifacts.get(name);

    if (!resourceUri) {
      return Failure(`Artifact ${name} not found in session ${sessionId}`);
    }

    return Success(resourceUri);
  }

  async listSessions(): Promise<SessionContext[]> {
    return Array.from(this.sessions.values());
  }

  async deleteSession(sessionId: string): Promise<Result<void>> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return Failure(`Session ${sessionId} not found`);
    }

    this.sessions.delete(sessionId);

    this.logger.info({
      sessionId,
      duration: Date.now() - session.startTime.getTime(),
    }, 'Deleted session');

    return Success(undefined);
  }

  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.sessionTTL) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.deleteSession(sessionId);
    }

    if (expiredSessions.length > 0) {
      this.logger.info({
        expiredCount: expiredSessions.length,
        expiredSessions,
      }, 'Cleaned up expired sessions');
    }
  }

  getSessionStats(): {
    total: number
    byStage: Record<WorkflowStage, number>
    byStatus: Record<string, number>
  } {
    const stats = {
      total: this.sessions.size,
      byStage: {} as Record<WorkflowStage, number>,
      byStatus: {
        active: 0,
        completed: 0,
        failed: 0,
      },
    };

    // Initialize stage counters
    for (const stage of Object.values(WorkflowStage)) {
      stats.byStage[stage] = 0;
    }

    // Count sessions by current stage and status
    for (const session of this.sessions.values()) {
      stats.byStage[session.state.currentStage]++;

      if (session.state.failedStages.length > 0) {
        stats.byStatus.failed++;
      } else if (session.state.completedStages.length === Object.values(WorkflowStage).length) {
        stats.byStatus.completed++;
      } else {
        stats.byStatus.active++;
      }
    }

    return stats;
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  // For testing and development
  async reset(): Promise<void> {
    this.sessions.clear();
    this.logger.info('Reset all sessions');
  }
}
