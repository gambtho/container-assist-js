/**
 * Unit tests for AI-powered base image resolution handler
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import resolveBaseImagesHandler from '../../src/service/tools/handlers/resolve-base-images.js';
import { ToolContext } from '../../src/service/tools/types.js';
import { ok } from '../../src/domain/types/index.js';

describe('Resolve Base Images Handler', () => {
  let mockContext: ToolContext;
  let mockSession: any;

  beforeEach(() => {
    mockSession = {
      id: 'test-session',
      workflow_state: {
        analysis_result: {
          language: 'nodejs',
          language_version: '20',
          framework: 'express',
          framework_version: '4.18.2',
          build_system: {
            type: 'npm',
            build_file: 'package.json'
          },
          dependencies: [
            { name: 'express', version: '4.18.2', type: 'runtime' },
            { name: 'typescript', version: '5.0.0', type: 'dev' }
          ]
        }
      }
    };

    mockContext = {
      logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as any,
      sessionService: {
        get: jest.fn().mockResolvedValue(mockSession),
        updateAtomic: jest.fn().mockResolvedValue(undefined)
      } as any,
      structuredSampler: {
        sampleJSON: jest.fn().mockResolvedValue(ok({
          primary_recommendation: {
            image: 'node:20-alpine',
            reasoning: 'Node.js 20 with Alpine provides optimal balance of security and performance',
            security_notes: 'Alpine Linux reduces attack surface with minimal packages',
            performance_notes: 'Smaller image size leads to faster deployment times',
            tradeoffs: 'Optimized for size over ease of debugging'
          },
          alternatives: [
            {
              image: 'node:20-slim',
              use_case: 'When you need more debugging tools',
              pros: ['Better debugging support', 'More complete tooling'],
              cons: ['Larger image size', 'More potential vulnerabilities']
            }
          ],
          security_considerations: {
            vulnerability_status: 'Regularly updated with security patches',
            update_frequency: 'Weekly security updates',
            compliance: 'Meets standard security requirements'
          },
          optimization_tips: [
            'Use multi-stage builds to minimize final image size',
            'Copy package.json first for better layer caching'
          ],
          health_check_recommendation: {
            endpoint: '/health',
            command: 'curl -f http://localhost:3000/health || exit 1'
          }
        }))
      } as any
    };
  });

  it('should successfully resolve base images for Node.js project', async () => {
    const input = {
      session_id: 'test-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const,
      architectures: ['amd64']
    };

    const result = await resolveBaseImagesHandler.execute(input, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primary_recommendation.image).toBe('node:20-alpine');
      expect(result.data.primary_recommendation.reasoning).toContain('balance of security and performance');
      expect(result.data.alternatives).toHaveLength(1);
      expect(result.data.security_considerations).toBeDefined();
      expect(result.data.optimization_tips).toBeDefined();
      expect(result.data.health_check_recommendation).toBeDefined();
    }
  });

  it('should fail when session service is not available', async () => {
    const input = {
      session_id: 'test-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const
    };

    const contextWithoutSessionService = { ...mockContext, sessionService: undefined };
    const result = await resolveBaseImagesHandler.execute(input, contextWithoutSessionService);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.message).toContain('Session service not available');
    }
  });

  it('should fail when session not found', async () => {
    const input = {
      session_id: 'nonexistent-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const
    };

    mockContext.sessionService!.get = jest.fn().mockResolvedValue(null);
    const result = await resolveBaseImagesHandler.execute(input, mockContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.message).toContain('Session not found');
    }
  });

  it('should fail when repository analysis is missing', async () => {
    const input = {
      session_id: 'test-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const
    };

    const sessionWithoutAnalysis = {
      id: 'test-session',
      workflow_state: {}
    };

    mockContext.sessionService!.get = jest.fn().mockResolvedValue(sessionWithoutAnalysis);
    const result = await resolveBaseImagesHandler.execute(input, mockContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.message).toContain('Repository must be analyzed first');
    }
  });

  it('should fail when AI structured sampler is not available', async () => {
    const input = {
      session_id: 'test-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const
    };

    const contextWithoutSampler = { ...mockContext, structuredSampler: undefined };
    const result = await resolveBaseImagesHandler.execute(input, contextWithoutSampler);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.message).toContain('AI structured sampler not available');
    }
  });

  it('should handle different language contexts correctly', async () => {
    const testCase = { language: 'python', framework: 'django', expected: 'python' };
    
    const sessionWithLanguage = {
      ...mockSession,
      workflow_state: {
        analysis_result: {
          ...mockSession.workflow_state.analysis_result,
          language: testCase.language,
          framework: testCase.framework
        }
      }
    };

    const contextWithLanguage = {
      ...mockContext,
      sessionService: {
        get: jest.fn().mockResolvedValue(sessionWithLanguage),
        updateAtomic: jest.fn().mockResolvedValue(undefined)
      },
      structuredSampler: {
        sampleJSON: jest.fn().mockResolvedValue(ok({
          primary_recommendation: {
            image: `${testCase.expected}:3.11-alpine`,
            reasoning: `Optimized for ${testCase.language} development`,
            security_notes: 'Regular security updates',
            performance_notes: 'Good performance characteristics',
            tradeoffs: 'Standard tradeoffs'
          },
          alternatives: [
            {
              image: 'python:3.11',
              use_case: 'When you need more debugging tools',
              pros: ['Better debugging support', 'More complete tooling'],
              cons: ['Larger image size', 'More potential vulnerabilities']
            }
          ],
          security_considerations: {
            vulnerability_status: 'Clean',
            update_frequency: 'Regular',
            compliance: 'Standard'
          },
          optimization_tips: [
            'Use multi-stage builds to minimize final image size'
          ],
          health_check_recommendation: {
            endpoint: '/health',
            command: 'curl -f http://localhost:8080/health || exit 1'
          }
        }))
      }
    };

    const input = {
      session_id: 'test-session',
      security_level: 'standard' as const,
      performance_priority: 'size' as const,
      target_environment: 'cloud' as const
    };

    const result = await resolveBaseImagesHandler.execute(input, contextWithLanguage);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primary_recommendation.image).toContain(testCase.expected);
    }
  });

  it('should store recommendation in session after successful resolution', async () => {
    const input = {
      session_id: 'test-session',
      security_level: 'hardened' as const,
      performance_priority: 'speed' as const,
      target_environment: 'on-prem' as const
    };

    const result = await resolveBaseImagesHandler.execute(input, mockContext);

    expect(result.success).toBe(true);
    expect(mockContext.sessionService!.updateAtomic).toHaveBeenCalledWith(
      'test-session',
      expect.any(Function)
    );
  });
});