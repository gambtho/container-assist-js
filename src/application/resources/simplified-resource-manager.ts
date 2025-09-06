/**
 * Simplified Resource Manager for MCP SDK
 * Direct resource registration without provider abstraction layer
 * Target: 368 → 150-200 lines (50% reduction)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from 'pino';
import type { ApplicationConfig } from '../../config/index.js';
import type { SessionService } from '../../services/session.js';
import type { DockerService } from '../../services/docker.js';
import { getRegisteredTools } from '../tools/native-registry';

export class SimplifiedResourceManager {
  private isRegistered = false;

  constructor(
    private config: ApplicationConfig,
    private sessionService: SessionService,
    private dockerService: DockerService,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'SimplifiedResourceManager' });
  }

  private logger: Logger;

  /**
   * Register all resources directly with MCP server
   * Eliminates provider abstraction layer
   */
  registerWithServer(server: McpServer): void {
    if (this.isRegistered) {
      this.logger.warn('Resources already registered with server');
      return;
    }

    try {
      // Register workflow resources directly
      this.registerWorkflowResources(server);

      // Register session resources directly
      this.registerSessionResources(server);

      // Register docker resources directly
      this.registerDockerResources(server);

      // Register config resources directly
      this.registerConfigResources(server);

      // Register tools resources directly
      this.registerToolsResources(server);

      this.isRegistered = true;
      this.logger.info('All resources registered directly with MCP server');
    } catch (error) {
      this.logger.error({ error }, 'Failed to register resources');
      throw error;
    }
  }

  private registerWorkflowResources(server: McpServer): void {
    // Current workflow state
    server.registerResource(
      'Current Workflow State',
      'workflow://current',
      {
        title: 'Current Workflow State',
        description: 'Active workflow state and progress information',
        mimeType: 'application/json',
      },
      () => {
        try {
          const sessions = this.sessionService.list().filter((s) => s.status === 'active');

          if (!sessions || sessions.length === 0) {
            return {
              contents: [
                {
                  uri: 'workflow://current',
                  mimeType: 'application/json',
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
              contents: [
                {
                  uri: 'workflow://current',
                  mimeType: 'application/json',
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
            contents: [
              {
                uri: 'workflow://current',
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    sessionId: activeSession.id,
                    status: activeSession.status,
                    stage: activeSession.stage ?? 'unknown',
                    progress: activeSession.progress ?? 0,
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
          return this.handleResourceError('workflow://current', error);
        }
      },
    );

    // Workflow history
    server.registerResource(
      'Workflow History',
      'workflow://history',
      {
        title: 'Workflow History',
        description: 'Recent workflow execution history',
        mimeType: 'application/json',
      },
      () => {
        try {
          const sessions = this.sessionService.list();

          if (!sessions) {
            throw new Error('Failed to retrieve workflow history');
          }

          const history = sessions
            .filter(
              (
                session,
              ): session is typeof session & { id: string; status: string; created_at: string } =>
                typeof session === 'object' &&
                session !== null &&
                'id' in session &&
                'status' in session &&
                'created_at' in session,
            )
            .map((session) => ({
              id: session.id,
              status: session.status,
              stage: session.stage ?? 'unknown',
              created: session.created_at,
              updated: session.updated_at,
              duration: session.updated_at
                ? new Date(session.updated_at).getTime() - new Date(session.created_at).getTime()
                : null,
              repoPath: session.repo_path,
              metadata: session.metadata,
            }));

          return {
            contents: [
              {
                uri: 'workflow://history',
                mimeType: 'application/json',
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
          return this.handleResourceError('workflow://history', error);
        }
      },
    );
  }

  private registerSessionResources(server: McpServer): void {
    // Active sessions
    server.registerResource(
      'Active Sessions',
      'session://active',
      {
        title: 'Active Sessions',
        description: 'List of currently active workflow sessions',
        mimeType: 'application/json',
      },
      () => {
        try {
          const sessions = this.sessionService.list().filter((s) => s.status === 'active');
          return {
            contents: [
              {
                uri: 'session://active',
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    count: sessions?.length || 0,
                    sessions: sessions || [],
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return this.handleResourceError('session://active', error);
        }
      },
    );
  }

  private registerDockerResources(server: McpServer): void {
    // Docker system info
    server.registerResource(
      'Docker System Information',
      'docker://system',
      {
        title: 'Docker System Information',
        description: 'Docker daemon status and system information',
        mimeType: 'application/json',
      },
      async () => {
        try {
          const systemInfo = await this.dockerService.getSystemInfo();
          return {
            contents: [
              {
                uri: 'docker://system',
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    ...systemInfo,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return this.handleResourceError('docker://system', error);
        }
      },
    );
  }

  private registerConfigResources(server: McpServer): void {
    // Current configuration
    server.registerResource(
      'Current Server Configuration',
      'config://current',
      {
        title: 'Current Server Configuration',
        description: 'Current server configuration and settings',
        mimeType: 'application/json',
      },
      () => {
        try {
          // Return safe config without sensitive values
          const safeConfig = {
            server: {
              host: this.config.server.host,
              port: this.config.server.port,
            },
            logging: {
              level: this.config.logging.level,
            },
            features: this.config.features || {},
            timestamp: new Date().toISOString(),
          };

          return {
            contents: [
              {
                uri: 'config://current',
                mimeType: 'application/json',
                text: JSON.stringify(safeConfig, null, 2),
              },
            ],
          };
        } catch (error) {
          return this.handleResourceError('config://current', error);
        }
      },
    );
  }

  private registerToolsResources(server: McpServer): void {
    // Tool registry
    server.registerResource(
      'Tool Registry',
      'tools://registry',
      {
        title: 'Tool Registry',
        description: 'Complete tool registry with metadata and capabilities',
        mimeType: 'application/json',
      },
      () => {
        try {
          const registeredTools = getRegisteredTools();

          const registry = {
            total: registeredTools.length,
            tools: registeredTools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              category: this.getToolCategory(tool.name),
            })),
            timestamp: new Date().toISOString(),
          };

          return {
            contents: [
              {
                uri: 'tools://registry',
                mimeType: 'application/json',
                text: JSON.stringify(registry, null, 2),
              },
            ],
          };
        } catch (error) {
          return this.handleResourceError('tools://registry', error);
        }
      },
    );
  }

  /**
   * Standardized error handling for all resources
   */
  private handleResourceError(
    uri: string,
    error: unknown,
  ): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    this.logger.error({ error, uri }, 'Resource handler failed');

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
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

  private getToolCategory(toolName: string): string {
    if (toolName.includes('analyze') || toolName.includes('resolve')) return 'analysis';
    if (toolName.includes('generate') || toolName.includes('create')) return 'generation';
    if (
      toolName.includes('build') ||
      toolName.includes('tag') ||
      toolName.includes('push') ||
      toolName.includes('scan')
    )
      return 'docker';
    if (toolName.includes('k8s') || toolName.includes('deploy') || toolName.includes('cluster'))
      return 'kubernetes';
    if (toolName.includes('workflow') || toolName.includes('start')) return 'orchestration';
    return 'utility';
  }

  /**
   * Check if resources have been registered
   */
  isResourcesRegistered(): boolean {
    return this.isRegistered;
  }
}
