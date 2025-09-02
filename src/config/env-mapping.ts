/**
 * Environment Variable Mapping
 * 
 * Defines the mapping between environment variables and configuration paths.
 * Uses standardized CONTAINERKIT_ prefix for all environment variables.
 */

import type { EnvironmentMapping } from './types.js'

export const ENVIRONMENT_MAPPING: EnvironmentMapping = {
  // Server Configuration
  'NODE_ENV': {
    path: 'server.nodeEnv',
    type: 'string',
    default: 'development',
    required: false,
    description: 'Application environment (development, production, test)'
  },
  'LOG_LEVEL': {
    path: 'server.logLevel', 
    type: 'string',
    default: 'info',
    required: false,
    description: 'Log level (error, warn, info, debug, trace)'
  },
  'CONTAINERKIT_PORT': {
    path: 'server.port',
    type: 'number',
    default: 3000,
    required: false,
    description: 'Server port number'
  },
  'CONTAINERKIT_HOST': {
    path: 'server.host',
    type: 'string',
    default: 'localhost',
    required: false,
    description: 'Server host address'
  },

  // MCP Configuration
  'MCP_STORE_PATH': {
    path: 'mcp.storePath',
    type: 'string',
    default: './data/sessions.db',
    required: false,
    description: 'Path to MCP session store'
  },
  'SESSION_TTL': {
    path: 'session.ttl',
    type: 'string',
    default: '24h',
    required: false,
    description: 'Session time-to-live (e.g., 24h, 30m, 3600s)'
  },
  'MAX_SESSIONS': {
    path: 'session.maxSessions',
    type: 'number',
    default: 100,
    required: false,
    description: 'Maximum number of concurrent sessions'
  },

  // Workspace Configuration
  'WORKSPACE_DIR': {
    path: 'workspace.workspaceDir',
    type: 'string',
    default: '/tmp/container-kit-workspace',
    required: false,
    description: 'Working directory for containerization operations'
  },
  'CONTAINERKIT_TEMP_DIR': {
    path: 'workspace.tempDir',
    type: 'string',
    default: '/tmp/containerkit',
    required: false,
    description: 'Temporary directory for intermediate files'
  },

  // Docker Configuration
  'DOCKER_SOCKET': {
    path: 'infrastructure.docker.socketPath',
    type: 'string',
    default: '/var/run/docker.sock',
    required: false,
    description: 'Docker daemon socket path'
  },
  'DOCKER_REGISTRY': {
    path: 'infrastructure.docker.registry',
    type: 'string',
    default: 'localhost:5000',
    required: false,
    description: 'Default container registry'
  },
  'DOCKER_HOST': {
    path: 'infrastructure.docker.host',
    type: 'string',
    required: false,
    description: 'Docker daemon host (if not using socket)'
  },
  'DOCKER_API_VERSION': {
    path: 'infrastructure.docker.apiVersion',
    type: 'string',
    default: '1.41',
    required: false,
    description: 'Docker API version'
  },

  // Kubernetes Configuration
  'KUBECONFIG': {
    path: 'infrastructure.kubernetes.kubeconfig',
    type: 'string',
    default: '~/.kube/config',
    required: false,
    description: 'Kubernetes configuration file path'
  },
  'K8S_NAMESPACE': {
    path: 'infrastructure.kubernetes.namespace',
    type: 'string',
    default: 'default',
    required: false,
    description: 'Default Kubernetes namespace'
  },
  'K8S_CONTEXT': {
    path: 'infrastructure.kubernetes.context',
    type: 'string',
    required: false,
    description: 'Kubernetes context to use'
  },

  // AI Configuration
  'AI_API_KEY': {
    path: 'aiServices.ai.apiKey',
    type: 'string',
    default: '',
    required: false,
    description: 'API key for AI service'
  },
  'AI_MODEL': {
    path: 'aiServices.ai.model',
    type: 'string',
    default: 'claude-3-haiku',
    required: false,
    description: 'AI model to use'
  },
  'AI_BASE_URL': {
    path: 'aiServices.ai.baseUrl',
    type: 'string',
    default: 'https://api.anthropic.com',
    required: false,
    description: 'Base URL for AI service'
  },
  'AI_TIMEOUT': {
    path: 'aiServices.ai.timeout',
    type: 'number',
    default: 30000,
    required: false,
    description: 'AI service timeout in milliseconds'
  },

  // MCP Sampler Configuration
  'MCP_SAMPLER_MODE': {
    path: 'aiServices.sampler.mode',
    type: 'string',
    default: 'auto',
    required: false,
    description: 'MCP sampler mode (auto, mock, real)'
  },
  'MCP_TEMPLATE_DIR': {
    path: 'aiServices.sampler.templateDir',
    type: 'string',
    default: './prompts/templates',
    required: false,
    description: 'Directory containing prompt templates'
  },
  'MCP_CACHE_ENABLED': {
    path: 'aiServices.sampler.cacheEnabled',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable MCP response caching'
  },
  'MCP_RETRY_ATTEMPTS': {
    path: 'aiServices.sampler.retryAttempts',
    type: 'number',
    default: 3,
    required: false,
    description: 'Number of retry attempts for MCP calls'
  },
  'MCP_RETRY_DELAY_MS': {
    path: 'aiServices.sampler.retryDelayMs',
    type: 'number',
    default: 1000,
    required: false,
    description: 'Delay between retries in milliseconds'
  },

  // Mock Configuration
  'MOCK_MODE': {
    path: 'features.mockMode',
    type: 'boolean',
    default: false,
    required: false,
    description: 'Enable mock mode for testing'
  },
  'MOCK_RESPONSES_DIR': {
    path: 'aiServices.mock.responsesDir',
    type: 'string',
    required: false,
    description: 'Directory containing mock AI responses'
  },
  'MOCK_DETERMINISTIC': {
    path: 'aiServices.mock.deterministicMode',
    type: 'boolean',
    default: false,
    required: false,
    description: 'Use deterministic mock responses'
  },
  'MOCK_SIMULATE_LATENCY': {
    path: 'aiServices.mock.simulateLatency',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Simulate network latency in mock mode'
  },
  'MOCK_ERROR_RATE': {
    path: 'aiServices.mock.errorRate',
    type: 'number',
    default: 0.0,
    required: false,
    description: 'Error rate for mock responses (0.0 - 1.0)'
  },
  'MOCK_LATENCY_MIN': {
    path: 'aiServices.mock.latencyRange.min',
    type: 'number',
    default: 100,
    required: false,
    description: 'Minimum simulated latency in milliseconds'
  },
  'MOCK_LATENCY_MAX': {
    path: 'aiServices.mock.latencyRange.max',
    type: 'number',
    default: 500,
    required: false,
    description: 'Maximum simulated latency in milliseconds'
  },

  // Java Configuration
  'DEFAULT_JAVA_VERSION': {
    path: 'infrastructure.java.defaultVersion',
    type: 'string',
    default: '17',
    required: false,
    description: 'Default Java version for containerization'
  },
  'DEFAULT_JVM_HEAP_PERCENTAGE': {
    path: 'infrastructure.java.defaultJvmHeapPercentage',
    type: 'number',
    default: 75,
    required: false,
    description: 'Default JVM heap percentage of container memory'
  },
  'ENABLE_NATIVE_IMAGE': {
    path: 'infrastructure.java.enableNativeImage',
    type: 'boolean',
    default: false,
    required: false,
    description: 'Enable GraalVM native image builds'
  },

  // Workflow Configuration
  'WORKFLOW_MODE': {
    path: 'workflow.mode',
    type: 'string',
    default: 'interactive',
    required: false,
    description: 'Workflow execution mode (interactive, auto, batch)'
  },
  'AUTO_RETRY': {
    path: 'workflow.autoRetry',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable automatic retry on failures'
  },
  'MAX_RETRIES': {
    path: 'workflow.maxRetries',
    type: 'number',
    default: 3,
    required: false,
    description: 'Maximum number of retry attempts'
  },

  // Feature Flags
  'ENABLE_METRICS': {
    path: 'features.enableMetrics',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable performance metrics collection'
  },
  'ENABLE_EVENTS': {
    path: 'features.enableEvents',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable event publishing'
  },
  'NON_INTERACTIVE': {
    path: 'features.nonInteractive',
    type: 'boolean',
    default: false,
    required: false,
    description: 'Run in non-interactive mode'
  },
  'DEBUG_LOGS': {
    path: 'features.enableDebugLogs',
    type: 'boolean',
    default: false,
    required: false,
    description: 'Enable debug logging'
  },

  // Logging Configuration
  'LOG_FORMAT': {
    path: 'logging.format',
    type: 'string',
    default: 'json',
    required: false,
    description: 'Log format (json, pretty)'
  },
  'LOG_DESTINATION': {
    path: 'logging.destination',
    type: 'string',
    default: 'console',
    required: false,
    description: 'Log destination (console, file, both)'
  },
  'LOG_FILE_PATH': {
    path: 'logging.filePath',
    type: 'string',
    default: './logs/containerkit.log',
    required: false,
    description: 'Log file path when logging to file'
  },

  // Security Scanning
  'ENABLE_SCANNING': {
    path: 'infrastructure.scanning.enabled',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable security vulnerability scanning'
  },
  'SCANNER_TYPE': {
    path: 'infrastructure.scanning.scanner',
    type: 'string',
    default: 'trivy',
    required: false,
    description: 'Security scanner to use (trivy, grype, both)'
  },
  'SEVERITY_THRESHOLD': {
    path: 'infrastructure.scanning.severityThreshold',
    type: 'string',
    default: 'medium',
    required: false,
    description: 'Minimum severity for vulnerability reporting'
  },

  // Build Configuration
  'ENABLE_BUILD_CACHE': {
    path: 'infrastructure.build.enableCache',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable Docker build cache'
  },
  'PARALLEL_BUILD': {
    path: 'infrastructure.build.parallel',
    type: 'boolean',
    default: true,
    required: false,
    description: 'Enable parallel build operations'
  }
}

// Environment variable prefixes that should be stripped
export const ENV_PREFIXES = ['CONTAINERKIT_', 'MCP_', 'DOCKER_', 'K8S_', 'AI_']

// Legacy environment variables (for backward compatibility)
export const LEGACY_ENV_MAPPING: Record<string, string> = {
  'LOG_LEVEL': 'CONTAINERKIT_LOG_LEVEL',
  'WORKSPACE_DIR': 'CONTAINERKIT_WORKSPACE_DIR',
  'DOCKER_SOCKET': 'CONTAINERKIT_DOCKER_SOCKET',
  'DOCKER_REGISTRY': 'CONTAINERKIT_DOCKER_REGISTRY',
  'K8S_NAMESPACE': 'CONTAINERKIT_K8S_NAMESPACE',
  'AI_API_KEY': 'CONTAINERKIT_AI_API_KEY'
}