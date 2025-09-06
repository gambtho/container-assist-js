/**
 * Standardized Logger Utility
 *
 * Simple wrapper around Pino logger with helper functions
 * Avoids creating yet another logger interface - just use Pino!
 */

import pino from 'pino';

// Re-export Pino types directly - no custom Logger interface needed!
export type { Logger } from 'pino';
export { pino };

/**
 * Create a Pino logger with sensible defaults for containerization assist
 */
export function createLogger(options: pino.LoggerOptions = {}): pino.Logger {
  // When running as MCP server, output to stderr to avoid interfering with JSON-RPC protocol
  const isMCPMode = process.env.MCP_MODE === 'true' || process.argv.includes('--mcp');
  const transport = isMCPMode
    ? pino.transport({
        target: 'pino/file',
        options: { destination: 2 }, // 2 is stderr
      })
    : undefined;

  return pino(
    {
      name: 'containerization-assist',
      level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
      ...options,
    },
    transport,
  );
}

/**
 * Get or create a default logger instance (singleton)
 */
let defaultLogger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger();
  }
  return defaultLogger;
}

/**
 * Performance timer utility for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: pino.Logger;
  private operation: string;
  private context: Record<string, unknown>;

  constructor(logger: pino.Logger, operation: string, context: Record<string, unknown> = {}) {
    this.logger = logger;
    this.operation = operation;
    this.context = context;
    this.startTime = Date.now();

    this.logger.debug({ operation, ...context }, `Starting ${operation}`);
  }

  end(additionalContext: Record<string, unknown> = {}): void {
    const duration = Date.now() - this.startTime;

    this.logger.info(
      {
        operation: this.operation,
        duration_ms: duration,
        ...this.context,
        ...additionalContext,
      },
      `Completed ${this.operation} in ${duration}ms`,
    );
  }

  error(error: unknown, additionalContext: Record<string, unknown> = {}): void {
    const duration = Date.now() - this.startTime;

    this.logger.error(
      {
        operation: this.operation,
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...this.context,
        ...additionalContext,
      },
      `Failed ${this.operation} after ${duration}ms`,
    );
  }
}

/**
 * Create a performance timer for an operation
 */
export function createTimer(
  logger: pino.Logger,
  operation: string,
  context: Record<string, unknown> = {},
): PerformanceTimer {
  return new PerformanceTimer(logger, operation, context);
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(logger: pino.Logger, bindings: pino.Bindings): pino.Logger {
  return logger.child(bindings);
}

/**
 * Helper to create a logger for a specific component
 */
export function createComponentLogger(
  component: string,
  options?: pino.LoggerOptions,
): pino.Logger {
  const logger = createLogger(options);
  return logger.child({ component });
}

/**
 * Helper to create a logger for a specific tool
 */
export function createToolLogger(
  toolName: string,
  sessionId?: string,
  options?: pino.LoggerOptions,
): pino.Logger {
  const logger = createLogger(options);
  const bindings: pino.Bindings = { component: 'tool', tool: toolName };

  if (sessionId) {
    bindings.sessionId = sessionId;
  }

  return logger.child(bindings);
}
