/**
 * Performance Test Setup
 * Configuration for performance test suite
 */

import { jest } from '@jest/globals';

// Set longer timeout for performance tests
jest.setTimeout(60000);

// Performance test configuration
export const PERFORMANCE_CONFIG = {
  iterations: process.env.CI ? 5 : 3,
  warmupIterations: 1,
  timeout: 60000,
  thresholds: {
    p50: 1000,
    p90: 2000,
    p99: 5000,
  },
};

// Mock any external services that might impact performance measurements
beforeAll(() => {
  // Disable console output during performance tests to reduce noise
  if (process.env.SILENT_PERF_TESTS === 'true') {
    global.console = {
      ...console,
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }
});

afterAll(() => {
  // Restore console if it was mocked
  if (process.env.SILENT_PERF_TESTS === 'true') {
    global.console = console;
  }
});