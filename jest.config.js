import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  
  // Multiple test configurations for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/test/unit/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/unit-setup.ts'],
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
    },
    {
      displayName: 'integration',
      testMatch: ['**/test/integration/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/integration-setup.ts'],
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
    },
    {
      displayName: 'e2e',
      testMatch: ['**/test/e2e/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/e2e-setup.ts'],
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
    },
  ],
  
  // Global configuration
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
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    },
    './src/tools/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/workflows/': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Handle .js imports and map them to .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
    
    // Test fixtures and helpers
    '^@fixtures/(.*)$': '<rootDir>/test/fixtures/$1',
    '^@helpers/(.*)$': '<rootDir>/test/helpers/$1',
    '^@mocks/(.*)$': '<rootDir>/test/mocks/$1',
    
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
    
    // MCP resources - map .js imports to .ts files (specific patterns)
    '^\\.\\.\/\\.\\.\/src\/mcp\/resources\/(.*)\\.js$': '<rootDir>/src/mcp/resources/$1.ts',
    '^\\.\\.\/\\.\\.\/src\/mcp\/events\/(.*)\\.js$': '<rootDir>/src/mcp/events/$1.ts',
    '^\\.\\.\/\\.\\.\/\\.\\.\/src\/workflows\/(.*)\\.js$': '<rootDir>/src/workflows/$1.ts',
    '^\\.\\.\/\\.\\.\/types\/core\\.js$': '<rootDir>/src/types/core.ts',
    '^\\.\/types\\.js$': '<rootDir>/src/mcp/resources/types.ts',
    '^\\.\/uri-schemes\\.js$': '<rootDir>/src/mcp/resources/uri-schemes.ts',
    '^\\.\/cache\\.js$': '<rootDir>/src/mcp/resources/cache.ts',
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
  
  // Global setup and teardown  
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
};