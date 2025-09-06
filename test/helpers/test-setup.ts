/**
 * Simple Test Setup Helpers - De-Enterprise Refactoring
 *
 * Replaces complex integration test setup with simple, direct helpers.
 * No lifecycle management, registry patterns, or configuration methods.
 */

import { 
  setupSimpleMocks, 
  setupFailureMocks, 
  setupNetworkErrorMocks,
  mockSession,
  mockLogger,
} from '../mocks/simple-mocks';

/**
 * Standard test setup - use this for most tests
 */
export const setupTest = () => {
  const mocks = setupSimpleMocks();
  const session = mockSession();
  
  return {
    mocks,
    session,
    // Simple cleanup - no complex registry management
    cleanup: () => {
      // Jest automatically resets mocks between tests
      // No manual cleanup needed with simple approach
    },
  };
};

/**
 * Failure scenario test setup
 */
export const setupFailureTest = () => {
  const mocks = setupFailureMocks();
  const session = mockSession();
  
  return { mocks, session };
};

/**
 * Network error test setup
 */
export const setupNetworkErrorTest = () => {
  const mocks = setupNetworkErrorMocks();
  const session = mockSession();
  
  return { mocks, session };
};

/**
 * Minimal test setup for unit tests
 */
export const setupUnitTest = () => ({
  logger: mockLogger(),
  session: mockSession(),
});