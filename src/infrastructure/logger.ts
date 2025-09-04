/**
 * Pino logger configuration and factory functions
 */

import pino, { type Logger, type LoggerOptions } from 'pino';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Ensure log directory exists
try {
  mkdirSync('./.mcp/logs', { recursive: true });
} catch {
  // Directory already exists or cannot be created
}

export interface PinoConfig {
  level?: string;
  environment?: string;
  pretty?: boolean;
  logFile?: string;
  service?: string;
  version?: string;
  useStderr?: boolean; // Use stderr instead of stdout (for MCP stdio transport)
}

/**
 * Create a configured Pino logger instance
 */
export function createPinoLogger(config?: PinoConfig): Logger {
  const isDevelopment =
    config?.environment === 'development' || process.env.NODE_ENV === 'development';

  const level = config?.level ?? process.env.LOG_LEVEL ?? 'info';

  const options: LoggerOptions = {
    level,
    redact: {
      paths: [
        'password',
        'token',
        'key',
        'secret',
        'authorization',
        'api_key',
        'apiKey',
        'auth',
        'credentials',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME ?? 'localhost',
      service: config?.service ?? 'containerization-assist-mcp',
      version: config?.version ?? '2.0.0',
    },
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  };

  // In development, use pretty printing but disable colors for MCP transport
  if (isDevelopment && config?.pretty !== false) {
    const prettyTransport = {
      target: 'pino-pretty',
      options: {
        colorize: !config?.useStderr, // Disable colors when using stderr for MCP
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        singleLine: false,
        errorProps: 'stack,cause',
      },
    };

    if (config?.useStderr) {
      return pino(
        {
          ...options,
          transport: prettyTransport,
        },
        pino.destination(2),
      ); // Force to stderr
    } else {
      return pino({
        ...options,
        transport: prettyTransport,
      });
    }
  }

  // Production mode with optional file logging
  const destinations = [];

  // For MCP transport, completely disable stdout/stderr logging to avoid protocol interference
  if (config?.useStderr) {
    // Log to a file only for MCP mode to avoid any stdout/stderr interference
    const logPath = join('./.mcp/logs', 'mcp-server.log');
    destinations.push(pino.destination(logPath));
  } else {
    // Log to stdout for normal operation
    destinations.push(pino.destination(1));
  }

  // Optionally log to file
  if (config?.logFile) {
    const logPath = join('./.mcp/logs', config.logFile);
    destinations.push(pino.destination(logPath));
  }

  return destinations.length > 1 ? pino(options, pino.multistream(destinations)) : pino(options);
}

/**
 * Default logger instance - always use stderr to avoid MCP protocol interference
 */
export const defaultPinoLogger = createPinoLogger({
  environment: process.env.NODE_ENV ?? 'development',
  useStderr: true,
});
