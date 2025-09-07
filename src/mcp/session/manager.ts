/**
 * Session Manager for MCP
 * Manages session state, tool history, and workflow progress
 */

import type { Logger } from 'pino';

// Session state structure
interface SessionState {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  analysis_result?: any;
  generated_dockerfile?: string;
  k8s_manifests?: any;
  scan_results?: any;
  workflow_state?: any;
  ai_context?: any;
  build_log?: string;
  deployment_status?: any;
  completed_steps?: string[];
  tool_history?: ToolExecution[];
  subscriptions?: any[];
}

// Tool execution record
interface ToolExecution {
  toolName: string;
  parameters: any;
  result: any;
  insights?: string[];
  recommendations?: string[];
  executionTime: number;
  timestamp: string;
}

export class SessionManager {
  private sessions: Map<string, SessionState> = new Map();

  constructor(private logger: Logger) {}

  // Create or get session
  async getOrCreateSession(sessionId: string): Promise<SessionState> {
    if (!this.sessions.has(sessionId)) {
      const session: SessionState = {
        sessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed_steps: [],
        tool_history: [],
        subscriptions: [],
      };
      this.sessions.set(sessionId, session);
      this.logger.debug({ sessionId }, 'Created new session');
    }
    return this.sessions.get(sessionId)!;
  }

  // Get session state
  async getState(sessionId: string): Promise<SessionState | undefined> {
    return this.sessions.get(sessionId);
  }

  // Update session state
  async updateState(sessionId: string, updates: Partial<SessionState>): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    Object.assign(session, updates, {
      updatedAt: new Date().toISOString(),
    });
    this.logger.debug({ sessionId, updates }, 'Updated session state');
  }

  // Get tool history
  async getToolHistory(sessionId: string): Promise<ToolExecution[]> {
    const session = await this.getState(sessionId);
    return session?.tool_history || [];
  }

  // Add tool execution
  async addToolExecution(sessionId: string, execution: ToolExecution): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    if (!session.tool_history) {
      session.tool_history = [];
    }
    session.tool_history.push(execution);
    session.updatedAt = new Date().toISOString();
    this.logger.debug({ sessionId, tool: execution.toolName }, 'Added tool execution to history');
  }

  // Get repository analysis
  async getRepositoryAnalysis(sessionId: string): Promise<any> {
    const session = await this.getState(sessionId);
    return session?.analysis_result;
  }

  // Update workflow progress
  async updateWorkflowProgress(sessionId: string, progress: any): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.workflow_state = {
      ...session.workflow_state,
      ...progress,
      lastUpdate: new Date().toISOString(),
    };
    session.updatedAt = new Date().toISOString();
  }

  // Add completed step
  async addCompletedStep(sessionId: string, stepName: string): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    if (!session.completed_steps) {
      session.completed_steps = [];
    }
    if (!session.completed_steps.includes(stepName)) {
      session.completed_steps.push(stepName);
      session.updatedAt = new Date().toISOString();
    }
  }

  // Store step result
  async storeStepResult(sessionId: string, stepName: string, result: any): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);

    // Store specific results based on step name
    switch (stepName) {
      case 'analyze-repo':
        session.analysis_result = result;
        break;
      case 'generate-dockerfile':
        session.generated_dockerfile = result.dockerfile || result;
        break;
      case 'scan':
        session.scan_results = result;
        break;
      case 'generate-k8s-manifests':
        session.k8s_manifests = result;
        break;
      case 'deploy':
        session.deployment_status = result;
        break;
      case 'build-image':
        session.build_log = result.log || JSON.stringify(result);
        break;
      default:
        // Store in workflow state for other steps
        if (!session.workflow_state) {
          session.workflow_state = {};
        }
        session.workflow_state[stepName] = result;
    }

    session.updatedAt = new Date().toISOString();
  }

  // Add subscription
  async addSubscription(sessionId: string, subscription: any): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    if (!session.subscriptions) {
      session.subscriptions = [];
    }
    session.subscriptions.push(subscription);
    session.updatedAt = new Date().toISOString();
  }

  // Remove subscription
  async removeSubscription(sessionId: string, uri: string): Promise<void> {
    const session = await this.getState(sessionId);
    if (session?.subscriptions) {
      session.subscriptions = session.subscriptions.filter((s: any) => s.uri !== uri);
      session.updatedAt = new Date().toISOString();
    }
  }

  // Clear session
  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.logger.debug({ sessionId }, 'Cleared session');
  }

  // Get all sessions
  getAllSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  // Get session stats
  getStats(): { totalSessions: number; activeSessions: number } {
    const now = Date.now();
    const activeThreshold = 30 * 60 * 1000; // 30 minutes

    const activeSessions = Array.from(this.sessions.values()).filter((session) => {
      const lastUpdate = new Date(session.updatedAt).getTime();
      return now - lastUpdate < activeThreshold;
    }).length;

    return {
      totalSessions: this.sessions.size,
      activeSessions,
    };
  }
}

// Factory function
export const createSessionManager = (logger: Logger): SessionManager => {
  return new SessionManager(logger);
};
