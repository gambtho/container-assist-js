/**
 * Test utility for creating mock loggers
 * 
 * @deprecated Use createMockLogger from test-helpers.ts instead
 */

import { createMockLogger } from './test-helpers.js';

// Re-export the consolidated mock logger for backwards compatibility
export const createLogger = createMockLogger;