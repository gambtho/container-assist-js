/**
 * Session Resource Provider for MCP SDK
 * Provides access to session data and management capabilities
 */

// import type { Server } from '@modelcontextprotocol/sdk/server/index';
import type { Logger } from 'pino';
import type { SessionService } from '../../services/session.js';
import type { Session } from '../../contracts/types/session.js';

export class SessionResourceProvider {
  constructor(
    private sessionService: SessionService,
    private logger: Logger
  ) {
    this.logger = logger.child({ component: 'SessionResourceProvider' });
  }

  /**
   * Register session-related MCP resources
   */
  getResources(): Array<unknown> {
    // Active sessions resource
    return [
      {
        uri: 'session://active',
        name: 'Active Sessions',
        description: 'Currently active containerization sessions',
        mimeType: 'application/json',
        handler: async () => {
          try {
            const activeSessions = await this.sessionService.query({
              status: 'active',
              limit: 50
            });

            if (activeSessions == null) {
              throw new Error('Failed to query active sessions');
            }

            const sessions = activeSessions.map((session: unknown) => {
              const sessionData = session as Session;
              return {
                id: sessionData.id,
                status: sessionData.status,
                stage: sessionData.stage,
                progress: {
                  percentage: sessionData.progress?.percentage ?? 0,
                  message: '', // Not available in schema, set default
                  step: sessionData.progress?.current_step?.toString() ?? ''
                },
                repoPath: sessionData.repo_path,
                created: sessionData.created_at,
                updated: sessionData.updated_at,
                timeActive: new Date().getTime() - new Date(sessionData.created_at).getTime()
              };
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      count: sessions.length,
                      sessions,
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get active sessions');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      },
      // Session details resource (parameterized)
      {
        uri: 'session://details/{sessionId}',
        name: 'Session Details',
        description: 'Detailed information about a specific session',
        mimeType: 'application/json',
        handler: async (params: { sessionId: string }) => {
          try {
            const session = await this.sessionService.get(params.sessionId);

            if (!session) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        status: 'not_found',
                        message: `Session ${params.sessionId} not found`,
                        timestamp: new Date().toISOString()
                      },
                      null,
                      2
                    )
                  }
                ]
              };
            }

            const sessionData = session;
            const details = {
              id: sessionData.id,
              version: sessionData.version,
              status: sessionData.status,
              stage: sessionData.stage,
              progress: sessionData.progress,
              workflowState: sessionData.workflow_state,
              metadata: sessionData.metadata,
              config: sessionData.config,
              repoPath: sessionData.repo_path,
              created: sessionData.created_at,
              updated: sessionData.updated_at,
              duration: sessionData.updated_at
                ? new Date(sessionData.updated_at).getTime() -
                  new Date(sessionData.created_at).getTime()
                : 0,
              timestamp: new Date().toISOString()
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(details, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error(
              { error, sessionId: params.sessionId },
              'Failed to get session details'
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      sessionId: params.sessionId,
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      },
      // Session management resource
      {
        uri: 'session://management',
        name: 'Session Management',
        description: 'Session lifecycle management and cleanup operations',
        mimeType: 'application/json',
        handler: async () => {
          try {
            // Get session statistics for management
            const allSessions = await this.sessionService.query({ limit: 200 });

            if (!allSessions) {
              throw new Error('Failed to query sessions for management');
            }

            const now = new Date();
            const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
            const expiredThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

            const management = {
              total: allSessions.length,
              active: 0,
              stale: 0,
              expired: 0,
              completed: 0,
              failed: 0,
              cleanupCandidates: [] as string[],
              recommendations: [] as string[],
              timestamp: new Date().toISOString()
            };

            for (const session of allSessions) {
              const sessionData = session;
              const age = now.getTime() - new Date(sessionData.created_at).getTime();
              const lastActivity = sessionData.updated_at
                ? now.getTime() - new Date(sessionData.updated_at).getTime()
                : age;

              // Count by status
              switch (sessionData.status) {
                case 'active':
                  management.active++;
                  if (lastActivity > staleThreshold) {
                    management.stale++;
                    management.cleanupCandidates.push(sessionData.id);
                  }
                  break;
                case 'completed':
                  management.completed++;
                  if (age > expiredThreshold) {
                    management.expired++;
                    management.cleanupCandidates.push(sessionData.id);
                  }
                  break;
                case 'failed':
                case 'expired':
                  management.failed++;
                  if (age > staleThreshold) {
                    management.cleanupCandidates.push(sessionData.id);
                  }
                  break;
              }
            }

            // Generate recommendations
            if (management.stale > 0) {
              management.recommendations.push(
                `${management.stale} stale sessions should be cleaned up`
              );
            }
            if (management.expired > 0) {
              management.recommendations.push(
                `${management.expired} expired sessions can be archived`
              );
            }
            if (management.active > 10) {
              management.recommendations.push(
                'High number of active sessions - consider reviewing resource usage'
              );
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(management, null, 2)
                }
              ]
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get session management data');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString()
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }
        }
      }
    ];
  }
}
