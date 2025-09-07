import { jest } from '@jest/globals';
import { createMockInfrastructure } from '../helpers/mock-infrastructure';

// Global test timeout for unit tests
jest.setTimeout(10000);

// Mock external dependencies by default for unit tests
jest.mock('../../src/lib/docker', () => ({
  DockerClient: jest.fn(),
  createDockerClient: jest.fn(() => createMockDockerClient())
}));

jest.mock('../../src/lib/kubernetes', () => ({
  KubernetesClient: jest.fn(),
  createKubernetesClient: jest.fn(() => createMockKubernetesClient())
}));

// Global test utilities
(global as any).createTestInfrastructure = createMockInfrastructure;
(global as any).TEST_TIMEOUT = 10000;

// Console cleanup
const originalConsole = console;
beforeEach(() => {
  // Suppress console output in unit tests unless DEBUG is set
  if (!process.env.DEBUG && !process.env.JEST_DEBUG) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterEach(() => {
  if (!process.env.DEBUG) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
  jest.clearAllMocks();
});

// Mock Docker client for unit tests
function createMockDockerClient() {
  return {
    buildImage: jest.fn(),
    pushImage: jest.fn(),
    tagImage: jest.fn(),
    listImages: jest.fn(),
    removeImage: jest.fn(),
  };
}

// Mock Kubernetes client for unit tests
function createMockKubernetesClient() {
  return {
    applyManifest: jest.fn(),
    deleteManifest: jest.fn(),
    getNamespace: jest.fn(),
    createNamespace: jest.fn(),
    listPods: jest.fn(),
  };
}

export {};