/**
 * Integration Test Mock Registry
 * Centralized mock management for integration tests
 */

import { IntegrationMockStrategy } from './integration-mocks';
import { 
  createMockDockerode,
  createMockTrivyScanner,
  createComprehensiveK8sMock,
  createMockLogger
} from '../../utils/mock-factories';
import type { Logger } from 'pino';

interface IntegrationMocks {
  docker: {
    client: any;
    initialize: () => Promise<any>;
    cleanup: () => Promise<void>;
  };
  trivy: {
    scanner: any;
    initialize: () => Promise<any>;
  };
  registry: {
    instance: any;
    initialize: () => Promise<any>;
    cleanup: () => Promise<void>;
  };
  kubernetes: {
    client: any;
    initialize: () => Promise<any>;
  };
  logger: Logger;
}

/**
 * Unified Mock Registry for Integration Tests
 */
export const IntegrationMockRegistry: IntegrationMocks = {
  docker: {
    client: null,
    async initialize() {
      if (IntegrationMockStrategy.shouldUseMocks()) {
        this.client = createMockDockerode();
        return this.client;
      }
      
      // Setup real Docker client
      this.client = await IntegrationMockStrategy.setupDockerClient();
      return this.client;
    },
    async cleanup() {
      if (this.client?.close) {
        await this.client.close();
      }
      this.client = null;
    }
  },
  
  trivy: {
    scanner: null,
    async initialize() {
      if (IntegrationMockStrategy.shouldUseMocks()) {
        this.scanner = createMockTrivyScanner();
        return this.scanner;
      }
      
      // Setup real Trivy scanner
      this.scanner = await IntegrationMockStrategy.setupTrivyScanner();
      return this.scanner;
    }
  },
  
  registry: {
    instance: null,
    async initialize() {
      if (IntegrationMockStrategy.shouldUseMocks()) {
        // Create mock registry
        this.instance = {
          host: 'localhost',
          port: 5000,
          url: 'localhost:5000',
          push: jest.fn().mockResolvedValue({ digest: 'sha256:mock' }),
          pull: jest.fn().mockResolvedValue({ image: 'test:latest' }),
          exists: jest.fn().mockResolvedValue(true),
          delete: jest.fn().mockResolvedValue(undefined),
          stop: jest.fn().mockResolvedValue(undefined),
        };
        return this.instance;
      }
      
      // Setup real registry using test containers
      const { setupTestRegistry } = await import('./test-containers');
      this.instance = await setupTestRegistry();
      return this.instance;
    },
    async cleanup() {
      if (this.instance?.stop) {
        await this.instance.stop();
      }
      this.instance = null;
    }
  },
  
  kubernetes: {
    client: null,
    async initialize() {
      if (IntegrationMockStrategy.shouldUseMocks()) {
        this.client = createComprehensiveK8sMock();
        return this.client;
      }
      
      // Setup real Kubernetes client
      this.client = await IntegrationMockStrategy.setupKubernetesClient();
      return this.client;
    }
  },
  
  logger: createMockLogger(),
};

/**
 * Initialize all mocks for a test suite
 */
export async function initializeAllMocks(): Promise<void> {
  await Promise.all([
    IntegrationMockRegistry.docker.initialize(),
    IntegrationMockRegistry.trivy.initialize(),
    IntegrationMockRegistry.registry.initialize(),
    IntegrationMockRegistry.kubernetes.initialize(),
  ]);
}

/**
 * Cleanup all mocks after test suite
 */
export async function cleanupAllMocks(): Promise<void> {
  await Promise.all([
    IntegrationMockRegistry.docker.cleanup(),
    IntegrationMockRegistry.registry.cleanup(),
  ]);
  
  // Reset mock functions
  if (jest && typeof jest.clearAllMocks === 'function') {
    jest.clearAllMocks();
  }
}

/**
 * Create a scoped mock registry for a specific test
 */
export function createScopedMockRegistry() {
  const scopedMocks = {
    docker: null as any,
    trivy: null as any,
    registry: null as any,
    kubernetes: null as any,
  };
  
  return {
    async initialize() {
      scopedMocks.docker = await IntegrationMockRegistry.docker.initialize();
      scopedMocks.trivy = await IntegrationMockRegistry.trivy.initialize();
      scopedMocks.registry = await IntegrationMockRegistry.registry.initialize();
      scopedMocks.kubernetes = await IntegrationMockRegistry.kubernetes.initialize();
      return scopedMocks;
    },
    
    getMocks() {
      return scopedMocks;
    },
    
    async cleanup() {
      // Cleanup is handled by the parent registry
    },
  };
}

/**
 * Test-specific mock configurations
 */
export const MockConfigurations = {
  /**
   * Configure mock for successful operations
   */
  configureSuccess() {
    if (IntegrationMockRegistry.docker.client) {
      IntegrationMockRegistry.docker.client.buildImage = jest.fn().mockResolvedValue({
        on: jest.fn().mockImplementation((event: string, handler: any) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify({ stream: 'Build complete\n' })));
            handler(Buffer.from(JSON.stringify({ aux: { ID: 'sha256:success' } })));
          }
          if (event === 'end') {
            handler();
          }
        }),
      });
    }
    
    if (IntegrationMockRegistry.trivy.scanner) {
      IntegrationMockRegistry.trivy.scanner.scanImage = jest.fn().mockResolvedValue({
        vulnerabilities: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      });
    }
  },
  
  /**
   * Configure mock for failure scenarios
   */
  configureFailure() {
    if (IntegrationMockRegistry.docker.client) {
      IntegrationMockRegistry.docker.client.buildImage = jest.fn().mockRejectedValue(
        new Error('Build failed: Docker daemon not responding')
      );
    }
    
    if (IntegrationMockRegistry.trivy.scanner) {
      IntegrationMockRegistry.trivy.scanner.scanImage = jest.fn().mockRejectedValue(
        new Error('Scan failed: Trivy not available')
      );
    }
  },
  
  /**
   * Configure mock for network errors
   */
  configureNetworkError() {
    const networkError = new Error('getaddrinfo ENOTFOUND images');
    (networkError as any).code = 'ENOTFOUND';
    (networkError as any).errno = -3008;
    (networkError as any).syscall = 'getaddrinfo';
    (networkError as any).hostname = 'images';
    
    if (IntegrationMockRegistry.docker.client) {
      IntegrationMockRegistry.docker.client.ping = jest.fn().mockRejectedValue(networkError);
      IntegrationMockRegistry.docker.client.buildImage = jest.fn().mockRejectedValue(networkError);
    }
    
    if (IntegrationMockRegistry.registry.instance) {
      IntegrationMockRegistry.registry.instance.push = jest.fn().mockRejectedValue(networkError);
    }
  },
  
  /**
   * Configure mock for timeout scenarios
   */
  configureTimeout() {
    const timeoutError = new Error('Operation timed out');
    (timeoutError as any).code = 'ETIMEDOUT';
    
    if (IntegrationMockRegistry.docker.client) {
      IntegrationMockRegistry.docker.client.buildImage = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(timeoutError), 100);
        });
      });
    }
  },
};

/**
 * Integration test setup helper
 */
export function setupIntegrationTest() {
  beforeAll(async () => {
    await initializeAllMocks();
  });
  
  beforeEach(() => {
    if (jest && typeof jest.clearAllMocks === 'function') {
      jest.clearAllMocks();
    }
  });
  
  afterAll(async () => {
    await cleanupAllMocks();
  });
  
  return {
    mocks: IntegrationMockRegistry,
    configure: MockConfigurations,
  };
}

export default IntegrationMockRegistry;