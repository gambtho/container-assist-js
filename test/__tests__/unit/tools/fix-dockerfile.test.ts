/**
 * Unit Tests: Fix Dockerfile Tool
 * Tests the fix dockerfile tool functionality with mock dependencies
 * Following analyze-repo test structure and comprehensive coverage requirements
 */

import { jest } from '@jest/globals';
import { fixDockerfile, type FixDockerfileConfig } from '@tools/fix-dockerfile';
import { createMockLogger } from '../../../helpers/mock-infrastructure';

// Mock lib modules following the pattern from other working tests
const mockSessionManager = {
  get: jest.fn(),
  update: jest.fn(),
};

const mockMCPHostAI = {
  submitPrompt: jest.fn(),
};

const mockTimer = {
  end: jest.fn(),
  error: jest.fn(),
};

// Mock the lib modules
jest.mock('@lib/session', () => ({
  createSessionManager: jest.fn(() => mockSessionManager),
}));

jest.mock('@lib/mcp-host-ai', () => ({
  createMCPHostAI: jest.fn(() => mockMCPHostAI),
  createPromptTemplate: jest.fn((type: string, context: any) => `Template for ${type}: ${context.dockerfile || 'no dockerfile'}`),
}));

jest.mock('@lib/logger', () => ({
  createTimer: jest.fn(() => mockTimer),
}));

jest.mock('@lib/base-images', () => ({
  getRecommendedBaseImage: jest.fn(() => 'node:18-alpine'),
}));

describe('fixDockerfile', () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default session state
    mockSessionManager.get.mockResolvedValue({
      sessionId: 'test-session-123',
      workflow_state: {
        analysis_result: {
          language: 'javascript',
          framework: 'express'
        },
        dockerfile_result: {
          content: 'FROM node:18\nCOPY . .\nCMD ["node", "index.js"]'
        }
      }
    });
    
    mockSessionManager.update.mockResolvedValue(true);
    
    // Default AI response
    mockMCPHostAI.submitPrompt.mockResolvedValue({
      ok: true,
      value: 'FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nEXPOSE 3000\nCMD ["node", "index.js"]'
    });
  });

  describe('Successful Dockerfile Fixing', () => {
    it('should successfully fix dockerfile with build error', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123',
        error: 'Package not found: missing npm install step',
        dockerfile: 'FROM node:18\nCOPY . .\nCMD ["node", "index.js"]'
      };

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('test-session-123');
        expect(result.value.dockerfile).toContain('npm install');
        expect(result.value.path).toBe('./Dockerfile');
        expect(result.value.fixes).toEqual(expect.arrayContaining([expect.any(String)]));
      }
    });

    it('should handle dockerfile without explicit error', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toContain('FROM');
        expect(result.value.validation).toEqual(['Dockerfile validated successfully']);
      }
    });

    it('should use fallback when AI fails', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockMCPHostAI.submitPrompt.mockResolvedValue({
        ok: false,
        error: 'AI service unavailable'
      });

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toContain('FROM node:18-alpine');
        expect(result.value.fixes).toEqual(expect.arrayContaining([
          'Applied standard containerization best practices'
        ]));
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error when session not found', async () => {
      mockSessionManager.get.mockResolvedValue(null);

      const config: FixDockerfileConfig = {
        sessionId: 'non-existent-session'
      };

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should return error when no dockerfile found', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        workflow_state: {} // No dockerfile_result
      });

      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('No Dockerfile found to fix - run generate_dockerfile first');
      }
    });

    it('should handle session update failures', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockSessionManager.update.mockRejectedValue(new Error('Update failed'));

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Update failed');
      }
    });

    it('should handle exceptions during execution', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockMCPHostAI.submitPrompt.mockRejectedValue(new Error('AI service crashed'));

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('AI service crashed');
      }
    });
  });

  describe('AI Response Parsing', () => {
    it('should extract dockerfile from code blocks', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockMCPHostAI.submitPrompt.mockResolvedValue({
        ok: true,
        value: '```dockerfile\nFROM node:18-alpine\nWORKDIR /app\nCOPY . .\nCMD ["npm", "start"]\n```'
      });

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toBe('FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nCMD ["npm", "start"]');
      }
    });

    it('should parse JSON response format', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockMCPHostAI.submitPrompt.mockResolvedValue({
        ok: true,
        value: JSON.stringify({
          dockerfile: 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nCMD ["npm", "start"]',
          fixes: ['Updated base image', 'Added working directory']
        })
      });

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toContain('FROM node:18-alpine');
        expect(result.value.fixes).toEqual(['Updated base image', 'Added working directory']);
      }
    });

    it('should fallback when AI response is invalid', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      mockMCPHostAI.submitPrompt.mockResolvedValue({
        ok: true,
        value: 'This is not a dockerfile' // Invalid response
      });

      const result = await fixDockerfile(config, mockLogger);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dockerfile).toContain('FROM node:18-alpine');
        expect(result.value.fixes).toEqual(['Applied default containerization pattern']);
      }
    });
  });

  describe('Session State Management', () => {
    it('should update session with fixed dockerfile', async () => {
      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      await fixDockerfile(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            dockerfile_result: expect.objectContaining({
              content: expect.any(String),
              path: './Dockerfile'
            }),
            completed_steps: expect.arrayContaining(['fix-dockerfile']),
            metadata: expect.objectContaining({
              dockerfile_fixed: true
            })
          })
        })
      );
    });

    it('should preserve existing workflow state', async () => {
      mockSessionManager.get.mockResolvedValue({
        sessionId: 'test-session-123',
        workflow_state: {
          dockerfile_result: { content: 'FROM node:18\nCOPY . .\nCMD ["node", "index.js"]' },
          completed_steps: ['analyze-repo'],
          metadata: { existing_data: 'preserved' }
        }
      });

      const config: FixDockerfileConfig = {
        sessionId: 'test-session-123'
      };

      await fixDockerfile(config, mockLogger);

      expect(mockSessionManager.update).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          workflow_state: expect.objectContaining({
            completed_steps: expect.arrayContaining(['analyze-repo', 'fix-dockerfile']),
            metadata: expect.objectContaining({
              existing_data: 'preserved',
              dockerfile_fixed: true
            })
          })
        })
      );
    });
  });
});