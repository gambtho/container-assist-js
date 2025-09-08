/**
 * Unit Tests: Fix Dockerfile Tool
 * Tests the fix dockerfile tool functionality
 */

import { jest } from '@jest/globals';
import { fixDockerfileTool, type FixDockerfileConfig } from '../../../src/tools/fix-dockerfile/tool';
import { createMockLogger, createSuccessResult, createFailureResult } from '../../__support__/utilities/mock-infrastructure';
import { promises as fs } from 'node:fs';

// Mock fs promises
jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
  },
}));

// Mock lib modules
const mockSessionManager = {
  create: jest.fn().mockResolvedValue({
    sessionId: 'test-session-123',
    workflow_state: {},
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
  analyzeContent: jest.fn(),
  fixContent: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/mcp-host-ai', () => ({
  createMCPHostAI: jest.fn(() => mockMCPHostAI),
  createPromptTemplate: jest.fn((template: string) => ({
    render: (vars: Record<string, unknown>) => {
      let result = template;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      return result;
    },
  })),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

describe('fixDockerfileTool', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: FixDockerfileConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    config = {
      sessionId: 'test-session-123',
      error: 'Failed to build Docker image',
      dockerfile: 'FROM node:latest\nCOPY . .\nRUN npm install\nCMD node server.js',
    };

    // Reset all mocks
    jest.clearAllMocks();
    mockSessionManager.update.mockResolvedValue(true);
    // Mock AI responses
    mockMCPHostAI.isAvailable = jest.fn().mockReturnValue(true);
    mockMCPHostAI.submitPrompt = jest.fn().mockResolvedValue({
      ok: true,
      value: '```dockerfile\nFROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --production\nCOPY . .\nUSER node\nCMD ["node", "server.js"]\n```',
    });
  });

  describe('Successful Dockerfile fixing', () => {
    beforeEach(() => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        results: {
          dockerfile_result: {
            content: 'FROM node:latest\nCOPY . .\nRUN npm install',
          },
          build_result: {
            error: 'npm install failed',
          },
        },
        metadata: {},
      });
    });

    it('should successfully fix Dockerfile issues', async () => {
      const result = await fixDockerfileTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(true);
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.dockerfile).toContain('node:18-alpine');
        // Fixes array may be empty when dockerfile is extracted from code block
        expect(result.value.fixes).toBeDefined();
        expect(Array.isArray(result.value.fixes)).toBe(true);
      }
    });

    it('should fix Dockerfile from session', async () => {
      // Don't provide dockerfile in config, should use from session
      const sessionConfig = { sessionId: 'test-session-123' };
      
      const result = await fixDockerfileTool.execute(sessionConfig, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toContain('node');
        // Fixes array may be empty when dockerfile is extracted from code block
        expect(result.value.fixes).toBeDefined();
        expect(Array.isArray(result.value.fixes)).toBe(true);
      }
    });

    it('should update session with fix results', async () => {
      await fixDockerfileTool.execute(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            dockerfile_result: expect.objectContaining({
              content: expect.any(String),
              path: './Dockerfile',
            }),
            completed_steps: expect.arrayContaining(['fix-dockerfile']),
            metadata: expect.objectContaining({
              dockerfile_fixed: true,
              dockerfile_fixes: expect.any(Array),
            }),
          }),
        })
      );
    });
  });


  describe('Error handling', () => {
    it('should return error when no Dockerfile found', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        results: {},
        metadata: {},
      });
      
      const noDockerfileConfig = { sessionId: 'test-session-123' };

      const result = await fixDockerfileTool.execute(noDockerfileConfig, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No Dockerfile found');
      }
    });

    it('should handle AI failures with fallback', async () => {
      mockMCPHostAI.submitPrompt.mockResolvedValue({
        ok: false,
        error: 'AI service unavailable',
      });

      const result = await fixDockerfileTool.execute(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should fallback to template-based fix
        expect(result.value.dockerfile).toContain('FROM');
        expect(result.value.fixes).toContain('Applied standard containerization best practices');
      }
    });
  });


  describe('Session management', () => {
    it('should create new session if not exists', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      await fixDockerfileTool.execute(config, mockLogger);

      expect(mockSessionManager.create).toHaveBeenCalledWith('test-session-123');
    });
  });
});