/**
 * Test logger utilities - compatible with unified logger interface
 * 
 * @deprecated Use createMockLogger from test-helpers.ts instead
 */

import { createMockLogger } from './test-helpers.js';

// Re-export the consolidated mock logger
export { createMockLogger };

// Alias for backwards compatibility
export const createTestLogger = createMockLogger;