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

// Legacy mcp-host-ai module removed - using ToolContext pattern now

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
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
    });

    it('should generate a Node.js Dockerfile', async () => {
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(true);
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
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
          mainFile: 'server.js',
          packageManager: 'npm',
          hasTests: true,
          dependencies: [
              { name: 'express' },
              { name: 'cors' },
              { name: 'helmet' },
              { name: 'mongoose' },
              { name: 'bcrypt' },
              { name: 'jsonwebtoken' },
            ],
        },
        repo_path: '/test/repo',
        metadata: {},
      });

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('AS builder');
        expect(result.value.multistage).toBe(true);
      }
    });

    it('should apply security hardening', async () => {
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

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            dockerfile_result: expect.objectContaining({
              path: expect.stringContaining('Dockerfile'),
              content: expect.any(String),
              multistage: true,
            }),
            completed_steps: expect.arrayContaining(['generate-dockerfile']),
          }),
        })
      );
    });
  });

  describe('Language-specific Dockerfile generation', () => {
    it('should generate Python Dockerfile', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'python',
          framework: 'flask',
          mainFile: 'app.py',
          packageManager: 'pip',
        },
        repo_path: '/test/repo',
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
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'java',
          build_system: { type: 'maven' },
          mainFile: 'Application.java',
          dependencies: [],
        },
        repo_path: '/test/repo',
        metadata: {},
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
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'go',
          mainFile: 'main.go',
        },
        repo_path: '/test/repo',
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

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Repository must be analyzed first');
      }
    });

    it('should handle file write errors', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
        },
        repo_path: '/test/repo',
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
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        analysis_result: {
          language: 'javascript',
          framework: 'express',
        },
        repo_path: '/test/repo',
      });
    });

    it('should use custom base image when provided', async () => {
      config.baseImage = 'node:20-bullseye';
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseImage).toBe('node:20-bullseye');
        expect(result.value.content).toContain('FROM node:20-bullseye');
      }
    });

    it('should include custom instructions when provided', async () => {
      config.customInstructions = 'RUN apt-get update && apt-get install -y curl';
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('apt-get install -y curl');
      }
    });

    it('should include custom commands when provided', async () => {
      config.customCommands = ['npm run build', 'npm prune --production'];
      
      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('npm run build');
        expect(result.value.content).toContain('npm prune --production');
      }
    });
  });

  describe('Session management', () => {
    it('should return error if session does not exist', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const result = await generateDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Session test-session-123 not found');
      }
    });
  });
});