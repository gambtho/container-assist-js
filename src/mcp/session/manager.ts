/**
 * Session management utilities - Simple Map-based functions
 *
 * No classes or managers, just simple functions operating on a Map
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

// Global sessions Map - module-level state
const sessions = new Map<string, SessionState>();

/**
 * Get or create a session
 */
export const getOrCreateSession = (sessionId: string, logger?: Logger): SessionState => {
  if (!sessions.has(sessionId)) {
    const session: SessionState = {
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed_steps: [],
      tool_history: [],
      subscriptions: [],
    };
    sessions.set(sessionId, session);
    logger?.debug({ sessionId }, 'Created new session');
  }
  return sessions.get(sessionId)!;
};

/**
 * Get session state
 */
export const getSessionState = (sessionId: string): SessionState | undefined => {
  return sessions.get(sessionId);
};

/**
 * Update session state
 */
export const updateSessionState = (
  sessionId: string,
  updates: Partial<SessionState>,
  logger?: Logger,
): void => {
  const session = getOrCreateSession(sessionId, logger);
  Object.assign(session, updates, {
    updatedAt: new Date().toISOString(),
  });
  logger?.debug({ sessionId, updates }, 'Updated session state');
};

/**
 * Get tool history for a session
 */
export const getToolHistory = (sessionId: string): ToolExecution[] => {
  const session = sessions.get(sessionId);
  return session?.tool_history || [];
};

/**
 * Add tool execution to history
 */
export const addToolExecution = (
  sessionId: string,
  execution: ToolExecution,
  logger?: Logger,
): void => {
  const session = getOrCreateSession(sessionId, logger);
  if (!session.tool_history) {
    session.tool_history = [];
  }
  session.tool_history.push(execution);
  session.updatedAt = new Date().toISOString();
  logger?.debug({ sessionId, tool: execution.toolName }, 'Added tool execution to history');
};

/**
 * Store step result in session
 */
export const storeStepResult = (
  sessionId: string,
  stepName: string,
  result: any,
  logger?: Logger,
): void => {
  const session = getOrCreateSession(sessionId, logger);

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
};

/**
 * Add completed step
 */
export const addCompletedStep = (sessionId: string, stepName: string, logger?: Logger): void => {
  const session = getOrCreateSession(sessionId, logger);
  if (!session.completed_steps) {
    session.completed_steps = [];
  }
  if (!session.completed_steps.includes(stepName)) {
    session.completed_steps.push(stepName);
    session.updatedAt = new Date().toISOString();
  }
};

/**
 * Clear a session
 */
export const clearSession = (sessionId: string, logger?: Logger): void => {
  sessions.delete(sessionId);
  logger?.debug({ sessionId }, 'Cleared session');
};

/**
 * Get all session IDs
 */
export const getAllSessionIds = (): string[] => {
  return Array.from(sessions.keys());
};

/**
 * Get session statistics
 */
export const getSessionStats = (): { totalSessions: number; activeSessions: number } => {
  const now = Date.now();
  const activeThreshold = 30 * 60 * 1000; // 30 minutes

  const activeSessions = Array.from(sessions.values()).filter((session) => {
    const lastUpdate = new Date(session.updatedAt).getTime();
    return now - lastUpdate < activeThreshold;
  }).length;

  return {
    totalSessions: sessions.size,
    activeSessions,
  };
};

/**
 * Get repository analysis from session
 */
export const getRepositoryAnalysis = (sessionId: string): any => {
  const session = sessions.get(sessionId);
  return session?.analysis_result;
};

/**
 * Update workflow progress
 */
export const updateWorkflowProgress = (
  sessionId: string,
  progress: any,
  logger?: Logger,
): void => {
  const session = getOrCreateSession(sessionId, logger);
  session.workflow_state = {
    ...session.workflow_state,
    ...progress,
    lastUpdate: new Date().toISOString(),
  };
  session.updatedAt = new Date().toISOString();
};

