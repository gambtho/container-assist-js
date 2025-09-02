// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.SILENT_TESTS = 'true';

// Global test utilities
(global as any).testTimeout = 30000;

// Export empty object to make this a module
export {};