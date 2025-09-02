/**
 * Default Configuration Values
 * 
 * Provides default configurations for different environments (dev, prod, test)
 * and base configuration that all profiles inherit from.
 */

import type { ApplicationConfig, ConfigurationProfile } from './types.js'
import * as path from 'path'

// Base configuration that all profiles inherit
export const BASE_CONFIG: ApplicationConfig = {
  server: {
    nodeEnv: 'development',
    logLevel: 'info',
    port: 3000,
    host: 'localhost',
    shutdownTimeout: 10000
  },
  mcp: {
    storePath: './data/sessions.db',
    sessionTTL: '24h',
    maxSessions: 100,
    enableMetrics: true,
    enableEvents: true
  },
  workspace: {
    workspaceDir: '/tmp/container-kit-workspace',
    tempDir: '/tmp/containerkit',
    cleanupOnExit: true
  },
  session: {
    store: 'memory',
    ttl: 86400000, // 24 hours in milliseconds
    maxSessions: 100,
    persistencePath: './data/sessions',
    persistenceInterval: 60000, // 1 minute
    cleanupInterval: 300000 // 5 minutes
  },
  logging: {
    level: 'info',
    format: 'json',
    destination: 'console',
    filePath: './logs/containerkit.log',
    maxFileSize: '10MB',
    maxFiles: 5,
    enableColors: true
  },
  infrastructure: {
    docker: {
      socketPath: '/var/run/docker.sock',
      registry: 'localhost:5000',
      timeout: 30000,
      apiVersion: '1.41',
      buildArgs: {}
    },
    kubernetes: {
      kubeconfig: '~/.kube/config',
      namespace: 'default',
      timeout: 30000,
      dryRun: false
    },
    scanning: {
      enabled: true,
      scanner: 'trivy',
      severityThreshold: 'medium',
      failOnVulnerabilities: false,
      skipUpdate: false,
      timeout: 300000 // 5 minutes
    },
    build: {
      enableCache: true,
      parallel: true,
      maxParallel: 4,
      buildArgs: {},
      labels: {},
      squash: false
    },
    java: {
      defaultVersion: '17',
      defaultJvmHeapPercentage: 75,
      enableNativeImage: false,
      enableJmx: false,
      enableProfiling: false
    }
  },
  aiServices: {
    ai: {
      apiKey: '',
      model: 'claude-3-haiku',
      baseUrl: 'https://api.anthropic.com',
      timeout: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      temperature: 0.7,
      maxTokens: 4096
    },
    sampler: {
      mode: 'auto',
      templateDir: './prompts/templates',
      cacheEnabled: true,
      retryAttempts: 3,
      retryDelayMs: 1000
    },
    mock: {
      enabled: false,
      responsesDir: './test/fixtures/mock-responses',
      deterministicMode: false,
      simulateLatency: true,
      errorRate: 0.0,
      latencyRange: {
        min: 100,
        max: 500
      }
    }
  },
  workflow: {
    mode: 'interactive',
    autoRetry: true,
    maxRetries: 3,
    retryDelayMs: 1000,
    parallelSteps: false,
    skipOptionalSteps: false
  },
  features: {
    aiEnabled: true,
    mockMode: false,
    enableMetrics: true,
    enableEvents: true,
    enablePerformanceMonitoring: false,
    enableDebugLogs: false,
    nonInteractive: false
  }
}

// Development Profile
export const DEVELOPMENT_PROFILE: ConfigurationProfile = {
  name: 'development',
  description: 'Development environment with debug features enabled',
  config: {
    server: {
      nodeEnv: 'development',
      logLevel: 'debug'
    },
    logging: {
      level: 'debug',
      format: 'pretty',
      destination: 'console',
      enableColors: true
    },
    features: {
      aiEnabled: true,
      mockMode: false,
      enableMetrics: true,
      enableEvents: true,
      enablePerformanceMonitoring: true,
      enableDebugLogs: true,
      nonInteractive: false
    },
    infrastructure: {
      scanning: {
        enabled: true,
        scanner: 'trivy',
        severityThreshold: 'medium',
        failOnVulnerabilities: false,
        skipUpdate: false,
        timeout: 300000
      }
    },
    aiServices: {
      mock: {
        enabled: false,
        deterministicMode: false,
        simulateLatency: false,
        errorRate: 0.0
      }
    },
    workspace: {
      workspaceDir: '/tmp/container-kit-workspace-dev',
      tempDir: '/tmp/containerkit-dev',
      cleanupOnExit: false // Keep files for debugging
    }
  }
}

// Production Profile
export const PRODUCTION_PROFILE: ConfigurationProfile = {
  name: 'production',
  description: 'Production environment with optimized settings',
  config: {
    server: {
      nodeEnv: 'production',
      logLevel: 'warn'
    },
    logging: {
      level: 'warn',
      format: 'json',
      destination: 'both',
      enableColors: false
    },
    session: {
      store: 'file',
      ttl: 86400000,
      maxSessions: 500,
      persistenceInterval: 30000 // More frequent saves in prod
    },
    features: {
      aiEnabled: true,
      mockMode: false,
      enableMetrics: true,
      enableEvents: true,
      enablePerformanceMonitoring: true,
      enableDebugLogs: false,
      nonInteractive: false
    },
    infrastructure: {
      scanning: {
        enabled: true,
        scanner: 'trivy',
        severityThreshold: 'high',
        failOnVulnerabilities: true,
        skipUpdate: false,
        timeout: 300000
      },
      build: {
        enableCache: true,
        parallel: true,
        maxParallel: 8
      }
    },
    aiServices: {
      mock: {
        enabled: false,
        deterministicMode: false,
        simulateLatency: false,
        errorRate: 0.0
      },
      ai: {
        apiKey: '',
        model: 'claude-3-haiku',
        baseUrl: 'https://api.anthropic.com',
        timeout: 60000, // Longer timeout for production
        retryAttempts: 5
      }
    },
    workspace: {
      workspaceDir: '/tmp/container-kit-workspace-prod',
      tempDir: '/tmp/containerkit-prod',
      cleanupOnExit: true
    }
  }
}

// Test Profile
export const TEST_PROFILE: ConfigurationProfile = {
  name: 'test',
  description: 'Test environment with mocking and fast execution',
  config: {
    server: {
      nodeEnv: 'test',
      logLevel: 'error' // Minimal logging in tests
    },
    logging: {
      level: 'error',
      format: 'json',
      destination: 'console',
      enableColors: false
    },
    session: {
      store: 'memory',
      ttl: 60000, // Short TTL for tests
      maxSessions: 10
    },
    features: {
      aiEnabled: false,
      mockMode: true,
      enableMetrics: false,
      enableEvents: false,
      enablePerformanceMonitoring: false,
      enableDebugLogs: false,
      nonInteractive: true
    },
    infrastructure: {
      scanning: {
        enabled: false, // Skip scanning in tests for speed
        scanner: 'trivy',
        severityThreshold: 'medium',
        failOnVulnerabilities: false,
        skipUpdate: true,
        timeout: 30000
      },
      build: {
        enableCache: false,
        parallel: false
      }
    },
    aiServices: {
      mock: {
        enabled: true,
        deterministicMode: true,
        simulateLatency: false,
        errorRate: 0.0
      },
      ai: {
        apiKey: '',
        model: 'claude-3-haiku',
        baseUrl: 'https://api.anthropic.com',
        timeout: 5000, // Fast timeout for tests
        retryAttempts: 1
      }
    },
    workspace: {
      workspaceDir: '/tmp/containerkit-test',
      tempDir: '/tmp/containerkit-test-temp',
      cleanupOnExit: true
    },
    workflow: {
      mode: 'batch',
      autoRetry: false,
      maxRetries: 0,
      retryDelayMs: 100,
      parallelSteps: false,
      skipOptionalSteps: true
    }
  }
}

// CI Profile (for continuous integration)
export const CI_PROFILE: ConfigurationProfile = {
  name: 'ci',
  description: 'Continuous Integration environment',
  config: {
    server: {
      nodeEnv: 'test',
      logLevel: 'info'
    },
    logging: {
      level: 'info',
      format: 'json',
      destination: 'console',
      enableColors: false
    },
    features: {
      aiEnabled: false,
      mockMode: true,
      enableMetrics: true,
      enableEvents: false,
      enablePerformanceMonitoring: false,
      enableDebugLogs: false,
      nonInteractive: true
    },
    infrastructure: {
      scanning: {
        enabled: true,
        scanner: 'trivy',
        severityThreshold: 'high',
        failOnVulnerabilities: true,
        skipUpdate: false,
        timeout: 600000 // 10 minutes for CI
      }
    },
    aiServices: {
      mock: {
        enabled: true,
        deterministicMode: true,
        simulateLatency: false,
        errorRate: 0.0
      }
    },
    workspace: {
      workspaceDir: '/tmp/containerkit-ci',
      tempDir: '/tmp/containerkit-ci-temp',
      cleanupOnExit: true
    }
  }
}

// All available profiles
export const CONFIGURATION_PROFILES = {
  development: DEVELOPMENT_PROFILE,
  production: PRODUCTION_PROFILE,
  test: TEST_PROFILE,
  ci: CI_PROFILE
}

// Get profile by name or return default
export function getProfile(name?: string): ConfigurationProfile {
  if (!name) {
    return DEVELOPMENT_PROFILE
  }
  
  return CONFIGURATION_PROFILES[name as keyof typeof CONFIGURATION_PROFILES] || DEVELOPMENT_PROFILE
}