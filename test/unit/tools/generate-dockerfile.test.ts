/**
 * Unit Tests: Generate Dockerfile Tool
 * Tests the generate dockerfile tool functionality
 */

import { jest } from '@jest/globals';
import { generateDockerfile, type GenerateDockerfileConfig } from '../../../src/tools/generate-dockerfile/tool';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../__support__/utilities/mock-infrastructure';
import { promises as fs } from 'node:fs';

// Mock fs promises
jest.mock('node:fs', () => ({
  promises: {
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
  },
}));

// Mock MCP helper modules
jest.mock('@mcp/tools/tool-wrapper', () => ({
  wrapTool: jest.fn((name: string, fn: any) => ({ execute: fn })),
}));

jest.mock('@mcp/tools/session-helpers', () => ({
  resolveSession: jest.fn(),
  updateSessionData: jest.fn(),
}));

jest.mock('@mcp/tools/ai-helpers', () => ({
  aiGenerate: jest.fn(),
}));

jest.mock('@mcp/utils/progress-helper', () => ({
  reportProgress: jest.fn(),
}));

// Get references to mocks for use in tests
const { resolveSession: mockResolveSession, updateSessionData: mockUpdateSessionData } = require('@mcp/tools/session-helpers');
const { aiGenerate: mockAiGenerate } = require('@mcp/tools/ai-helpers');

// Mock lib modules
const mockSessionManager = {
  create: jest.fn().mockResolvedValue({
    sessionId: 'test-session-123',
    analysis_result: {
      language: 'javascript',
      framework: 'express',
      mainFile: 'server.js',
      packageManager: 'npm',
      hasTests: true,
    },
    metadata: {},
    completed_steps: [],
    errors: {},
    current_step: null,
    createdAt: '2025-09-08T11:12:40.362Z',
    updatedAt: '2025-09-08T11:12:40.362Z'
  }),
  get: jest.fn(),
  update: jest.fn(),
};

const mockMCPHostAI = {
  isAvailable: jest.fn().mockReturnValue(false),
  submitPrompt: jest.fn(),
  generateContent: jest.fn(),
  validateContent: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

// Need to also ensure resolveSession can fall back to creating session manager
jest.mock('@mcp/tools/session-helpers');

// Legacy mcp-host-ai module removed - using ToolContext pattern now

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
  createLogger: jest.fn(() => createMockLogger()),
}));

jest.mock('@lib/base-images', () => ({
  getRecommendedBaseImage: jest.fn((lang: string) => {
    const images: Record<string, string> = {
      javascript: 'node:18-alpine',
      python: 'python:3.11-slim',
      java: 'openjdk:17-slim',
      go: 'golang:1.20-alpine',
    };
    return images[lang] || 'ubuntu:22.04';
  }),
}));

jest.mock('@lib/text-processing', () => ({
  stripFencesAndNoise: jest.fn((text: string) => {
    if (!text) return '';
    return text.replace(/```[a-z]*\n?/gi, '').replace(/```$/g, '').trim();
  }),
  isValidDockerfileContent: jest.fn((content: string) => {
    if (!content) return false;
    return content.includes('FROM');
  }),
  extractBaseImage: jest.fn((content: string) => {
    if (!content) return 'unknown';
    const match = content.match(/FROM\s+([^\s]+)/);
    return match ? match[1] : 'unknown';
  }),
}));

describe('generateDockerfile', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: GenerateDockerfileConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      optimization: true,
      multistage: true,
      securityHardening: true,
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockSessionManager.update.mockResolvedValue(true);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    
    // Configure MCP helper mocks
    mockResolveSession.mockResolvedValue({
      ok: true,
      value: {
        id: 'test-session-123',
        state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            mainFile: 'server.js',
            packageManager: 'npm',
            hasTests: true,
          },
          repo_path: '/test/repo',
          metadata: {},
          completed_steps: [],
        },
      },
    });
    
    mockAiGenerate.mockResolvedValueOnce({
      ok: true,
      value: 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["npm", "start"]',
    });
    
    mockUpdateSessionData.mockResolvedValue({ ok: true });
  });

  describe('Successful Dockerfile generation', () => {
    beforeEach(() => {
      // Mock session with analysis results
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          mainFile: 'server.js',
          packageManager: 'npm',
          hasTests: true,
          dependencies: ['express', 'cors', 'helmet'],
        },
        repo_path: '/test/repo',
        metadata: {},
      });
      
      // Also update the resolveSession mock
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: {
              language: 'javascript',
              framework: 'express',
              mainFile: 'server.js',
              packageManager: 'npm',
              hasTests: true,
              dependencies: ['express', 'cors', 'helmet'],
            },
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
    });

    it('should generate a Node.js Dockerfile', async () => {
      const result = await generateDockerfile(config, mockLogger);

      if (!result.ok) {
        throw new Error(`Test failed: ${result.error}`);
      }
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.baseImage).toContain('node');
        expect(result.value.content).toContain('FROM');
        expect(result.value.content).toContain('WORKDIR /app');
        expect(result.value.multistage).toBe(true);
        expect(result.value.optimization).toBe(true);
      }
    });

    it('should use multi-stage build when requested with many dependencies', async () => {
      // Need more than 5 dependencies for multi-stage to trigger
      const manyDependencies = [
        { name: 'express' },
        { name: 'cors' },
        { name: 'helmet' },
        { name: 'mongoose' },
        { name: 'bcrypt' },
        { name: 'jsonwebtoken' },
      ];
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          mainFile: 'server.js',
          packageManager: 'npm',
          hasTests: true,
          dependencies: manyDependencies,
        },
        repo_path: '/test/repo',
        metadata: {},
      });
      
      // Also update the resolveSession mock
      const { resolveSession: rsMulti } = require('@mcp/tools/session-helpers');
      rsMulti.mockResolvedValue({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: {
            language: 'javascript',
            framework: 'express',
            mainFile: 'server.js',
            packageManager: 'npm',
            hasTests: true,
            dependencies: manyDependencies,
            },
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
      
      // Mock AI to return multi-stage dockerfile
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:18-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM node:18-alpine\nWORKDIR /app\nCOPY --from=builder /app/dist ./dist\nCOPY package*.json ./\nRUN npm ci --only=production\nCMD ["npm", "start"]',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('AS builder');
        expect(result.value.multistage).toBe(true);
      }
    });

    it('should apply security hardening', async () => {
      // Mock AI to return dockerfile with security hardening
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:18-alpine\nRUN adduser -D appuser\nWORKDIR /app\nCOPY --chown=appuser:appuser . .\nRUN npm ci\nUSER appuser\nCMD ["npm", "start"]',
      });
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Check for non-root user setup
        expect(result.value.content).toContain('USER appuser');
        expect(result.value.content).toContain('adduser');
      }
    });

    it('should include health check when requested', async () => {
      config.includeHealthcheck = true;
      
      // Mock AI to return dockerfile with healthcheck
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nHEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node healthcheck.js\nCMD ["npm", "start"]',
      });
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('HEALTHCHECK');
      }
    });

    it('should write Dockerfile to filesystem', async () => {
      await generateDockerfile(config, mockLogger);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Dockerfile'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should update session with Dockerfile info', async () => {
      await generateDockerfile(config, mockLogger);

      const { updateSessionData } = require('@mcp/tools/session-helpers');
      expect(updateSessionData).toHaveBeenCalledWith(
        expect.any(Object), // logger
        expect.any(Object), // context
        'test-session-123',
        expect.objectContaining({
          dockerfile_result: expect.objectContaining({
            path: expect.stringContaining('Dockerfile'),
            content: expect.any(String),
            multistage: true,
          }),
          completed_steps: expect.arrayContaining(['generate-dockerfile']),
        })
      );
    });
  });

  describe('Language-specific Dockerfile generation', () => {
    it('should generate Python Dockerfile', async () => {
      const pythonAnalysis = {
        language: 'python',
        framework: 'flask',
        mainFile: 'app.py',
        packageManager: 'pip',
      };
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: pythonAnalysis,
        repo_path: '/test/repo',
      });
      
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: pythonAnalysis,
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
      
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD ["python", "app.py"]',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toContain('python');
        expect(result.value.content).toContain('requirements.txt');
        expect(result.value.content).toContain('pip install');
      }
    });

    it('should generate Java Dockerfile', async () => {
      const javaAnalysis = {
        language: 'java',
        build_system: { type: 'maven' },
        mainFile: 'Application.java',
        dependencies: [],
      };
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: javaAnalysis,
        repo_path: '/test/repo',
        metadata: {},
      });
      
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: javaAnalysis,
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
      
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM openjdk:17-slim AS builder\nWORKDIR /app\nCOPY pom.xml .\nCOPY src ./src\nRUN mvn clean package\n\nFROM openjdk:17-slim\nWORKDIR /app\nCOPY --from=builder /app/target/*.jar app.jar\nCMD ["java", "-jar", "app.jar"]',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toContain('openjdk');
        // Java content should be present
        expect(result.value.content.toLowerCase()).toContain('java');
      }
    });

    it('should generate Go Dockerfile', async () => {
      const goAnalysis = {
        language: 'go',
        mainFile: 'main.go',
      };
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: goAnalysis,
        repo_path: '/test/repo',
      });
      
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: goAnalysis,
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
      
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM golang:1.20-alpine AS builder\nWORKDIR /app\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN go build -o main .\n\nFROM alpine:latest\nRUN apk --no-cache add ca-certificates\nWORKDIR /root/\nCOPY --from=builder /app/main .\nCMD ["./main"]',
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toContain('golang');
        expect(result.value.content).toContain('go');
        // Go dockerfile generation may vary
      }
    });
  });

  describe('Error handling', () => {
    it('should return error when no analysis results found', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        metadata: {},
      });
      
      // Mock resolveSession to return session without analysis_result
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            metadata: {},
            repo_path: '/test/repo',
            completed_steps: [],
          },
        },
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Repository must be analyzed first');
      }
    });

    it('should handle file write errors', async () => {
      const analysisResult = {
        language: 'javascript',
        framework: 'express',
      };
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: analysisResult,
        repo_path: '/test/repo',
      });
      
      // Mock resolveSession with analysis result
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: analysisResult,
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });

      (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Permission denied');
      }
    });
  });

  describe('Custom options', () => {
    beforeEach(() => {
      const analysisResult = {
        language: 'javascript',
        framework: 'express',
      };
      
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: analysisResult,
        repo_path: '/test/repo',
      });
      
      mockResolveSession.mockResolvedValueOnce({
        ok: true,
        value: {
          id: 'test-session-123',
          state: {
            analysis_result: analysisResult,
            repo_path: '/test/repo',
            metadata: {},
            completed_steps: [],
          },
        },
      });
    });

    it('should use custom base image when provided', async () => {
      config.baseImage = 'node:20-bullseye';
      
      // Mock AI to use custom base image
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:20-bullseye\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["npm", "start"]',
      });
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('node:20-bullseye');
        expect(result.value.content).toContain('FROM node:20-bullseye');
      }
    });

    it('should include custom instructions when provided', async () => {
      config.customInstructions = 'RUN apt-get update && apt-get install -y curl';
      
      // Mock AI to include custom instructions
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:18-alpine\nWORKDIR /app\nRUN apt-get update && apt-get install -y curl\nCOPY . .\nRUN npm ci\nCMD ["npm", "start"]',
      });
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('apt-get install -y curl');
      }
    });

    it('should include custom commands when provided', async () => {
      config.customCommands = ['npm run build', 'npm prune --production'];
      
      // Mock AI to include custom commands
      mockAiGenerate.mockResolvedValueOnce({
        ok: true,
        value: 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nRUN npm run build\nRUN npm prune --production\nCMD ["npm", "start"]',
      });
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('npm run build');
        expect(result.value.content).toContain('npm prune --production');
      }
    });
  });

  describe('Session management', () => {
    it('should create session if it does not exist', async () => {
      mockSessionManager.get.mockResolvedValue(null);
      mockSessionManager.create.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          mainFile: 'server.js',
          packageManager: 'npm',
          hasTests: true,
        },
        metadata: {},
        completed_steps: [],
        errors: {},
        current_step: null,
        createdAt: '2025-09-08T11:12:40.362Z',
        updatedAt: '2025-09-08T11:12:40.362Z'
      });

      const result = await generateDockerfile(config, mockLogger);

      // With new session helpers, it should create a session automatically
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBeDefined();
      }
    });
  });
});