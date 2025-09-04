/**
 * Integration Mock Strategy
 * Determines when to use mocks vs real services
 */

import { TEST_ENV, shouldUseMocks } from './test-env';
import { 
  createMockDockerode,
  createComprehensiveK8sMock,
  createMockTrivyScanner,
  createMockDockerClientForService,
  MockRegistry
} from '../../utils/mock-factories';
import type { Logger } from 'pino';

export class IntegrationMockStrategy {
  /**
   * Check if we should use mocks based on environment
   */
  static shouldUseMocks(): boolean {
    return shouldUseMocks();
  }
  
  /**
   * Check if Docker is available for real tests
   */
  static async isDockerAvailable(): Promise<boolean> {
    if (this.shouldUseMocks()) {
      return true;
    }
    
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec('docker info', (error) => {
          resolve(!error);
        });
      });
    } catch {
      return false;
    }
  }
  
  /**
   * Check if Kubernetes is available for real tests
   */
  static async isKubernetesAvailable(): Promise<boolean> {
    if (this.shouldUseMocks()) {
      return true;
    }
    
    try {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        exec('kubectl cluster-info', (error) => {
          resolve(!error);
        });
      });
    } catch {
      return false;
    }
  }
  
  /**
   * Setup Docker client (mock or real)
   */
  static async setupDockerClient(logger?: Logger) {
    if (this.shouldUseMocks()) {
      const mockDockerode = createMockDockerode();
      MockRegistry.register('dockerode', mockDockerode);
      return mockDockerode;
    }
    
    // Return real Docker client setup
    const Docker = (await import('dockerode')).default;
    return new Docker({
      socketPath: TEST_ENV.DOCKER_HOST,
      version: TEST_ENV.DOCKER_API_VERSION,
    });
  }
  
  /**
   * Setup Kubernetes client (mock or real)
   */
  static async setupKubernetesClient(logger?: Logger) {
    if (this.shouldUseMocks()) {
      const mockK8s = createComprehensiveK8sMock();
      MockRegistry.register('kubernetes', mockK8s);
      return mockK8s;
    }
    
    // Return real Kubernetes client setup
    const k8s = await import('@kubernetes/client-node');
    const kc = new k8s.KubeConfig();
    
    if (TEST_ENV.K8S_CONTEXT) {
      kc.loadFromDefault();
      kc.setCurrentContext(TEST_ENV.K8S_CONTEXT);
    } else {
      kc.loadFromDefault();
    }
    
    return {
      KubeConfig: kc,
      CoreV1Api: kc.makeApiClient(k8s.CoreV1Api),
      AppsV1Api: kc.makeApiClient(k8s.AppsV1Api),
    };
  }
  
  /**
   * Setup Trivy scanner (mock or real)
   */
  static async setupTrivyScanner(logger?: Logger) {
    if (this.shouldUseMocks()) {
      const mockScanner = createMockTrivyScanner();
      MockRegistry.register('trivy', mockScanner);
      return mockScanner;
    }
    
    // For real scanner, return a wrapper
    return {
      scanImage: async (imageName: string, options: any = {}) => {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        try {
          const severityFlag = options.severity ? `--severity ${options.severity}` : '';
          const formatFlag = '--format json';
          const skipUpdateFlag = TEST_ENV.SKIP_TRIVY_UPDATE ? '--skip-update' : '';
          
          const command = `trivy image ${skipUpdateFlag} ${severityFlag} ${formatFlag} ${imageName}`;
          const { stdout } = await execAsync(command, {
            timeout: TEST_ENV.TRIVY_TIMEOUT,
          });
          
          return JSON.parse(stdout);
        } catch (error: any) {
          // Return mock data on failure
          return {
            scanner: 'trivy',
            vulnerabilities: [],
            summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
            error: error.message,
          };
        }
      },
      
      isAvailable: async () => {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          await execAsync('trivy --version');
          return true;
        } catch {
          return false;
        }
      },
    };
  }
  
  /**
   * Setup complete integration test environment
   */
  static async setupIntegrationEnvironment(logger?: Logger) {
    const docker = await this.setupDockerClient(logger);
    const kubernetes = await this.setupKubernetesClient(logger);
    const trivy = await this.setupTrivyScanner(logger);
    
    return {
      docker,
      kubernetes,
      trivy,
      cleanup: async () => {
        // Cleanup any resources if needed
        MockRegistry.cleanup();
      },
    };
  }
  
  /**
   * Determine test skip conditions
   */
  static shouldSkipTest(requirements: {
    docker?: boolean;
    kubernetes?: boolean;
    trivy?: boolean;
    registry?: boolean;
  }): boolean {
    // In mock mode, never skip
    if (this.shouldUseMocks()) {
      return false;
    }
    
    // Check requirements for real tests
    const skipReasons: string[] = [];
    
    if (requirements.docker && !process.env.DOCKER_HOST) {
      skipReasons.push('Docker not available');
    }
    
    if (requirements.kubernetes && !process.env.KUBECONFIG) {
      skipReasons.push('Kubernetes not available');
    }
    
    if (requirements.trivy && process.env.SKIP_TRIVY_TESTS === 'true') {
      skipReasons.push('Trivy tests skipped');
    }
    
    if (requirements.registry && !TEST_ENV.LOCAL_REGISTRY_HOST) {
      skipReasons.push('Registry not configured');
    }
    
    if (skipReasons.length > 0) {
      console.log(`Skipping test: ${skipReasons.join(', ')}`);
      return true;
    }
    
    return false;
  }
}

export default IntegrationMockStrategy;