import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          moduleResolution: 'bundler',
          target: 'ES2022',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          isolatedModules: true
        },
      },
    ],
  },
  // Performance optimizations
  maxWorkers: '50%',  // Use half of available CPU cores
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  testMatch: [
    '**/test/**/*.test.ts',
    '**/test/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Handle specific .js imports and map them to .ts
    // Infrastructure logger fix for test setup (exact path from test/setup.ts)
    '^\\.\\.\/src\/infrastructure\/logger\\.js$': '<rootDir>/src/infrastructure/logger.ts',
    '^\\.\\.\/src\/infrastructure\/core\/logger\\.js$': '<rootDir>/src/infrastructure/logger.ts',
    '^\\.\\.\/\\.\\.\/infrastructure\/core\/logger\\.js$': '<rootDir>/src/infrastructure/logger.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/infrastructure\/core\/logger\\.js$': '<rootDir>/src/infrastructure/logger.ts',
    
    // Relative imports from domain/types/errors
    '^\\.\\.\/errors\/index\\.js$': '<rootDir>/src/domain/types/errors/index.ts',
    '^\\.\\.\/\\.\\.\/errors\/index\\.js$': '<rootDir>/src/domain/types/errors/index.ts',  
    '^\\.\\.\/\\.\\.\/\\.\\.\/errors\/index\\.js$': '<rootDir>/src/domain/types/errors/index.ts',
    
    // Relative imports from src/errors - as seen from infrastructure directory
    '^\\.\\./errors/index\\.js$': '<rootDir>/src/errors/index.ts',
    '^\\.\\.\/\\.\\./errors/index\\.js$': '<rootDir>/src/errors/index.ts',
    '^\\.\\.\/\\.\\.\/\\.\\./errors/index\\.js$': '<rootDir>/src/errors/index.ts',
    
    // Also handle src/errors/index imports from test directories
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/errors\/index$': '<rootDir>/src/errors/index.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/errors\/index\\.js$': '<rootDir>/src/errors/index.ts',
    
    // Contract type errors
    '^\\.\\.\/contracts\/types\/errors\\.js$': '<rootDir>/src/contracts/types/errors.ts',
    '^\\.\\.\/\\.\\.\/contracts\/types\/errors\\.js$': '<rootDir>/src/contracts/types/errors.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/contracts\/types\/errors\\.js$': '<rootDir>/src/contracts/types/errors.ts',
    
    // Infrastructure module mappings
    '^\\.\\.\/command-executor\\.js$': '<rootDir>/src/infrastructure/command-executor.ts',
    '^\\.\\.\/\\.\\.\/command-executor\\.js$': '<rootDir>/src/infrastructure/command-executor.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/command-executor$': '<rootDir>/src/infrastructure/command-executor.ts',
    
    // Scanner mappings (from test/unit/infrastructure directories)
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/scanners\/trivy-scanner$': '<rootDir>/src/infrastructure/scanners/trivy-scanner.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/scanners\/trivy-scanner\\.js$': '<rootDir>/src/infrastructure/scanners/trivy-scanner.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/scanners\/trivy-scanner$': '<rootDir>/src/infrastructure/scanners/trivy-scanner.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/scanners\/trivy-scanner\\.js$': '<rootDir>/src/infrastructure/scanners/trivy-scanner.ts',
    
    // Docker and Kubernetes client mappings
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/docker-client$': '<rootDir>/src/infrastructure/docker-client.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/infrastructure\/kubernetes-client$': '<rootDir>/src/infrastructure/kubernetes-client.ts',
    
    // Domain type imports
    '^\\.\\.\/\\.\\.\/domain\/types\/result\\.js$': '<rootDir>/src/domain/types/result.ts',
    
    // Helper imports
    '^\\.\/helper\\.js$': './helper.ts',
    '^\\.\\.\/helper\\.js$': '../helper.ts',
  },
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  
  // Timeout handling for different test types
  testTimeout: 30000,  // Default 30s (reduced from 60s)
  
  // Better error reporting
  verbose: false,  // Reduce noise for CI
  silent: false,
  
  // Fail fast for development
  bail: false,  // Continue running tests to get full picture
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};