import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { runContainerizationWorkflow, runBuildOnlyWorkflow, WorkflowConfig } from '../../../src/workflows/containerization-workflow';
import { Success, Failure } from '../../../src/types/core';
import type { Logger } from 'pino';

// Mock all tool dependencies
jest.mock('../../../src/tools/analyze-repo');
jest.mock('../../../src/tools/generate-dockerfile');
jest.mock('../../../src/tools/build-image');
jest.mock('../../../src/tools/scan');
jest.mock('../../../src/workflows/dockerfile-sampling');

import { analyzeRepo } from '../../../src/tools/analyze-repo';
import { generateDockerfile } from '../../../src/tools/generate-dockerfile';
import { buildImage } from '../../../src/tools/build-image';
import { scanImage } from '../../../src/tools/scan';
import { generateBestDockerfile } from '../../../src/workflows/dockerfile-sampling';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger)
} as any;

// Mock tool functions
const mockAnalyzeRepo = analyzeRepo as jest.MockedFunction<typeof analyzeRepo>;
const mockGenerateDockerfile = generateDockerfile as jest.MockedFunction<typeof generateDockerfile>;
const mockBuildImage = buildImage as jest.MockedFunction<typeof buildImage>;
const mockScanImage = scanImage as jest.MockedFunction<typeof scanImage>;
const mockGenerateBestDockerfile = generateBestDockerfile as jest.MockedFunction<typeof generateBestDockerfile>;

describe('Containerization Workflow', () => {
  const testRepoPath = '/test/repo';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockAnalyzeRepo.mockResolvedValue(Success({
      repoPath: testRepoPath,
      language: 'nodejs',
      packageManager: 'npm',
      hasDockerfile: false,
      dependencies: ['express', 'react'],
      structure: { files: [], directories: [] }
    }));

    mockGenerateDockerfile.mockResolvedValue(Success({
      content: 'FROM node:16\nCOPY . .\nRUN npm install\nCMD ["npm", "start"]',
      path: 'Dockerfile',
      metadata: { baseImage: 'node:16', stages: 1 }
    }));

    mockBuildImage.mockResolvedValue(Success({
      imageId: 'sha256:abc123def456',
      tags: ['test:latest'],
      size: 1024000,
      logs: ['Step 1/4 : FROM node:16'],
      success: true
    }));

    mockScanImage.mockResolvedValue(Success({
      imageId: 'sha256:abc123def456',
      vulnerabilities: { critical: 0, high: 0, medium: 2, low: 5, total: 7 },
      scanTime: '2023-01-01T12:00:00Z'
    }));

    mockGenerateBestDockerfile.mockResolvedValue(Success({
      content: 'FROM node:16-alpine\nCOPY . .\nRUN npm ci --production\nCMD ["npm", "start"]',
      metadata: { optimization: 'size', score: 95 },
      alternatives: []
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runContainerizationWorkflow', () => {
    it('should complete full workflow successfully with default config', async () => {
      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.ok).toBe(true);
      expect(result.value.analysis).toBeDefined();
      expect(result.value.dockerfile).toBeDefined();
      expect(result.value.imageId).toBe('sha256:abc123def456');
      expect(result.value.scanResult).toBeDefined();
      expect(result.value.duration).toBeGreaterThan(0);
      expect(result.value.errors).toEqual([]);

      // Verify all steps were called
      expect(mockAnalyzeRepo).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        repoPath: testRepoPath,
        depth: 3,
        includeTests: false
      }, mockLogger);

      expect(mockGenerateDockerfile).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        optimization: true,
        multistage: true
      }, mockLogger);

      expect(mockBuildImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        context: testRepoPath,
        dockerfile: 'Dockerfile',
        tags: [expect.stringMatching(/^workflow-\d+:latest$/)],
        buildArgs: {}
      }, mockLogger);

      expect(mockScanImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        scanner: 'trivy',
        severityThreshold: 'high'
      }, mockLogger);
    });

    it('should use sampling when enabled', async () => {
      const config: WorkflowConfig = {
        enableSampling: true
      };

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(mockGenerateBestDockerfile).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        repoPath: testRepoPath
      }, { environment: 'production' }, mockLogger);

      expect(mockGenerateDockerfile).not.toHaveBeenCalled();
      expect(result.value.dockerfile).toContain('FROM node:16-alpine');
    });

    it('should apply custom build arguments', async () => {
      const config: WorkflowConfig = {
        buildArgs: { NODE_ENV: 'production', API_URL: 'https://api.prod.com' }
      };

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(mockBuildImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        context: testRepoPath,
        dockerfile: 'Dockerfile',
        tags: [expect.stringMatching(/^workflow-\d+:latest$/)],
        buildArgs: { NODE_ENV: 'production', API_URL: 'https://api.prod.com' }
      }, mockLogger);
    });

    it('should use custom vulnerability threshold', async () => {
      const config: WorkflowConfig = {
        maxVulnerabilityLevel: 'critical'
      };

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(mockScanImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        scanner: 'trivy',
        severityThreshold: 'critical'
      }, mockLogger);
    });

    it('should handle repository analysis failure', async () => {
      mockAnalyzeRepo.mockResolvedValue(Failure('Repository analysis failed: not a valid project'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Analysis failed: Repository analysis failed: not a valid project');

      // Should not proceed to other steps
      expect(mockGenerateDockerfile).not.toHaveBeenCalled();
      expect(mockBuildImage).not.toHaveBeenCalled();
      expect(mockScanImage).not.toHaveBeenCalled();
    });

    it('should handle Dockerfile generation failure', async () => {
      mockGenerateDockerfile.mockResolvedValue(Failure('Dockerfile generation failed: unsupported language'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Dockerfile generation failed: Dockerfile generation failed: unsupported language');

      // Should not proceed to build and scan steps
      expect(mockBuildImage).not.toHaveBeenCalled();
      expect(mockScanImage).not.toHaveBeenCalled();
    });

    it('should handle sampling Dockerfile generation failure', async () => {
      const config: WorkflowConfig = { enableSampling: true };
      mockGenerateBestDockerfile.mockResolvedValue(Failure('Sampling failed: no valid candidates'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Dockerfile generation failed: Sampling failed: no valid candidates');

      expect(mockBuildImage).not.toHaveBeenCalled();
      expect(mockScanImage).not.toHaveBeenCalled();
    });

    it('should handle image build failure', async () => {
      mockBuildImage.mockResolvedValue(Failure('Build failed: syntax error in Dockerfile'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Build failed: Build failed: syntax error in Dockerfile');

      // Should not proceed to scan step
      expect(mockScanImage).not.toHaveBeenCalled();
    });

    it('should continue workflow when scan fails', async () => {
      mockScanImage.mockResolvedValue(Failure('Scan failed: trivy not available'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.ok).toBe(true);
      expect(result.value.scanResult).toBeUndefined();
      expect(result.value.errors).toContain('Scan failed: Scan failed: trivy not available');

      expect(mockLogger.warn).toHaveBeenCalledWith({
        error: 'Scan failed: trivy not available'
      }, 'Image scan failed, but continuing workflow');
    });

    it('should handle critical vulnerabilities with auto-remediation enabled', async () => {
      const config: WorkflowConfig = {
        enableAutoRemediation: true
      };

      mockScanImage.mockResolvedValue(Success({
        imageId: 'sha256:abc123def456',
        vulnerabilities: { critical: 2, high: 3, medium: 5, low: 10, total: 20 },
        scanTime: '2023-01-01T12:00:00Z'
      }));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(result.value.ok).toBe(true);
      expect(result.value.scanResult.vulnerabilities.critical).toBe(2);
      expect(result.value.scanResult.vulnerabilities.high).toBe(3);

      expect(mockLogger.warn).toHaveBeenCalledWith({
        criticalIssues: 5
      }, 'Critical vulnerabilities found, but auto-remediation not implemented in simple workflow');
    });

    it('should handle exceptions gracefully', async () => {
      mockAnalyzeRepo.mockRejectedValue(new Error('Unexpected error during analysis'));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unexpected error during analysis');

      expect(mockLogger.error).toHaveBeenCalledWith({
        error: 'Unexpected error during analysis',
        duration: expect.any(Number),
        sessionId: expect.stringMatching(/^workflow-\d+$/)
      }, 'Containerization workflow failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockAnalyzeRepo.mockRejectedValue('String error');

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('String error');
    });

    it('should log workflow start and completion', async () => {
      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith({
        repoPath: testRepoPath,
        sessionId: expect.stringMatching(/^workflow-\d+$/)
      }, 'Starting containerization workflow');

      expect(mockLogger.info).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^workflow-\d+$/),
        duration: expect.any(Number),
        imageId: 'sha256:abc123def456',
        vulnerabilities: 7
      }, 'Containerization workflow completed successfully');
    });

    it('should log each workflow step', async () => {
      await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith('Step 1: Analyzing repository');
      expect(mockLogger.info).toHaveBeenCalledWith('Step 2: Generating Dockerfile');
      expect(mockLogger.info).toHaveBeenCalledWith('Step 3: Building Docker image');
      expect(mockLogger.info).toHaveBeenCalledWith('Step 4: Scanning image for vulnerabilities');
    });

    it('should measure workflow duration correctly', async () => {
      const startTime = Date.now();
      
      // Add delay to ensure duration > 0
      mockAnalyzeRepo.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(Success({
        repoPath: testRepoPath,
        language: 'nodejs'
      })), 10)));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.duration).toBeGreaterThan(0);
      expect(result.value.duration).toBeGreaterThanOrEqual(Date.now() - startTime - 100); // Allow some margin
    });
  });

  describe('runBuildOnlyWorkflow', () => {
    it('should complete build-only workflow successfully', async () => {
      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);
      expect(result.value.imageId).toBe('sha256:abc123def456');
      expect(result.value.duration).toBeGreaterThan(0);

      // Should call analysis, dockerfile generation, and build
      expect(mockAnalyzeRepo).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^build-\d+$/),
        repoPath: testRepoPath
      }, mockLogger);

      expect(mockGenerateDockerfile).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^build-\d+$/)
      }, mockLogger);

      expect(mockBuildImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^build-\d+$/),
        context: testRepoPath,
        buildArgs: {}
      }, mockLogger);

      // Should NOT call scan
      expect(mockScanImage).not.toHaveBeenCalled();
    });

    it('should apply custom build arguments in build-only workflow', async () => {
      const config: WorkflowConfig = {
        buildArgs: { NODE_ENV: 'development' }
      };

      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(mockBuildImage).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^build-\d+$/),
        context: testRepoPath,
        buildArgs: { NODE_ENV: 'development' }
      }, mockLogger);
    });

    it('should handle analysis failure in build-only workflow', async () => {
      mockAnalyzeRepo.mockResolvedValue(Failure('Analysis failed'));

      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Analysis failed: Analysis failed');

      expect(mockGenerateDockerfile).not.toHaveBeenCalled();
      expect(mockBuildImage).not.toHaveBeenCalled();
    });

    it('should handle dockerfile generation failure in build-only workflow', async () => {
      mockGenerateDockerfile.mockResolvedValue(Failure('Dockerfile generation failed'));

      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Dockerfile generation failed: Dockerfile generation failed');

      expect(mockBuildImage).not.toHaveBeenCalled();
    });

    it('should handle build failure in build-only workflow', async () => {
      mockBuildImage.mockResolvedValue(Failure('Build failed'));

      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Build failed: Build failed');
    });

    it('should handle exceptions in build-only workflow', async () => {
      mockAnalyzeRepo.mockRejectedValue(new Error('Unexpected error'));

      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unexpected error');

      expect(mockLogger.error).toHaveBeenCalledWith({
        error: 'Unexpected error',
        sessionId: expect.stringMatching(/^build-\d+$/)
      }, 'Build workflow failed');
    });

    it('should log build-only workflow start and completion', async () => {
      const result = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);

      expect(mockLogger.info).toHaveBeenCalledWith({
        repoPath: testRepoPath,
        sessionId: expect.stringMatching(/^build-\d+$/)
      }, 'Starting build-only workflow');

      expect(mockLogger.info).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(/^build-\d+$/),
        duration: expect.any(Number)
      }, 'Build-only workflow completed');
    });

    it('should generate unique session IDs', async () => {
      const result1 = await runContainerizationWorkflow(testRepoPath, mockLogger);
      const result2 = await runBuildOnlyWorkflow(testRepoPath, mockLogger);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      // Session IDs should be different and follow expected patterns
      const fullWorkflowCall = mockLogger.info.mock.calls.find(call => 
        call[0] && typeof call[0] === 'object' && 'sessionId' in call[0] && 
        call[0].sessionId.startsWith('workflow-')
      );
      const buildOnlyCall = mockLogger.info.mock.calls.find(call => 
        call[0] && typeof call[0] === 'object' && 'sessionId' in call[0] && 
        call[0].sessionId.startsWith('build-')
      );

      expect(fullWorkflowCall).toBeDefined();
      expect(buildOnlyCall).toBeDefined();
      expect(fullWorkflowCall![0].sessionId).not.toEqual(buildOnlyCall![0].sessionId);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle missing scan result vulnerabilities', async () => {
      mockScanImage.mockResolvedValue(Success({
        imageId: 'sha256:abc123def456',
        scanTime: '2023-01-01T12:00:00Z'
        // No vulnerabilities field
      }));

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger);

      expect(result.ok).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          vulnerabilities: 0
        }),
        'Containerization workflow completed successfully'
      );
    });

    it('should handle workflow with all optional config', async () => {
      const config: WorkflowConfig = {
        enableSampling: false,
        maxVulnerabilityLevel: 'low',
        enableAutoRemediation: false,
        buildArgs: {},
        stepsToRun: [],
        customDockerfile: undefined
      };

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(result.value.ok).toBe(true);
    });

    it('should handle empty build args', async () => {
      const config: WorkflowConfig = {
        buildArgs: {}
      };

      const result = await runContainerizationWorkflow(testRepoPath, mockLogger, config);

      expect(result.ok).toBe(true);
      expect(mockBuildImage).toHaveBeenCalledWith(
        expect.objectContaining({
          buildArgs: {}
        }),
        mockLogger
      );
    });
  });
});