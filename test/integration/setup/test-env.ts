/**
 * Test Environment Configuration
 * Central configuration for all integration tests
 */

export const TEST_ENV = {
  // Registry configuration
  LOCAL_REGISTRY_HOST: process.env.TEST_REGISTRY_HOST || 'localhost:5000',
  REGISTRY_TEST_IMAGE: 'test-app',
  REGISTRY_NAMESPACE: 'integration-tests',
  
  // Test timeouts
  TEST_TIMEOUT: parseInt(process.env.TEST_TIMEOUT || '60000', 10),
  LONG_TEST_TIMEOUT: parseInt(process.env.LONG_TEST_TIMEOUT || '120000', 10),
  
  // Docker configuration
  DOCKER_HOST: process.env.DOCKER_HOST || '/var/run/docker.sock',
  DOCKER_API_VERSION: process.env.DOCKER_API_VERSION || '1.41',
  
  // Kubernetes configuration
  K8S_NAMESPACE: process.env.K8S_TEST_NAMESPACE || 'test-integration',
  K8S_CONTEXT: process.env.K8S_TEST_CONTEXT || 'docker-desktop',
  
  // Mock configuration
  MOCK_MODE: process.env.INTEGRATION_MOCK_MODE === 'true',
  USE_TEST_CONTAINERS: process.env.USE_TEST_CONTAINERS !== 'false',
  
  // CI/CD detection
  CI: process.env.CI === 'true',
  GITHUB_ACTIONS: process.env.GITHUB_ACTIONS === 'true',
  
  // Scanner configuration
  TRIVY_TIMEOUT: parseInt(process.env.TRIVY_TIMEOUT || '30000', 10),
  TRIVY_SEVERITY: process.env.TRIVY_SEVERITY || 'HIGH,CRITICAL',
  SKIP_TRIVY_UPDATE: process.env.SKIP_TRIVY_UPDATE === 'true' || process.env.CI === 'true',
  
  // Test data paths
  FIXTURES_PATH: 'test/fixtures',
  TEMP_TEST_PATH: '/tmp/integration-tests',
  
  // Cleanup settings
  CLEANUP_ON_SUCCESS: process.env.CLEANUP_ON_SUCCESS !== 'false',
  CLEANUP_ON_FAILURE: process.env.CLEANUP_ON_FAILURE === 'true',
  
  // Performance settings
  PARALLEL_TESTS: process.env.PARALLEL_TESTS !== 'false',
  MAX_PARALLEL: parseInt(process.env.MAX_PARALLEL || '3', 10),
};

/**
 * Determines if we should use mocks based on environment
 */
export function shouldUseMocks(): boolean {
  // Always use mocks in CI unless explicitly disabled
  if (TEST_ENV.CI && !process.env.FORCE_REAL_TESTS) {
    return true;
  }
  
  // Respect explicit mock mode setting
  return TEST_ENV.MOCK_MODE;
}

/**
 * Get a unique test namespace/tag for isolation
 */
export function getTestNamespace(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `test-${timestamp}-${random}`;
}

/**
 * Get test image name with unique tag
 */
export function getTestImageName(baseName = 'test-app'): string {
  const namespace = getTestNamespace();
  return `${TEST_ENV.LOCAL_REGISTRY_HOST}/${baseName}:${namespace}`;
}

/**
 * Configuration validator
 */
export function validateTestEnvironment(): void {
  const errors: string[] = [];
  
  // Check Docker availability if not using mocks
  if (!shouldUseMocks() && !TEST_ENV.DOCKER_HOST) {
    errors.push('DOCKER_HOST not configured for real tests');
  }
  
  // Check registry configuration
  if (!TEST_ENV.LOCAL_REGISTRY_HOST) {
    errors.push('LOCAL_REGISTRY_HOST not configured');
  }
  
  // Validate timeouts
  if (TEST_ENV.TEST_TIMEOUT < 5000) {
    errors.push('TEST_TIMEOUT too low (minimum 5000ms)');
  }
  
  if (errors.length > 0) {
    throw new Error(`Test environment validation failed:\n${errors.join('\n')}`);
  }
}

export default TEST_ENV;