/**
 * Logger configuration for the Container Kit MCP Server
 * Uses Pino for high-performance structured logging
 * SINGLE SOURCE OF TRUTH - All logging must use this implementation
 */

import pino from 'pino'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Logger, LoggerOptions } from 'pino'

// Ensure log directory exists
try {
  mkdirSync('./.mcp/logs', { recursive: true })
} catch {
  // Directory already exists or cannot be created
}

export interface LoggerConfig {
  level?: string
  environment?: string
  pretty?: boolean
  logFile?: string
  service?: string
  version?: string
}

/**
 * Create a configured Pino logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  const isDevelopment = config?.environment === 'development' ||
                        process.env.NODE_ENV === 'development'

  const level = config?.level || process.env.LOG_LEVEL || 'info'

  const options: LoggerOptions = {
    level,
    redact: {
      paths: [
        'password', 'token', 'key', 'secret',
        'authorization', 'api_key', 'apiKey',
        'auth', 'credentials',
        '*.password', '*.token', '*.secret'
      ],
      censor: '[REDACTED]'
    },
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
      service: config?.service || 'container-kit-mcp',
      version: config?.version || '2.0.0'
    },
    formatters: {
      level: (label) => {
        return { level: label }
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res
    }
  }

  // In development, use pretty printing
  if (isDevelopment && config?.pretty !== false) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
          errorProps: 'stack,cause'
        }
      }
    })
  }

  // Production mode with optional file logging
  const destinations = []

  // Always log to stdout
  destinations.push(pino.destination(1))

  // Optionally log to file
  if (config?.logFile) {
    const logPath = join('./.mcp/logs', config.logFile)
    destinations.push(pino.destination(logPath))
  }

  return destinations.length > 1
    ? pino(options, pino.multistream(destinations))
    : pino(options)
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parent: Logger,
  context: Record<string, unknown>
): Logger {
  return parent.child(context)
}

/**
 * Default logger instance for immediate use
 * Export both as defaultLogger and logger for compatibility
 */
export const logger = createLogger({
  environment: process.env.NODE_ENV || 'development'
})

export const defaultLogger = logger


