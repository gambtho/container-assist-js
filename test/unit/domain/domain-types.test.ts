/**
 * Consolidated Domain Types Validation Tests
 * Ensures all consolidated types work correctly and schemas validate properly
 */

import { describe, test, expect } from '@jest/globals';
import {
  // Docker types
  DockerBuildOptions,
  DockerBuildResult,
  DockerScanResult,
  DockerPushResult,
  DockerTagResult,
  DockerBuildOptionsSchema,
  DockerBuildResultSchema,
  DockerScanResultSchema,
  DockerPushResultSchema,
  DockerTagResultSchema,
  
  // Build types
  BuildOptions,
  BuildResult,
  BuildConfiguration,
  BuildOptionsSchema,
  BuildResultSchema,
  BuildConfigurationSchema,
  
  // Scanning types
  ScanResult,
  Vulnerability,
  ScanResultSchema,
  VulnerabilitySchema,
  
  // Event types
  DomainEvent,
  EventType,
  createDomainEvent,
  DomainEventSchema,
  
  // Interface types
  Logger,
  // IDockerService, // Removed - this belongs in application layer
  // SessionStore, // Imported directly from contracts/types/session-store
} from '../../../src/domain/types/index.js';

describe('Consolidated Docker Types', () => {
  describe('DockerBuildOptions', () => {
    test('should validate valid build options', () => {
      const options: DockerBuildOptions = {
        context: './app',
        tags: ['myapp:latest'],
        buildArgs: { NODE_ENV: 'production' },
        noCache: true,
        platform: 'linux/amd64'
      };
      
      const result = DockerBuildOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });
    
    test('should require context field', () => {
      const options = {
        tags: ['myapp:latest']
      } as any;
      
      const result = DockerBuildOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });
  });

  describe('DockerBuildResult', () => {
    test('should validate complete build result', () => {
      const result: DockerBuildResult = {
        imageId: 'sha256:abc123def456',
        tags: ['myapp:latest', 'myapp:v1.0'],
        logs: ['Step 1/5: FROM node:18', 'Successfully built abc123def456'],
        success: true,
        size: 128000000,
        buildTime: 45000,
        digest: 'sha256:def456abc123'
      };
      
      const validation = DockerBuildResultSchema.safeParse(result);
      expect(validation.success).toBe(true);
    });
    
    test('should require essential fields', () => {
      const result = {
        imageId: 'sha256:abc123',
        tags: [],
        logs: []
        // Missing success field
      } as any;
      
      const validation = DockerBuildResultSchema.safeParse(result);
      expect(validation.success).toBe(false);
    });
  });

  describe('DockerScanResult', () => {
    test('should validate scan result with vulnerabilities', () => {
      const scanResult: DockerScanResult = {
        vulnerabilities: [
          {
            severity: 'high',
            package: 'openssl',
            version: '1.1.1',
            fixedVersion: '1.1.1k',
            description: 'Buffer overflow vulnerability'
          }
        ],
        summary: {
          critical: 0,
          high: 1,
          medium: 2,
          low: 5,
          total: 8
        },
        scanner: 'trivy',
        scanTime: '2025-01-15T10:30:00Z'
      };
      
      const validation = DockerScanResultSchema.safeParse(scanResult);
      expect(validation.success).toBe(true);
    });
  });
});

describe('Consolidated Build Types', () => {
  describe('BuildConfiguration', () => {
    test('should validate build configuration', () => {
      const config: BuildConfiguration = {
        projectPath: '/app',
        buildTool: 'docker',
        strategy: 'multi-stage',
        outputFormat: 'oci'
      };
      
      const result = BuildConfigurationSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('BuildOptions', () => {
    test('should support comprehensive build options', () => {
      const options: BuildOptions = {
        context: './src',
        dockerfile: 'Dockerfile.prod',
        tags: ['app:prod'],
        buildArgs: { ENV: 'production' },
        platform: ['linux/amd64', 'linux/arm64'],
        secrets: [{ id: 'mysecret', src: '/secrets/token' }]
      };
      
      const result = BuildOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });
  });
});

describe('Consolidated Scanning Types', () => {
  describe('Vulnerability', () => {
    test('should validate vulnerability with all fields', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2023-1234',
        severity: 'critical',
        package: 'libssl',
        version: '1.1.1',
        fixedVersion: '1.1.1k',
        description: 'Critical security vulnerability',
        score: 9.8,
        references: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2023-1234']
      };
      
      const result = VulnerabilitySchema.safeParse(vuln);
      expect(result.success).toBe(true);
    });
  });

  describe('ScanResult', () => {
    test('should validate comprehensive scan result', () => {
      const scanResult: ScanResult = {
        scanner: 'trivy',
        target: 'myapp:latest',
        targetType: 'image',
        vulnerabilities: [
          {
            id: 'CVE-2023-1234',
            severity: 'high',
            package: 'openssl',
            version: '1.1.1'
          }
        ],
        summary: {
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
          total: 1
        }
      };
      
      const result = ScanResultSchema.safeParse(scanResult);
      expect(result.success).toBe(true);
    });
  });
});

describe('Domain Events System', () => {
  describe('DomainEvent Creation', () => {
    test('should create valid domain event', () => {
      const event = createDomainEvent(
        EventType.BUILD_COMPLETED,
        'session-123',
        'build',
        { imageId: 'abc123', success: true },
        { userId: 'user-456' }
      );
      
      expect(event.type).toBe(EventType.BUILD_COMPLETED);
      expect(event.aggregateId).toBe('session-123');
      expect(event.aggregateType).toBe('build');
      expect(event.data.imageId).toBe('abc123');
      expect(event.metadata.userId).toBe('user-456');
    });
    
    test('should validate domain event schema', () => {
      const event: DomainEvent = {
        id: 'event-123',
        type: EventType.WORKFLOW_STARTED,
        aggregateId: 'session-456',
        aggregateType: 'workflow',
        version: 1,
        timestamp: new Date().toISOString(),
        data: { workflowType: 'containerization' },
        metadata: {}
      };
      
      const result = DomainEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });
});

describe('Service Interface Contracts', () => {
  describe('Logger Interface', () => {
    test('should define complete logger contract', () => {
      // Test that Logger interface has all required methods
      const loggerMethods = [
        'trace', 'debug', 'info', 'warn', 'error', 'fatal', 'child'
      ];
      
      // This is a type-level test - if it compiles, the interface is correct
      const mockLogger: Logger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
        child: () => ({} as Logger)
      };
      
      expect(typeof mockLogger.trace).toBe('function');
      expect(typeof mockLogger.child).toBe('function');
    });
  });

  describe('Service Interface Contracts', () => {
    test('should define proper Docker service contract', () => {
      // Type-level test for DockerService interface (commented out - belongs in application layer)
      // const mockDockerService: Partial<DockerService> = {
        buildImage: async () => ({ success: true, data: {} as any }),
        scanImage: async () => ({ success: true, data: {} as any })
      };
      
      expect(typeof mockDockerService.buildImage).toBe('function');
      expect(typeof mockDockerService.scanImage).toBe('function');
    });
  });
});

describe('Type System Integration', () => {
  test('should maintain type compatibility across layers', () => {
    // Test that consolidated types work together
    const buildOptions: DockerBuildOptions = {
      context: './app',
      tags: ['test:latest']
    };
    
    const buildResult: DockerBuildResult = {
      imageId: 'sha256:abc123',
      tags: buildOptions.tags,
      logs: ['Build completed'],
      success: true
    };
    
    const event = createDomainEvent(
      EventType.BUILD_COMPLETED,
      'session-123',
      'build',
      buildResult
    );
    
    expect(event.data.imageId).toBe(buildResult.imageId);
    expect(event.data.tags).toEqual(buildOptions.tags);
  });
  
  test('should validate end-to-end workflow data', () => {
    const workflowData = {
      buildOptions: {
        context: './app',
        tags: ['myapp:v1.0']
      },
      buildResult: {
        imageId: 'sha256:def456',
        tags: ['myapp:v1.0'],
        logs: ['Successfully built'],
        success: true
      },
      scanResult: {
        scanner: 'trivy' as const,
        target: 'myapp:v1.0',
        targetType: 'image' as const,
        vulnerabilities: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0
        }
      }
    };
    
    // Validate all schemas
    expect(DockerBuildOptionsSchema.safeParse(workflowData.buildOptions).success).toBe(true);
    expect(DockerBuildResultSchema.safeParse(workflowData.buildResult).success).toBe(true);
    expect(DockerScanResultSchema.safeParse(workflowData.scanResult).success).toBe(true);
  });
});