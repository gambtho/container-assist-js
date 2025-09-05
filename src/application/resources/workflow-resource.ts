/**
 * Workflow Resource Provider for MCP SDK
 * Provides access to workflow states and session data via MCP resources
 */

import type { Logger } from 'pino';
import type { SessionService } from '../../services/session';

// Type definitions for session data
interface SessionData {
  id: string;
  status: string;
  stage?: string;
  progress?: number;
  workflow_state?: unknown;
  created_at: string;
  updated_at?: string;
  repo_path?: string;
  metadata?: unknown;
}

// Type guard for SessionData
function isSessionData(obj: unknown): obj is SessionData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'status' in obj &&
    'created_at' in obj &&
    typeof (obj as { id: unknown; status: unknown; created_at: unknown }).id === 'string' &&
    typeof (obj as { id: unknown; status: unknown; created_at: unknown }).status === 'string' &&
    typeof (obj as { id: unknown; status: unknown; created_at: unknown }).created_at === 'string'
  );
}

export class WorkflowResourceProvider {
  constructor(
    private sessionService: SessionService,
    private logger: Logger,
  ) {
    this.logger = logger.child({ component: 'WorkflowResourceProvider' });
  }

  /**
   * Register workflow-related MCP resources
   */
  getResources(): Array<unknown> {
    return [
      // Current workflow resource
      {
        uri: 'workflow://current',
        name: 'Current Workflow State',
        description: 'Active workflow state and progress information',
        mimeType: 'application/json',
        handler: () => {
          try {
            // Get the most recent active session
            const sessions = this.sessionService.list({
              status: 'active',
            });

            if (sessions == null || sessions.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        status: 'no_active_workflow',
                        message: 'No active workflow sessions found',
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const activeSession = sessions[0];
            if (!activeSession) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        status: 'no_active_workflow',
                        message: 'No active workflow sessions found',
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      sessionId: activeSession.id,
                      status: activeSession.status,
                      stage: activeSession.stage,
                      progress: activeSession.progress,
                      workflowState: activeSession.workflow_state,
                      metadata: {
                        created: activeSession.created_at,
                        updated: activeSession.updated_at,
                        repoPath: activeSession.repo_path,
                      },
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get current workflow');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
      // Workflow history resource
      {
        uri: 'workflow://history',
        name: 'Workflow History',
        description: 'Recent workflow execution history',
        mimeType: 'application/json',
        handler: () => {
          try {
            const sessions = this.sessionService.list({
              limit: 20,
            });

            if (sessions == null) {
              throw new Error('Failed to retrieve workflow history');
            }

            const history = sessions
              .map((session: unknown) => {
                if (!isSessionData(session)) {
                  this.logger.warn({ session }, 'Invalid session format in history');
                  return null;
                }
                return {
                  id: session.id,
                  status: session.status,
                  stage: session.stage,
                  created: session.created_at,
                  updated: session.updated_at,
                  duration:
                    session.updated_at != null && session.updated_at !== ''
                      ? new Date(session.updated_at).getTime() -
                        new Date(session.created_at).getTime()
                      : null,
                  repoPath: session.repo_path,
                  metadata: session.metadata,
                };
              })
              .filter((s): s is NonNullable<typeof s> => s !== null);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      count: history.length,
                      workflows: history,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get workflow history');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
      // Workflow statistics resource
      {
        uri: 'workflow://stats',
        name: 'Workflow Statistics',
        description: 'Aggregate workflow execution statistics',
        mimeType: 'application/json',
        handler: () => {
          try {
            const sessions = this.sessionService.list({});

            if (sessions == null) {
              throw new Error('Failed to retrieve workflow statistics');
            }

            const stats = {
              total: sessions.length,
              byStatus: {} as Record<string, number>,
              byStage: {} as Record<string, number>,
              averageDuration: 0,
              successRate: 0,
              completedCount: 0,
              failedCount: 0,
            };

            let totalDuration = 0;
            let durationCount = 0;

            for (const session of sessions ?? []) {
              // Count by status
              stats.byStatus[session.status] = (stats.byStatus[session.status] ?? 0) + 1;

              // Count by stage
              if (session.stage != null && session.stage !== '') {
                stats.byStage[session.stage] = (stats.byStage[session.stage] ?? 0) + 1;
              }

              // Calculate durations
              if (session.updated_at != null && session.updated_at !== '') {
                const duration =
                  new Date(session.updated_at).getTime() - new Date(session.created_at).getTime();
                totalDuration += duration;
                durationCount++;
              }

              // Count completed and failed
              if (session.status === 'completed') stats.completedCount++;
              if (session.status === 'failed') stats.failedCount++;
            }

            // Calculate averages
            stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;
            stats.successRate = stats.total > 0 ? (stats.completedCount / stats.total) * 100 : 0;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      ...stats,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get workflow statistics');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
    ];
  }
}
