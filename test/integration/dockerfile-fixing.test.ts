/**
 * AI-Powered Dockerfile Fixing Integration Tests
 * Tests the comprehensive error analysis and fixing capabilities
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { nanoid } from 'nanoid';
import { fixDockerfileHandler } from '../../src/service/tools/handlers/fix-dockerfile.js';
import type { ToolContext } from '../../src/service/tools/types.js';

describe('AI-Powered Dockerfile Fixing', () => {
  let mockContext: ToolContext;
  let sessionId: string;

  beforeEach(() => {
    sessionId = nanoid();
    
    mockContext = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      } as any,
      sessionService: {
        get: jest.fn(),
        updateAtomic: jest.fn(),
      } as any,
      structuredSampler: {
        sampleJSON: jest.fn()
      } as any,
      contentValidator: {
        validateContent: jest.fn().mockReturnValue({
          isValid: true,
          issues: []
        })
      } as any,
      progressEmitter: {
        emit: jest.fn()
      } as any
    };
  });

  describe('Error Analysis and Fixing', () => {
    test('should fix missing base image error', async () => {
      // Mock session with dockerfile
      const mockSession = {
        workflow_state: {
          dockerfile_result: {
            content: 'RUN apt-get update\nCOPY . /app\nWORKDIR /app\nCMD ["npm", "start"]'
          },
          analysis_result: {
            language: 'javascript',
            framework: 'nodejs',
            dependencies: ['express', 'lodash'],
            build_system: { type: 'npm' },
            entryPoint: 'index.js'
          }
        }
      };

      const mockFix = {
        success: true,
        data: {
          root_cause_analysis: 'The Dockerfile is missing a FROM instruction which is required as the first instruction.',
          fixed_dockerfile: 'FROM node:18-alpine\nRUN apt-get update\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . /app\nWORKDIR /app\nEXPOSE 3000\nUSER node\nCMD ["npm", "start"]',
          changes_made: [
            {
              line_changed: '1',
              old_content: '',
              new_content: 'FROM node:18-alpine',
              reasoning: 'Added FROM instruction with Node.js base image suitable for the detected language and framework'
            },
            {
              line_changed: '2',
              old_content: 'COPY . /app',
              new_content: 'COPY package*.json ./',
              reasoning: 'Copy package files first for better layer caching'
            }
          ],
          security_improvements: [
            'Added USER node instruction to run as non-root user',
            'Used specific Node.js version instead of latest tag'
          ],
          performance_optimizations: [
            'Copied package.json first for better Docker layer caching',
            'Used npm ci for faster and more reliable installs'
          ],
          alternative_approaches: [
            {
              approach: 'Multi-stage build with distroless final image',
              pros: ['Smaller final image size', 'Better security'],
              cons: ['More complex build process'],
              when_to_use: 'Production deployments where image size matters'
            }
          ],
          testing_recommendations: [
            'docker build -t test-image .',
            'docker run --rm test-image npm test'
          ],
          prevention_tips: [
            'Always start Dockerfile with FROM instruction',
            'Use .dockerignore to exclude unnecessary files',
            'Validate Dockerfile syntax with docker build --dry-run'
          ]
        }
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue(mockSession);
      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue(mockFix);
      (mockContext.sessionService!.updateAtomic as jest.Mock).mockResolvedValue({});

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'ERROR: Dockerfile parse error line 1: FROM instruction must be the first non-comment instruction in the Dockerfile',
        buildContext: 'Building Node.js application'
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fixed_dockerfile).toContain('FROM node:18-alpine');
        expect(result.data.root_cause_analysis).toContain('FROM instruction');
        expect(result.data.changes_made).toHaveLength(2);
        expect(result.data.security_improvements.length).toBeGreaterThan(0);
        expect(result.data.performance_optimizations.length).toBeGreaterThan(0);
      }
    });

    test('should fix dependency installation errors', async () => {
      const mockSession = {
        workflow_state: {
          dockerfile_result: {
            content: 'FROM python:3.9\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD ["python", "app.py"]'
          },
          analysis_result: {
            language: 'python',
            framework: 'flask',
            dependencies: ['flask', 'numpy', 'scikit-learn'],
            build_system: { type: 'pip' }
          }
        }
      };

      const mockFix = {
        success: true,
        data: {
          root_cause_analysis: 'Missing system dependencies required for numpy and scikit-learn compilation.',
          fixed_dockerfile: 'FROM python:3.9-slim\nRUN apt-get update && apt-get install -y \\\n    build-essential \\\n    && rm -rf /var/lib/apt/lists/*\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\nCMD ["python", "app.py"]',
          changes_made: [
            {
              line_changed: '2-3',
              old_content: 'COPY requirements.txt .',
              new_content: 'RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*\nCOPY requirements.txt .',
              reasoning: 'Added system dependencies required for compiling Python packages with C extensions'
            }
          ],
          security_improvements: [
            'Used slim base image to reduce attack surface',
            'Cleaned up package manager cache to reduce image size'
          ],
          performance_optimizations: [
            'Used --no-cache-dir to prevent pip from caching packages',
            'Combined RUN commands to reduce Docker layers'
          ],
          alternative_approaches: [],
          testing_recommendations: [
            'docker build -t python-app .',
            'docker run --rm -p 5000:5000 python-app'
          ],
          prevention_tips: [
            'Consider using pre-built wheels or conda packages',
            'Use multi-stage builds to exclude build tools from final image'
          ]
        }
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue(mockSession);
      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue(mockFix);
      (mockContext.sessionService!.updateAtomic as jest.Mock).mockResolvedValue({});

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'ERROR: Could not build wheels for numpy, scikit-learn which use PEP 517 and cannot be installed directly',
        buildContext: 'Building Python Flask application'
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fixed_dockerfile).toContain('build-essential');
        expect(result.data.root_cause_analysis).toContain('system dependencies');
      }
    });

    test('should handle build context path errors', async () => {
      const mockSession = {
        workflow_state: {
          dockerfile_result: {
            content: 'FROM node:16\nCOPY src/package.json .\nCOPY nonexistent-file.txt .\nCMD ["node", "index.js"]'
          },
          analysis_result: {
            language: 'javascript',
            framework: 'express'
          }
        }
      };

      const mockFix = {
        success: true,
        data: {
          root_cause_analysis: 'Dockerfile tries to copy files that do not exist in the build context.',
          fixed_dockerfile: 'FROM node:16\nCOPY package*.json .\nRUN npm install\nCOPY src/ ./src/\nCMD ["node", "src/index.js"]',
          changes_made: [
            {
              line_changed: '3',
              old_content: 'COPY nonexistent-file.txt .',
              new_content: 'RUN npm install',
              reasoning: 'Removed non-existent file copy and added proper npm install step'
            }
          ],
          security_improvements: [],
          performance_optimizations: [
            'Improved layer caching by copying package.json first'
          ],
          alternative_approaches: [],
          testing_recommendations: [
            'Verify all COPY paths exist: ls -la src/',
            'Use .dockerignore to exclude unnecessary files'
          ],
          prevention_tips: [
            'Always verify file paths before adding COPY instructions',
            'Use relative paths consistently',
            'Test builds locally before deployment'
          ]
        }
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue(mockSession);
      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue(mockFix);
      (mockContext.sessionService!.updateAtomic as jest.Mock).mockResolvedValue({});

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'COPY failed: file not found in build context or excluded by .dockerignore: stat nonexistent-file.txt: file does not exist',
        buildContext: 'Node.js application build'
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.root_cause_analysis).toContain('do not exist');
        expect(result.data.prevention_tips.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Validation and Error Handling', () => {
    test('should fail when error message is empty', async () => {
      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: '',
        buildContext: 'test'
      }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Error message is required');
      }
    });

    test('should fail when session service is not available', async () => {
      const contextWithoutSession = {
        ...mockContext,
        sessionService: undefined
      };

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'some error',
        buildContext: 'test'
      }, contextWithoutSession);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Session service not available');
      }
    });

    test('should fail when AI structured sampler is not available', async () => {
      const contextWithoutAI = {
        ...mockContext,
        structuredSampler: undefined
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue({
        workflowState: { dockerfile_result: { content: 'FROM node:16' } }
      });

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'some error',
        buildContext: 'test'
      }, contextWithoutAI);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('AI structured sampler not available');
      }
    });

    test('should handle AI sampling failures gracefully', async () => {
      const mockSession = {
        workflow_state: {
          dockerfile_result: { content: 'FROM node:16' },
          analysis_result: { language: 'javascript' }
        }
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue(mockSession);
      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue({
        success: false,
        error: { message: 'AI service unavailable' }
      });

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'build failed',
        buildContext: 'test'
      }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('AI Dockerfile fixing failed');
      }
    });
  });

  describe('Session Integration', () => {
    test('should store fix history in session', async () => {
      const mockSession = {
        workflow_state: {
          dockerfile_result: { content: 'FROM node:16' },
          analysis_result: { language: 'javascript' },
          dockerfile_fix_history: []
        }
      };

      const mockFix = {
        success: true,
        data: {
          root_cause_analysis: 'Test fix',
          fixed_dockerfile: 'FROM node:18\nCMD ["node"]',
          changes_made: [],
          security_improvements: [],
          performance_optimizations: [],
          alternative_approaches: [],
          testing_recommendations: [],
          prevention_tips: []
        }
      };

      (mockContext.sessionService!.get as jest.Mock).mockResolvedValue(mockSession);
      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue(mockFix);
      (mockContext.sessionService!.updateAtomic as jest.Mock).mockResolvedValue({});

      const result = await fixDockerfileHandler.execute({
        sessionId,
        errorMessage: 'test error',
        buildContext: 'test'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.sessionService!.updateAtomic).toHaveBeenCalledWith(
        sessionId,
        expect.any(Function)
      );
    });

    test('should work with provided dockerfile content', async () => {
      const mockFix = {
        success: true,
        data: {
          root_cause_analysis: 'Direct fix test',
          fixed_dockerfile: 'FROM node:18\nCMD ["node"]',
          changes_made: [],
          security_improvements: [],
          performance_optimizations: [],
          alternative_approaches: [],
          testing_recommendations: [],
          prevention_tips: []
        }
      };

      (mockContext.structuredSampler!.sampleJSON as jest.Mock).mockResolvedValue(mockFix);

      const result = await fixDockerfileHandler.execute({
        sessionId: '',
        errorMessage: 'test error',
        dockerfileContent: 'FROM node:old',
        buildContext: 'test'
      }, mockContext);

      expect(result.success).toBe(true);
      expect(mockContext.sessionService!.get).not.toHaveBeenCalled();
    });
  });
});