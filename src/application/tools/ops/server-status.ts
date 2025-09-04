/**
 * Server Status Handler - MCP SDK Compatible Version
 * Provides detailed MCP server status and system information
 */

import { z } from 'zod';
import * as os from 'os';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Input schema
const ServerStatusInputSchema = z
  .object({
    include_system: z.boolean().default(true),
    includeSystem: z.boolean().optional(),
    include_sessions: z.boolean().default(true),
    includeSessions: z.boolean().optional(),
    include_dependencies: z.boolean().default(true),
    includeDependencies: z.boolean().optional(),
  })
  .transform((data) => ({
    includeSystem: data.include_system ?? data.includeSystem ?? true,
    includeSessions: data.include_sessions ?? data.includeSessions ?? true,
    includeDependencies: data.include_dependencies ?? data.includeDependencies ?? true,
  }));

// Output schema
const ServerStatusOutputSchema = z.object({
  success: z.boolean(),
  server: z.object({
    name: z.string(),
    version: z.string(),
    startTime: z.string(),
    uptime: z.number(),
    pid: z.number(),
    nodeVersion: z.string(),
  }),
  system: z
    .object({
      platform: z.string(),
      arch: z.string(),
      memory: z.object({
        used: z.number(),
        total: z.number(),
        free: z.number(),
      }),
      cpu: z.object({
        cores: z.number(),
        loadAverage: z.array(z.number()).optional(),
      }),
    })
    .optional(),
  sessions: z
    .object({
      active: z.number(),
      total: z.number(),
      expired: z.number().optional(),
    })
    .optional(),
  dependencies: z
    .object({
      sessionService: z.boolean(),
      dockerService: z.boolean(),
      kubernetesService: z.boolean(),
      aiService: z.boolean(),
      progressEmitter: z.boolean(),
    })
    .optional(),
  tools: z.object({
    registered: z.number(),
    categories: z.object({
      workflow: z.number(),
      orchestration: z.number(),
      utility: z.number(),
    }),
  }),
  health: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    issues: z.array(z.string()).optional(),
  }),
});

// Type aliases
type ServerStatusInput = z.infer<typeof ServerStatusInputSchema>;
type ServerStatusOutput = z.infer<typeof ServerStatusOutputSchema>;

/**
 * Get system information
 */
function getSystemInfo(): {
  platform: NodeJS.Platform;
  arch: string;
  memory: {
    used: number;
    total: number;
    free: number;
  };
  cpu: {
    cores: number;
    loadAverage?: number[];
  };
  } {
  const memUsage = process.memoryUsage();

  return {
    platform: process.platform,
    arch: process.arch,
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      free: memUsage.heapTotal - memUsage.heapUsed,
    },
    cpu: {
      cores: os.cpus().length,
      ...(process.platform !== 'win32' ? { loadAverage: os.loadavg() } : {}),
    },
  };
}

/**
 * Check dependency health
 */
function checkDependencyHealth(context: ToolContext): {
  sessionService: boolean;
  dockerService: boolean;
  kubernetesService: boolean;
  aiService: boolean;
  progressEmitter: boolean;
} {
  return {
    sessionService: !!context.sessionService,
    dockerService: !!context.dockerService,
    kubernetesService: !!context.kubernetesService,
    aiService: !!context.aiService,
    progressEmitter: !!context.progressEmitter,
  };
}

/**
 * Assess overall health
 */
function assessHealth(
  dependencies: ReturnType<typeof checkDependencyHealth>,
  system: ReturnType<typeof getSystemInfo>,
): { status: 'healthy' | 'degraded' | 'unhealthy'; issues?: string[] } {
  const issues: string[] = [];

  // Check critical dependencies
  if (!dependencies.sessionService) {
    issues.push('Session service not available');
  }

  // Check system resources
  if (system.memory.used / system.memory.total > 0.9) {
    issues.push('High memory usage (>90%)');
  }

  if (system.cpu.loadAverage?.[0] && system.cpu.loadAverage[0] > system.cpu.cores * 2) {
    issues.push('High CPU load');
  }

  // Determine status
  let status: 'healthy' | 'degraded' | 'unhealthy';

  if (issues.length === 0) {
    status = 'healthy';
  } else if (issues.some((i) => i.includes('not available') || i.includes('High'))) {
    status = 'unhealthy';
  } else {
    status = 'degraded';
  }

  const result: { status: 'healthy' | 'degraded' | 'unhealthy'; issues?: string[] } = { status };
  if (issues.length > 0) {
    result.issues = issues;
  }
  return result;
}

/**
 * Server status tool implementation using MCP SDK pattern
 */
const serverStatusTool: ToolDescriptor<ServerStatusInput, ServerStatusOutput> = {
  name: 'server_status',
  description: 'Get MCP server status and system information',
  category: 'utility',
  inputSchema: ServerStatusInputSchema,
  outputSchema: ServerStatusOutputSchema,

  handler: async (input: ServerStatusInput, context: ToolContext): Promise<ServerStatusOutput> => {
    const { logger, sessionService } = context;
    const { includeSystem, includeSessions, includeDependencies } = input;

    logger.info(
      {
        includeSystem,
        includeSessions,
        includeDependencies,
      },
      'Server status requested',
    );

    try {
      // Basic server info
      const server = {
        name: 'container-kit-mcp',
        version: '2.0.0',
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        nodeVersion: process.version,
      };

      // System info
      let system;
      if (includeSystem) {
        system = getSystemInfo();
      }

      // Session info
      let sessions;
      if (includeSessions && sessionService) {
        try {
          const activeCount = await sessionService.getActiveCount();
          sessions = {
            active: activeCount,
            total: activeCount, // Would be tracked separately in real implementation
            expired: 0,
          };
        } catch (error) {
          logger.warn({ error }, 'Failed to get session info');
          sessions = {
            active: 0,
            total: 0,
            expired: 0,
          };
        }
      }

      // Dependencies info
      let dependencies;
      if (includeDependencies === true) {
        dependencies = checkDependencyHealth(context);
      }

      // Tool registry info
      const tools = {
        registered: 15, // Total tools available
        categories: {
          workflow: 9,
          orchestration: 2,
          utility: 3,
        },
      };

      // Health assessment
      const health =
        system && dependencies
          ? assessHealth(dependencies, system)
          : { status: 'healthy' as const, issues: undefined };

      const status: ServerStatusOutput = {
        success: true,
        server,
        system,
        sessions,
        dependencies,
        tools,
        health,
      };

      logger.info(
        {
          health: health.status,
          issues: health.issues?.length ?? 0,
        },
        'Server status compiled',
      );

      return status;
    } catch (error) {
      logger.error({ error }, 'Error collecting server status');

      // Return minimal status even on error
      return {
        success: false,
        server: {
          name: 'container-kit-mcp',
          version: '2.0.0',
          startTime: new Date().toISOString(),
          uptime: 0,
          pid: process.pid,
          nodeVersion: process.version,
        },
        tools: {
          registered: 15,
          categories: {
            workflow: 9,
            orchestration: 2,
            utility: 3,
          },
        },
        health: {
          status: 'unhealthy',
          issues: ['Failed to collect server status'],
        },
      };
    }
  },
};

// Default export for registry
export default serverStatusTool;

// Export types if needed elsewhere
export type { ServerStatusInput, ServerStatusOutput };
