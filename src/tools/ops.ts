/**
 * Ops Tool - Flat Architecture
 *
 * Provides operational utilities like ping and server status
 * Follows architectural requirement: only imports from src/lib/
 */

import * as os from 'os';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../core/types';

interface PingConfig {
  message?: string;
}

interface PingResult {
  success: boolean;
  message: string;
  timestamp: string;
  server: {
    name: string;
    version: string;
    uptime: number;
    pid: number;
  };
  capabilities: {
    tools: boolean;
    sampling: boolean;
    progress: boolean;
  };
}

/**
 * Ping operation - test server connectivity
 */
async function ping(config: PingConfig, logger: Logger): Promise<Result<PingResult>> {
  const timer = createTimer(logger, 'ops-ping');

  try {
    const { message = 'ping' } = config;

    logger.info({ message }, 'Processing ping request');

    const result: PingResult = {
      success: true,
      message: `pong: ${message}`,
      timestamp: new Date().toISOString(),
      server: {
        name: 'containerization-assist-mcp',
        version: '2.0.0',
        uptime: process.uptime(),
        pid: process.pid,
      },
      capabilities: {
        tools: true,
        sampling: true,
        progress: true,
      },
    };

    timer.end();
    return Success(result);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Ping failed');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

interface ServerStatusConfig {
  details?: boolean;
}

interface ServerStatusResult {
  success: boolean;
  version: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    free: number;
    percentage: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadAverage: number[];
  };
  system: {
    platform: string;
    release: string;
    hostname: string;
  };
  tools: {
    count: number;
    migrated: number;
  };
  sessions?: number;
}

/**
 * Get server status
 */
async function serverStatus(
  config: ServerStatusConfig,
  logger: Logger,
): Promise<Result<ServerStatusResult>> {
  const timer = createTimer(logger, 'ops-server-status');

  try {
    const { details = false } = config;

    logger.info({ details }, 'Server status requested');

    const uptime = Math.floor(process.uptime());
    const version = '2.0.0';
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercentage = Math.round((usedMem / totalMem) * 100);

    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    const migratedToolCount = 12;

    const status: ServerStatusResult = {
      success: true,
      version,
      uptime,
      memory: {
        used: usedMem,
        total: totalMem,
        free: freeMem,
        percentage: memPercentage,
      },
      cpu: {
        model: cpus[0]?.model ?? 'unknown',
        cores: cpus.length,
        loadAverage,
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        hostname: os.hostname(),
      },
      tools: {
        count: 14,
        migrated: migratedToolCount,
      },
    };

    logger.info(
      {
        uptime,
        memoryUsed: usedMem,
        memoryPercentage: memPercentage,
        toolsMigrated: migratedToolCount,
      },
      'Server status compiled',
    );

    timer.end();
    return Success(status);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Error collecting server status');
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

// Combined ops interface
export interface OpsConfig {
  operation: 'ping' | 'status';
  message?: string;
  details?: boolean;
}

export type OpsResult = PingResult | ServerStatusResult;

/**
 * Main ops function that delegates to specific operations
 */
async function ops(config: OpsConfig, logger: Logger): Promise<Result<OpsResult>> {
  const { operation } = config;

  switch (operation) {
    case 'ping':
      return ping({ ...(config.message !== undefined && { message: config.message }) }, logger);
    case 'status':
      return serverStatus(
        { ...(config.details !== undefined && { details: config.details }) },
        logger,
      );
    default:
      return Failure(`Unknown operation: ${config.operation}`);
  }
}

/**
 * Ops tool instance
 */
export const opsTool = {
  name: 'ops',
  execute: (config: OpsConfig, logger: Logger) => ops(config, logger),
};
