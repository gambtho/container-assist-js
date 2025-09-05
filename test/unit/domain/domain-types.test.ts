/**
 * Domain Types Tests - Post Cleanup
 * Tests for the remaining domain types after dead code elimination
 */

import { describe, test, expect } from '@jest/globals';
import {
  // Docker types (only essential ones kept after cleanup)
  DockerBuildOptions,
  DockerBuildResult, 
  DockerScanResult,
  
  // Scanning types (only essential ones kept)
  ScanOptions,
  ScanResult,
  
  // Result type for error handling
  Result,
  
  // Session types (kept after cleanup)
  Session,
  WorkflowState,
  AnalysisResult,
  
  // Error types
  ErrorCode,
  DomainError,
} from '../../../src/domain/types/index';

describe('Domain Types - Essential Types After Cleanup', () => {
  describe('Docker Types', () => {
    test('should handle DockerBuildOptions type structure', () => {
      const options: DockerBuildOptions = {
        context: './app',
        dockerfile: 'Dockerfile',
        tags: ['myapp:latest'],
        buildArgs: { NODE_ENV: 'production' }
      };
      
      // Type-level test - if this compiles, the type is working
      expect(options.context).toBe('./app');
      expect(options.tags).toContain('myapp:latest');
      expect(options.buildArgs?.NODE_ENV).toBe('production');
    });

    test('should handle DockerBuildResult type structure', () => {
      const result: DockerBuildResult = {
        imageId: 'sha256:abc123',
        tags: ['myapp:latest'],
        success: true,
        logs: ['Build step 1/3']
      };
      
      expect(result.success).toBe(true);
      expect(result.imageId).toBe('sha256:abc123');
      expect(result.logs).toContain('Build step 1/3');
    });

    test('should handle DockerScanResult type structure', () => {
      const scanResult: DockerScanResult = {
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scanner: 'trivy'
      };
      
      expect(scanResult.vulnerabilities).toEqual([]);
      expect(scanResult.summary.total).toBe(0);
      expect(scanResult.scanner).toBe('trivy');
    });
  });

  describe('Session Types', () => {
    test('should handle Session type structure', () => {
      const session: Session = {
        id: 'test-session-123',
        status: 'pending',
        repoPath: '/test/repo',
        workflowState: {
          currentStep: null,
          completedSteps: []
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };
      
      expect(session.id).toBe('test-session-123');
      expect(session.status).toBe('pending');
      expect(session.workflowState.completedSteps).toEqual([]);
    });

    test('should handle WorkflowState type structure', () => {
      const state: WorkflowState = {
        currentStep: 'analyze',
        completedSteps: ['setup'],
        analysisResult: {
          language: 'javascript',
          dependencies: []
        }
      };
      
      expect(state.currentStep).toBe('analyze');
      expect(state.completedSteps).toContain('setup');
      expect(state.analysisResult?.language).toBe('javascript');
    });

    test('should handle AnalysisResult type structure', () => {
      const analysis: AnalysisResult = {
        language: 'typescript',
        dependencies: [
          { name: 'express', version: '4.18.2' }
        ],
        ports: [3000],
        hasDockerfile: false
      };
      
      expect(analysis.language).toBe('typescript');
      expect(analysis.dependencies).toHaveLength(1);
      expect(analysis.ports).toContain(3000);
    });
  });

  describe('Error Handling Types', () => {
    test('should handle ErrorCode enum values', () => {
      // Test that key error codes are defined
      expect(ErrorCode.VALIDATION_ERROR).toBeDefined();
      expect(ErrorCode.SessionNotFound).toBeDefined();
      expect(ErrorCode.DockerNotAvailable).toBeDefined();
      expect(ErrorCode.WorkflowFailed).toBeDefined();
    });

    test('should create DomainError instances', () => {
      const error = new DomainError(ErrorCode.VALIDATION_ERROR, 'Test error message');
      
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error).toBeInstanceOf(DomainError);
    });
  });

  describe('Scanning Types', () => {
    test('should handle ScanOptions type structure', () => {
      const options: ScanOptions = {
        severity: ['high', 'critical'],
        format: 'json'
      };
      
      expect(options.severity).toContain('high');
      expect(options.format).toBe('json');
    });

    test('should handle ScanResult type structure', () => {
      const result: ScanResult = {
        vulnerabilities: [
          {
            severity: 'medium',
            package: 'lodash',
            version: '4.17.20'
          }
        ],
        summary: {
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
          total: 1
        }
      };
      
      expect(result.vulnerabilities).toHaveLength(1);
      expect(result.summary.medium).toBe(1);
      expect(result.summary.total).toBe(1);
    });
  });
});

describe('Type System Integration', () => {
  test('should maintain type compatibility between related types', () => {
    // Test that types work together as expected
    const buildOptions: DockerBuildOptions = {
      context: './app',
      tags: ['test:v1.0']
    };
    
    const buildResult: DockerBuildResult = {
      imageId: 'sha256:abc123def456',
      tags: buildOptions.tags, // Should be compatible
      logs: ['Step 1/3: FROM node:18'],
      success: true
    };
    
    expect(buildResult.tags).toEqual(buildOptions.tags);
    expect(buildResult.success).toBe(true);
  });
  
  test('should handle workflow state progression', () => {
    const initialState: WorkflowState = {
      currentStep: 'analyze',
      completedSteps: []
    };
    
    const progressedState: WorkflowState = {
      ...initialState,
      currentStep: 'build',
      completedSteps: ['analyze'],
      analysisResult: {
        language: 'nodejs',
        dependencies: []
      }
    };
    
    expect(progressedState.completedSteps).toContain('analyze');
    expect(progressedState.currentStep).toBe('build');
    expect(progressedState.analysisResult?.language).toBe('nodejs');
  });
});