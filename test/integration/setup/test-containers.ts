/**
 * Test Container Utilities
 * Provides test container management for integration tests
 */

import { TEST_ENV, getTestNamespace } from './test-env';
import { IntegrationMockStrategy } from './integration-mocks';

export interface TestContainer {
  id: string;
  name: string;
  host: string;
  port: number;
  stop: () => Promise<void>;
}

export interface RegistryContainer extends TestContainer {
  pushImage: (imageName: string) => Promise<void>;
  pullImage: (imageName: string) => Promise<void>;
}

/**
 * Setup a local Docker registry for testing
 */
export async function setupTestRegistry(): Promise<RegistryContainer> {
  if (IntegrationMockStrategy.shouldUseMocks()) {
    // Return mock registry
    return {
      id: 'mock-registry',
      name: 'mock-registry',
      host: 'localhost',
      port: 5000,
      stop: async () => { /* no-op */ },
      pushImage: async () => { /* no-op */ },
      pullImage: async () => { /* no-op */ },
    };
  }
  
  // For real container setup (when testcontainers is available)
  try {
    const { GenericContainer, Wait } = await import('testcontainers');
    
    const registry = await new GenericContainer('registry:2')
      .withName(`registry-${getTestNamespace()}`)
      .withExposedPorts(5000)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(30000)
      .start();
    
    const host = registry.getHost();
    const port = registry.getMappedPort(5000);
    const registryUrl = `${host}:${port}`;
    
    return {
      id: registry.getId(),
      name: registry.getName(),
      host,
      port,
      stop: async () => {
        await registry.stop();
      },
      pushImage: async (imageName: string) => {
        const docker = await IntegrationMockStrategy.setupDockerClient();
        const image = docker.getImage(imageName);
        await image.tag({
          repo: `${registryUrl}/${imageName.split(':')[0]}`,
          tag: imageName.split(':')[1] || 'latest',
        });
        await image.push({ registry: registryUrl });
      },
      pullImage: async (imageName: string) => {
        const docker = await IntegrationMockStrategy.setupDockerClient();
        await docker.pull(`${registryUrl}/${imageName}`);
      },
    };
  } catch (error) {
    // Fallback to mock if testcontainers not available
    console.warn('Testcontainers not available, using mock registry');
    return {
      id: 'fallback-registry',
      name: 'fallback-registry',
      host: TEST_ENV.LOCAL_REGISTRY_HOST.split(':')[0],
      port: parseInt(TEST_ENV.LOCAL_REGISTRY_HOST.split(':')[1] || '5000', 10),
      stop: async () => { /* no-op */ },
      pushImage: async () => { /* no-op */ },
      pullImage: async () => { /* no-op */ },
    };
  }
}

/**
 * Setup a test database container
 */
export async function setupTestDatabase(type: 'postgres' | 'mysql' | 'mongodb' = 'postgres'): Promise<TestContainer> {
  if (IntegrationMockStrategy.shouldUseMocks()) {
    return {
      id: `mock-${type}`,
      name: `mock-${type}`,
      host: 'localhost',
      port: type === 'postgres' ? 5432 : type === 'mysql' ? 3306 : 27017,
      stop: async () => { /* no-op */ },
    };
  }
  
  try {
    const { GenericContainer, Wait } = await import('testcontainers');
    
    let container;
    let port;
    
    switch (type) {
      case 'postgres':
        container = new GenericContainer('postgres:14-alpine')
          .withEnvironment({ POSTGRES_PASSWORD: 'test' })
          .withExposedPorts(5432)
          .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'));
        port = 5432;
        break;
      case 'mysql':
        container = new GenericContainer('mysql:8')
          .withEnvironment({ MYSQL_ROOT_PASSWORD: 'test' })
          .withExposedPorts(3306)
          .withWaitStrategy(Wait.forLogMessage('ready for connections'));
        port = 3306;
        break;
      case 'mongodb':
        container = new GenericContainer('mongo:5')
          .withExposedPorts(27017)
          .withWaitStrategy(Wait.forListeningPorts());
        port = 27017;
        break;
    }
    
    const startedContainer = await container
      .withName(`${type}-${getTestNamespace()}`)
      .withStartupTimeout(60000)
      .start();
    
    return {
      id: startedContainer.getId(),
      name: startedContainer.getName(),
      host: startedContainer.getHost(),
      port: startedContainer.getMappedPort(port),
      stop: async () => {
        await startedContainer.stop();
      },
    };
  } catch {
    // Fallback to mock
    return {
      id: `fallback-${type}`,
      name: `fallback-${type}`,
      host: 'localhost',
      port: type === 'postgres' ? 5432 : type === 'mysql' ? 3306 : 27017,
      stop: async () => { /* no-op */ },
    };
  }
}

/**
 * Container cleanup utility
 */
export class ContainerCleanup {
  private static containers: TestContainer[] = [];
  
  static register(container: TestContainer): void {
    this.containers.push(container);
  }
  
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = this.containers.map(async (container) => {
      try {
        await container.stop();
        console.log(`Stopped container: ${container.name}`);
      } catch (error) {
        console.warn(`Failed to stop container ${container.name}:`, error);
      }
    });
    
    await Promise.allSettled(cleanupPromises);
    this.containers = [];
  }
  
  static async cleanupByName(name: string): Promise<void> {
    const container = this.containers.find(c => c.name === name);
    if (container) {
      await container.stop();
      this.containers = this.containers.filter(c => c.name !== name);
    }
  }
}

/**
 * Test fixture utilities
 */
export async function createTestImage(name: string, dockerfile?: string): Promise<string> {
  const docker = await IntegrationMockStrategy.setupDockerClient();
  const imageName = `${name}:${getTestNamespace()}`;
  
  if (IntegrationMockStrategy.shouldUseMocks()) {
    return imageName;
  }
  
  const defaultDockerfile = dockerfile || `
FROM alpine:3.18
RUN echo "Test image"
CMD ["echo", "Hello from test"]
`;
  
  const stream = await docker.buildImage(
    {
      context: Buffer.from(defaultDockerfile),
      src: ['Dockerfile'],
    },
    {
      t: imageName,
      dockerfile: 'Dockerfile',
    }
  );
  
  // Wait for build to complete
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err: any, res: any) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
  
  return imageName;
}

/**
 * Wait for container to be healthy
 */
export async function waitForHealthy(
  containerId: string,
  maxAttempts = 30,
  delayMs = 1000
): Promise<boolean> {
  if (IntegrationMockStrategy.shouldUseMocks()) {
    return true;
  }
  
  const docker = await IntegrationMockStrategy.setupDockerClient();
  const container = docker.getContainer(containerId);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const info = await container.inspect();
      
      if (info.State.Health) {
        if (info.State.Health.Status === 'healthy') {
          return true;
        }
      } else if (info.State.Running) {
        // No health check, just running
        return true;
      }
    } catch (error) {
      // Container might not exist yet
    }
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  return false;
}

/**
 * Cleanup helper for test suites
 */
export function setupContainerCleanup() {
  // Register cleanup handlers
  if (typeof afterAll !== 'undefined') {
    afterAll(async () => {
      await ContainerCleanup.cleanupAll();
    });
  }
  
  // Handle process termination
  const cleanupAndExit = async () => {
    console.log('\nCleaning up test containers...');
    await ContainerCleanup.cleanupAll();
    process.exit(0);
  };
  
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);
}

export default {
  setupTestRegistry,
  setupTestDatabase,
  createTestImage,
  waitForHealthy,
  ContainerCleanup,
  setupContainerCleanup,
};