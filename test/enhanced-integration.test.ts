/**
 * Enhanced MCP Integration Test
 * Validates that all enhanced components work together
 */

import { createLogger } from '../src/lib/logger.js';
import { createSessionManager } from '../src/mcp/session/manager.js';
import { createIntelligentAIService } from '../src/lib/enhanced-ai.js';
import { createIntelligentToolWrapper } from '../src/application/tools/enhanced/intelligent-tool-wrapper.js';

describe('Enhanced MCP Integration', () => {
  const logger = createLogger({ name: 'test' });
  
  describe('Session Manager', () => {
    it('should create and manage sessions', async () => {
      const sessionManager = createSessionManager(logger);
      
      // Create session
      const session = await sessionManager.getOrCreateSession('test-session');
      expect(session.sessionId).toBe('test-session');
      
      // Add tool execution
      await sessionManager.addToolExecution('test-session', {
        toolName: 'test-tool',
        parameters: { test: true },
        result: { success: true },
        executionTime: 100,
        timestamp: new Date().toISOString(),
      });
      
      // Get tool history
      const history = await sessionManager.getToolHistory('test-session');
      expect(history).toHaveLength(1);
      expect(history[0].toolName).toBe('test-tool');
    });
  });
  
  describe('AI Service', () => {
    it('should generate context and validate parameters', async () => {
      const sessionManager = createSessionManager(logger);
      const aiService = createIntelligentAIService(logger, sessionManager);
      
      // Generate context
      const contextResult = await aiService.generateWithContext({
        prompt: 'Generate a Dockerfile',
        sessionId: 'test-session',
        toolName: 'generate-dockerfile',
        parameters: { language: 'node' },
      });
      
      expect(contextResult.ok).toBe(true);
      if (contextResult.ok) {
        expect(contextResult.value.context).toBeDefined();
        expect(contextResult.value.context.guidance).toContain('Dockerfile');
      }
      
      // Validate parameters
      const validationResult = await aiService.validateParameters(
        'generate-dockerfile',
        { language: 'node' },
        { sessionId: 'test-session' }
      );
      
      expect(validationResult.ok).toBe(true);
      if (validationResult.ok) {
        expect(validationResult.value.isValid).toBe(true);
      }
    });
  });
  
  describe('Tool Wrapper', () => {
    it('should enhance tool with AI capabilities', async () => {
      const sessionManager = createSessionManager(logger);
      const aiService = createIntelligentAIService(logger, sessionManager);
      
      // Create a mock tool
      const mockTool = {
        name: 'mock-tool',
        description: 'Mock tool for testing',
        execute: async (params: any, logger: any) => ({
          ok: true,
          value: { result: 'success', params },
        }),
      };
      
      // Wrap with intelligence
      const enhancedTool = createIntelligentToolWrapper(
        mockTool,
        aiService,
        sessionManager,
        logger
      );
      
      expect(enhancedTool.executeEnhanced).toBeDefined();
      
      // Execute enhanced tool
      const result = await enhancedTool.executeEnhanced(
        { test: true, sessionId: 'test-session' },
        {
          sessionId: 'test-session',
          logger,
          signal: new AbortController().signal,
        }
      );
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.result).toBe('success');
        expect(result.value.metadata?.aiEnhanced).toBe(true);
      }
    });
  });
  
  describe('Progress Reporting', () => {
    it('should support progress reporting', async () => {
      const progressReports: Array<{ progress: number; message?: string }> = [];
      const progressReporter = async (progress: number, message?: string) => {
        progressReports.push({ progress, message });
      };
      
      const sessionManager = createSessionManager(logger);
      const aiService = createIntelligentAIService(logger, sessionManager);
      
      const mockTool = {
        name: 'progress-tool',
        description: 'Tool with progress',
        execute: async (params: any, logger: any) => ({
          ok: true,
          value: { result: 'success' },
        }),
      };
      
      const enhancedTool = createIntelligentToolWrapper(
        mockTool,
        aiService,
        sessionManager,
        logger
      );
      
      await enhancedTool.executeEnhanced(
        { sessionId: 'test-session' },
        {
          sessionId: 'test-session',
          logger,
          signal: new AbortController().signal,
          progressReporter,
        }
      );
      
      // Check progress was reported
      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports.some(p => p.progress === 100)).toBe(true);
    });
  });
  
  describe('Cancellation Support', () => {
    it('should support cancellation via AbortSignal', async () => {
      const sessionManager = createSessionManager(logger);
      const aiService = createIntelligentAIService(logger, sessionManager);
      
      const mockTool = {
        name: 'cancellable-tool',
        description: 'Cancellable tool',
        execute: async (params: any, logger: any) => {
          // Simulate long-running task
          await new Promise(resolve => setTimeout(resolve, 100));
          return { ok: true, value: { result: 'success' } };
        },
      };
      
      const enhancedTool = createIntelligentToolWrapper(
        mockTool,
        aiService,
        sessionManager,
        logger
      );
      
      const controller = new AbortController();
      
      // Cancel immediately
      controller.abort();
      
      try {
        await enhancedTool.executeEnhanced(
          { sessionId: 'test-session' },
          {
            sessionId: 'test-session',
            logger,
            signal: controller.signal,
          }
        );
        fail('Should have thrown CancelledError');
      } catch (error: any) {
        expect(error.name).toBe('CancelledError');
      }
    });
  });
});