/**
 * Tool Input/Output Validation Tests  
 * Team Delta - Schema Validation Tests
 */

import {
  // Input Schemas
  SessionIdInput,
  RepoPathInput,
  AnalyzeRepositoryInput,
  BuildImageInput,
  DeployApplicationInput,
  ServerStatusInput,
  FixDockerfileInput,
  GenerateDockerfileInput,
  ScanImageInput,
  TagImageInput,
  PushImageInput,
  GenerateK8sManifestsInput,
  PrepareClusterInput,
  VerifyDeploymentInput,
  
  // Output Schemas
  AnalysisResultSchema,
  BuildResultSchema,
  ScanResultSchema,
  DeploymentResultSchema,
  ServerStatusSchema,
  DockerfileResultSchema,
  K8sManifestsResultSchema,
  BaseSuccessSchema,
  BaseSessionResultSchema,
  
  // Type exports
  type AnalyzeRepositoryParams,
  type BuildImageParams,
  type DeployApplicationParams,
  type AnalysisResult,
  type BuildResult,
  type ScanResult,
  type DeploymentResult,
  type ServerStatus,
} from '../../../../src/application/tools/schemas';

describe('Tool Input Schemas', () => {
  describe('SessionIdInput', () => {
    it('should validate valid session ID', () => {
      const valid = { sessionId: 'test-session-123' };
      expect(() => SessionIdInput.parse(valid)).not.toThrow();
    });

    it('should reject empty session ID', () => {
      const invalid = { sessionId: '' };
      expect(() => SessionIdInput.parse(invalid)).toThrow();
    });

    it('should reject missing session ID', () => {
      const invalid = {};
      expect(() => SessionIdInput.parse(invalid)).toThrow();
    });
  });

  describe('RepoPathInput', () => {
    it('should validate valid repository path', () => {
      const valid = { repoPath: '/path/to/repo' };
      expect(() => RepoPathInput.parse(valid)).not.toThrow();
    });

    it('should reject empty repository path', () => {
      const invalid = { repoPath: '' };
      expect(() => SessionIdInput.parse(invalid)).toThrow();
    });

    it('should reject missing repository path', () => {
      const invalid = {};
      expect(() => RepoPathInput.parse(invalid)).toThrow();
    });
  });

  describe('AnalyzeRepositoryInput', () => {
    it('should validate minimal input', () => {
      const valid = { repoPath: '/test/repo' };
      const result = AnalyzeRepositoryInput.parse(valid);
      
      expect(result.repoPath).toBe('/test/repo');
      expect(result.depth).toBe(3); // default
      expect(result.includeTests).toBe(false); // default
      expect(result.sessionId).toBeUndefined();
    });

    it('should validate complete input', () => {
      const valid = {
        repoPath: '/test/repo',
        sessionId: 'test-session',
        depth: 5,
        includeTests: true,
      };
      
      const result = AnalyzeRepositoryInput.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should reject invalid depth', () => {
      const invalid = {
        repoPath: '/test/repo',
        depth: 15, // exceeds max of 10
      };
      
      expect(() => AnalyzeRepositoryInput.parse(invalid)).toThrow();
    });

    it('should reject non-boolean includeTests', () => {
      const invalid = {
        repoPath: '/test/repo',
        includeTests: 'yes',
      };
      
      expect(() => AnalyzeRepositoryInput.parse(invalid)).toThrow();
    });
  });

  describe('BuildImageInput', () => {
    it('should validate minimal input', () => {
      const valid = { sessionId: 'test-session' };
      const result = BuildImageInput.parse(valid);
      
      expect(result.sessionId).toBe('test-session');
      expect(result.context).toBe('.'); // default
      expect(result.dockerfile).toBe('Dockerfile'); // default
      expect(result.noCache).toBe(false); // default
      expect(result.push).toBe(false); // default
      expect(result.squash).toBe(false); // default
      expect(result.pull).toBe(true); // default
    });

    it('should validate complete input', () => {
      const valid = {
        sessionId: 'test-session',
        context: './app',
        dockerfile: 'Dockerfile.prod',
        tag: 'myapp:latest',
        tags: ['myapp:latest', 'myapp:v1.0'],
        buildArgs: { NODE_ENV: 'production' },
        target: 'production',
        noCache: true,
        platform: 'linux/amd64',
        push: true,
        registry: 'myregistry.com',
        squash: true,
        pull: false,
      };
      
      const result = BuildImageInput.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should validate buildArgs as string record', () => {
      const valid = {
        sessionId: 'test-session',
        buildArgs: {
          NODE_ENV: 'production',
          VERSION: '1.0.0',
          PORT: '3000',
        },
      };
      
      expect(() => BuildImageInput.parse(valid)).not.toThrow();
    });

    it('should reject non-string buildArgs values', () => {
      const invalid = {
        sessionId: 'test-session',
        buildArgs: {
          NODE_ENV: 'production',
          PORT: 3000, // Should be string
        },
      };
      
      expect(() => BuildImageInput.parse(invalid)).toThrow();
    });
  });

  describe('Other Input Schemas', () => {
    it('should validate GenerateDockerfileInput (alias for SessionIdInput)', () => {
      const valid = { sessionId: 'test-session' };
      expect(() => GenerateDockerfileInput.parse(valid)).not.toThrow();
    });

    it('should validate ScanImageInput', () => {
      const valid = { sessionId: 'test-session' };
      expect(() => ScanImageInput.parse(valid)).not.toThrow();
    });

    it('should validate TagImageInput', () => {
      const valid = { sessionId: 'test-session', tag: 'myapp:v1.0' };
      expect(() => TagImageInput.parse(valid)).not.toThrow();
    });

    it('should reject TagImageInput without tag', () => {
      const invalid = { sessionId: 'test-session' };
      expect(() => TagImageInput.parse(invalid)).toThrow();
    });

    it('should validate PushImageInput', () => {
      const valid = { sessionId: 'test-session', registry: 'docker.io' };
      const minimal = { sessionId: 'test-session' };
      
      expect(() => PushImageInput.parse(valid)).not.toThrow();
      expect(() => PushImageInput.parse(minimal)).not.toThrow();
    });

    it('should validate GenerateK8sManifestsInput', () => {
      const valid = { sessionId: 'test-session' };
      expect(() => GenerateK8sManifestsInput.parse(valid)).not.toThrow();
    });

    it('should validate PrepareClusterInput', () => {
      const valid = { sessionId: 'test-session' };
      expect(() => PrepareClusterInput.parse(valid)).not.toThrow();
    });

    it('should validate VerifyDeploymentInput', () => {
      const valid = { sessionId: 'test-session' };
      expect(() => VerifyDeploymentInput.parse(valid)).not.toThrow();
    });
  });

  describe('DeployApplicationInput', () => {
    it('should validate minimal input with defaults', () => {
      const valid = { sessionId: 'test-session' };
      const result = DeployApplicationInput.parse(valid);
      
      expect(result.sessionId).toBe('test-session');
      expect(result.wait).toBe(false); // default
      expect(result.dryRun).toBe(false); // default
      expect(result.namespace).toBeUndefined();
      expect(result.timeout).toBeUndefined();
    });

    it('should validate complete input', () => {
      const valid = {
        sessionId: 'test-session',
        namespace: 'production',
        wait: true,
        timeout: '300s',
        dryRun: true,
      };
      
      const result = DeployApplicationInput.parse(valid);
      expect(result).toEqual(valid);
    });

    it('should accept valid DNS-1123 namespace', () => {
      const validNamespaces = [
        'production',
        'dev-env',
        'test123',
        'a1b2c3',
        'namespace-with-dashes',
      ];
      
      validNamespaces.forEach(namespace => {
        const input = { sessionId: 'test-session', namespace };
        expect(() => DeployApplicationInput.parse(input)).not.toThrow();
      });
    });

    it('should reject invalid DNS-1123 namespace', () => {
      const invalidNamespaces = [
        'Production', // uppercase
        '-invalid', // starts with dash
        'invalid-', // ends with dash
        'invalid_name', // underscore
        'a'.repeat(64), // too long (>63 chars)
        '123.456', // contains dot
        'UPPERCASE', // uppercase
      ];
      
      invalidNamespaces.forEach(namespace => {
        const input = { sessionId: 'test-session', namespace };
        expect(() => DeployApplicationInput.parse(input)).toThrow();
      });
    });

    it('should accept timeout as string or number', () => {
      const validTimeouts = [
        '300s',
        '5m', 
        '1h',
        300, // positive number
        1.5, // decimal number
      ];
      
      validTimeouts.forEach(timeout => {
        const input = { sessionId: 'test-session', timeout };
        expect(() => DeployApplicationInput.parse(input)).not.toThrow();
      });
    });

    it('should reject invalid timeout values', () => {
      const invalidTimeouts = [
        '300x', // invalid unit
        'invalid', // non-numeric string
        -300, // negative number
        0, // zero
        '-5m', // negative with unit
      ];
      
      invalidTimeouts.forEach(timeout => {
        const input = { sessionId: 'test-session', timeout };
        expect(() => DeployApplicationInput.parse(input)).toThrow();
      });
    });
  });

  describe('FixDockerfileInput', () => {
    it('should validate valid input', () => {
      const valid = {
        sessionId: 'test-session',
        errorMessage: 'Build failed: missing EXPOSE directive',
      };
      
      expect(() => FixDockerfileInput.parse(valid)).not.toThrow();
    });

    it('should reject empty error message', () => {
      const invalid = {
        sessionId: 'test-session',
        errorMessage: '',
      };
      
      expect(() => FixDockerfileInput.parse(invalid)).toThrow();
    });
  });

  describe('ServerStatusInput', () => {
    it('should validate empty object', () => {
      expect(() => ServerStatusInput.parse({})).not.toThrow();
    });

    it('should validate with details flag', () => {
      expect(() => ServerStatusInput.parse({ details: true })).not.toThrow();
      expect(() => ServerStatusInput.parse({ details: false })).not.toThrow();
    });

    it('should reject non-boolean details', () => {
      expect(() => ServerStatusInput.parse({ details: 'yes' })).toThrow();
    });
  });
});

describe('Tool Output Schemas', () => {
  describe('BaseSuccessSchema', () => {
    it('should validate basic success response', () => {
      const valid = { success: true };
      expect(() => BaseSuccessSchema.parse(valid)).not.toThrow();
    });

    it('should validate failure response', () => {
      const valid = { success: false };
      expect(() => BaseSuccessSchema.parse(valid)).not.toThrow();
    });
  });

  describe('BaseSessionResultSchema', () => {
    it('should validate session result', () => {
      const valid = { success: true, sessionId: 'test-123' };
      expect(() => BaseSessionResultSchema.parse(valid)).not.toThrow();
    });

    it('should reject missing sessionId', () => {
      const invalid = { success: true };
      expect(() => BaseSessionResultSchema.parse(invalid)).toThrow();
    });
  });

  describe('AnalysisResultSchema', () => {
    it('should validate minimal analysis result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        language: 'javascript',
        dependencies: [],
        ports: [],
        hasDockerfile: false,
        hasDockerCompose: false,
        hasKubernetes: false,
      };
      
      expect(() => AnalysisResultSchema.parse(valid)).not.toThrow();
    });

    it('should validate complete analysis result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        language: 'javascript',
        languageVersion: '18.17.0',
        framework: 'express',
        frameworkVersion: '4.18.2',
        buildSystem: {
          type: 'npm',
          buildFile: 'package.json',
          buildCommand: 'npm run build',
          testCommand: 'npm test',
        },
        dependencies: [
          { name: 'express', version: '4.18.2', type: 'runtime' as const },
          { name: 'jest', version: '29.0.0', type: 'test' as const },
        ],
        ports: [3000, 8080],
        hasDockerfile: true,
        hasDockerCompose: false,
        hasKubernetes: true,
        metadata: { nodeVersion: '18' },
        recommendations: {
          baseImage: 'node:18-alpine',
          buildStrategy: 'multi-stage',
          securityNotes: ['Use non-root user'],
        },
      };
      
      expect(() => AnalysisResultSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid dependency type', () => {
      const invalid = {
        success: true,
        sessionId: 'test-session',
        language: 'javascript',
        dependencies: [
          { name: 'express', type: 'invalid' }, // Invalid type
        ],
        ports: [],
        hasDockerfile: false,
        hasDockerCompose: false,
        hasKubernetes: false,
      };
      
      expect(() => AnalysisResultSchema.parse(invalid)).toThrow();
    });
  });

  describe('DockerfileResultSchema', () => {
    it('should validate minimal dockerfile result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        dockerfile: 'FROM node:18\nWORKDIR /app',
        path: '/app/Dockerfile',
      };
      
      expect(() => DockerfileResultSchema.parse(valid)).not.toThrow();
    });

    it('should validate with validation messages', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        dockerfile: 'FROM node:18',
        path: '/app/Dockerfile',
        validation: ['Missing WORKDIR', 'Consider multi-stage build'],
      };
      
      expect(() => DockerfileResultSchema.parse(valid)).not.toThrow();
    });
  });

  describe('BuildResultSchema', () => {
    it('should validate minimal build result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        imageId: 'sha256:abc123',
        tags: ['myapp:latest'],
        buildTime: 45000,
        metadata: {
          dockerfile: 'Dockerfile',
          context: '.',
        },
      };
      
      expect(() => BuildResultSchema.parse(valid)).not.toThrow();
    });

    it('should validate complete build result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        imageId: 'sha256:abc123def456',
        tags: ['myapp:latest', 'myapp:v1.0'],
        size: 157286400,
        layers: 8,
        buildTime: 67500,
        digest: 'sha256:def456ghi789',
        warnings: ['Layer size is large'],
        metadata: {
          baseImage: 'node:18-alpine',
          platform: 'linux/amd64',
          dockerfile: 'Dockerfile.prod',
          context: './app',
          cached: true,
        },
      };
      
      expect(() => BuildResultSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ScanResultSchema', () => {
    it('should validate scan result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        vulnerabilities: 5,
        critical: 0,
        high: 1,
        medium: 2,
        low: 2,
        details: [{ severity: 'high', package: 'openssl' }],
      };
      
      expect(() => ScanResultSchema.parse(valid)).not.toThrow();
    });
  });

  describe('K8sManifestsResultSchema', () => {
    it('should validate K8s manifests result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        manifests: 'apiVersion: apps/v1\nkind: Deployment',
        path: '/app/k8s/deployment.yaml',
        resources: [
          { kind: 'Deployment', name: 'myapp' },
          { kind: 'Service', name: 'myapp-service' },
        ],
      };
      
      expect(() => K8sManifestsResultSchema.parse(valid)).not.toThrow();
    });
  });

  describe('DeploymentResultSchema', () => {
    it('should validate deployment result', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        namespace: 'production',
        deploymentName: 'myapp-deployment',
        serviceName: 'myapp-service',
        endpoint: 'http://myapp.example.com',
        ready: true,
        replicas: 3,
      };
      
      expect(() => DeploymentResultSchema.parse(valid)).not.toThrow();
    });

    it('should validate without optional endpoint', () => {
      const valid = {
        success: true,
        sessionId: 'test-session',
        namespace: 'staging',
        deploymentName: 'test-app',
        serviceName: 'test-service',
        ready: false,
        replicas: 1,
      };
      
      expect(() => DeploymentResultSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ServerStatusSchema', () => {
    it('should validate server status', () => {
      const valid = {
        success: true,
        version: '1.0.0',
        uptime: 3600,
        memory: {
          used: 104857600,
          total: 1073741824,
        },
        sessions: 5,
        tools: 15,
      };
      
      expect(() => ServerStatusSchema.parse(valid)).not.toThrow();
    });

    it('should validate without optional sessions', () => {
      const valid = {
        success: true,
        version: '1.0.0',
        uptime: 3600,
        memory: {
          used: 104857600,
          total: 1073741824,
        },
        tools: 15,
      };
      
      expect(() => ServerStatusSchema.parse(valid)).not.toThrow();
    });
  });
});

describe('Schema Validation with safeParse', () => {
  it('should validate valid SessionId input', () => {
    const result = SessionIdInput.safeParse({ sessionId: 'test-123' });
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ sessionId: 'test-123' });
    }
  });

  it('should return error for invalid SessionId input', () => {
    const result = SessionIdInput.safeParse({ sessionId: '' });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['sessionId']);
    }
  });

  it('should handle multiple validation errors in BuildImageInput', () => {
    const result = BuildImageInput.safeParse({
      // Missing sessionId, invalid types
      buildArgs: 123, // should be record
    });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.issues;
      expect(errors.some(e => e.path.includes('sessionId'))).toBe(true);
    }
  });
});

describe('Type Inference', () => {
  it('should correctly infer AnalyzeRepositoryParams type', () => {
    const params: AnalyzeRepositoryParams = {
      repoPath: '/test/repo',
      sessionId: 'test-session',
      depth: 'deep',
      includeTests: true,
    };
    
    expect(params.repoPath).toBe('/test/repo');
    expect(params.depth).toBe('deep');
  });

  it('should correctly infer BuildImageParams type', () => {
    const params: BuildImageParams = {
      sessionId: 'test-session',
      context: './app',
      dockerfile: 'Dockerfile',
      tags: ['app:latest'],
    };
    
    expect(params.sessionId).toBe('test-session');
    expect(params.tags).toHaveLength(1);
  });

  it('should correctly infer AnalysisResult type', () => {
    const result: AnalysisResult = {
      success: true,
      sessionId: 'test-session',
      language: 'javascript',
      dependencies: [],
      ports: [3000],
      hasDockerfile: true,
      hasDockerCompose: false,
      hasKubernetes: false,
    };
    
    expect(result.language).toBe('javascript');
    expect(result.ports).toContain(3000);
  });

  it('should correctly infer BuildResult type', () => {
    const result: BuildResult = {
      success: true,
      sessionId: 'test-session',
      imageId: 'sha256:abc123',
      tags: ['app:latest'],
      buildTime: 30000,
      metadata: {
        dockerfile: 'Dockerfile',
        context: '.',
      },
    };
    
    expect(result.imageId).toContain('sha256');
    expect(result.buildTime).toBe(30000);
  });
});

describe('Schema Integration', () => {
  it('should validate end-to-end workflow data flow', () => {
    // Analyze repository input
    const analyzeInput = {
      repoPath: '/test/app',
      sessionId: 'workflow-123',
      depth: 5,
      includeTests: false,
    };
    expect(() => AnalyzeRepositoryInput.parse(analyzeInput)).not.toThrow();

    // Analysis result output
    const analysisOutput = {
      success: true,
      sessionId: 'workflow-123',
      language: 'javascript',
      dependencies: [{ name: 'express', version: '4.18.2' }],
      ports: [3000],
      hasDockerfile: false,
      hasDockerCompose: false,
      hasKubernetes: false,
    };
    expect(() => AnalysisResultSchema.parse(analysisOutput)).not.toThrow();

    // Build input using session from analysis
    const buildInput = {
      sessionId: 'workflow-123',
      tags: ['myapp:latest'],
      noCache: false,
    };
    expect(() => BuildImageInput.parse(buildInput)).not.toThrow();

    // Build result output
    const buildOutput = {
      success: true,
      sessionId: 'workflow-123',
      imageId: 'sha256:abc123',
      tags: ['myapp:latest'],
      buildTime: 45000,
      metadata: {
        dockerfile: 'Dockerfile',
        context: '.',
      },
    };
    expect(() => BuildResultSchema.parse(buildOutput)).not.toThrow();

    // Deploy input
    const deployInput = {
      sessionId: 'workflow-123',
      namespace: 'production',
      wait: true,
    };
    expect(() => DeployApplicationInput.parse(deployInput)).not.toThrow();

    // Deploy result
    const deployOutput = {
      success: true,
      sessionId: 'workflow-123',
      namespace: 'production',
      deploymentName: 'myapp',
      serviceName: 'myapp-service',
      ready: true,
      replicas: 3,
    };
    expect(() => DeploymentResultSchema.parse(deployOutput)).not.toThrow();
  });

  it('should maintain type safety through workflow', () => {
    // Using type inference
    const analyzeParams: AnalyzeRepositoryParams = {
      repoPath: '/app',
      depth: 'shallow',
      includeTests: false,
    };

    const analysisResult: AnalysisResult = {
      success: true,
      sessionId: 'test-session',
      language: 'typescript',
      dependencies: [],
      ports: [8080],
      hasDockerfile: true,
      hasDockerCompose: true,
      hasKubernetes: false,
    };

    const buildParams: BuildImageParams = {
      sessionId: analysisResult.sessionId, // Type-safe session passing
      tags: [`app:${analysisResult.language}`], // Using analysis result
    };

    const buildResult: BuildResult = {
      success: true,
      sessionId: buildParams.sessionId,
      imageId: 'sha256:def456',
      tags: buildParams.tags ?? [],
      buildTime: 60000,
      metadata: {
        dockerfile: 'Dockerfile',
        context: '.',
      },
    };

    // All type-safe operations
    expect(analyzeParams.repoPath).toBe('/app');
    expect(buildParams.sessionId).toBe('test-session');
    expect(buildResult.tags).toContain('app:typescript');
  });
});
