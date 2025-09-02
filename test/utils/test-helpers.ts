import { jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Config } from '@service/config/config.js';
import { Dependencies } from '@service/dependencies.js';
import { createLogger } from '@infrastructure/core/logger.js';
import type { Logger } from '@infrastructure/core/logger-types.js';

export interface TestContext {
  config: Config;
  logger: Logger;
  server: Server;
  deps: Dependencies;
}

export function createTestContext(overrides?: Partial<any>): TestContext {
  const config = new Config({
    features: {
      mockMode: true,
      ...overrides?.features
    },
    nodeEnv: 'test',
    logLevel: 'error',
    ...overrides
  });
  
  const logger = createLogger({
    level: 'error',
    pretty: false
  });
  
  const server = new Server(
    { name: 'test-server', version: '1.0.0' },
    { capabilities: { tools: {}, sampling: {} } }
  );
  
  const deps = new Dependencies({
    config: {
      workspaceDir: '/tmp/test-workspace',
      session: {
        store: 'memory',
        ttl: 300,
        maxSessions: 100,
      },
      docker: {
        socketPath: '/var/run/docker.sock',
      },
      kubernetes: {
        namespace: 'test',
      },
      features: {
        aiEnabled: false,
        mockMode: true,
      }
    },
    logger,
    mcpServer: server
  });
  
  return { config, logger, server, deps };
}

export async function cleanupTestContext(context: TestContext): Promise<void> {
  try {
    await context.deps.cleanup();
  } catch (error) {
    // Ignore cleanup errors in tests
  }
}

export function createMockLogger(): Logger {
  // Create a proper recursive mock logger
  const mockLogger: Logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn((meta: Record<string, any>) => {
      // Return a new mock logger for each child call
      return createMockLogger();
    })
  };
  
  return mockLogger;
}

/**
 * Helper to wait for async operations to complete
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Helper to create temporary directories for tests
 */
export function createTempDir(): string {
  const tmpDir = `/tmp/test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return tmpDir;
}

/**
 * Helper to create mock performance metrics
 */
export function createMockPerformanceMetrics() {
  return {
    duration: Math.random() * 100,
    memory: Math.random() * 50,
    cpu: Math.random() * 10,
    timestamp: new Date().toISOString()
  };
}

/**
 * Helper to create mock session data
 */
export function createMockSessionData(overrides?: Record<string, any>) {
  return {
    id: `test-session-${Date.now()}`,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

/**
 * Helper to measure execution time
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Performance testing utilities
 */
export interface PerformanceStatistics {
  min: number;
  max: number;
  median: number;
  mean: number;
  p95: number;
  p99: number;
}

export function calculateStatistics(measurements: number[]): PerformanceStatistics {
  const sorted = [...measurements].sort((a, b) => a - b);
  const len = sorted.length;

  return {
    min: sorted[0],
    max: sorted[len - 1],
    median: len % 2 === 0 ? (sorted[len / 2 - 1] + sorted[len / 2]) / 2 : sorted[Math.floor(len / 2)],
    mean: measurements.reduce((sum, val) => sum + val, 0) / len,
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)]
  };
}

export function determinePerformanceStatus(
  current: number, 
  excellent: number, 
  good: number, 
  warning: number,
  lowerIsBetter = false
): 'excellent' | 'good' | 'warning' | 'critical' {
  if (lowerIsBetter) {
    if (current <= excellent) return 'excellent';
    if (current <= good) return 'good';
    if (current <= warning) return 'warning';
    return 'critical';
  } else {
    if (current >= excellent) return 'excellent';
    if (current >= good) return 'good';
    if (current >= warning) return 'warning';
    return 'critical';
  }
}

/**
 * Create a mock performance benchmark result
 */
export interface BenchmarkResult {
  name: string;
  category: string;
  duration: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  baseline: number;
  target: number;
}

export function createMockBenchmark(overrides?: Partial<BenchmarkResult>): BenchmarkResult {
  const duration = Math.random() * 50 + 10;
  const baseline = 100;
  const target = 50;
  
  return {
    name: 'test-benchmark',
    category: 'performance',
    duration,
    status: determinePerformanceStatus(duration, target, baseline, baseline * 2, true),
    baseline,
    target,
    ...overrides
  };
}