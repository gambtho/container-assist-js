import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MCPEventEmitter } from '../../../src/mcp/events/emitter';
import { MCPEventType } from '../../../src/mcp/events/types';
import type { Logger } from 'pino';

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

describe('MCP Events', () => {
  let eventEmitter: MCPEventEmitter;

  beforeEach(() => {
    jest.clearAllMocks();
    eventEmitter = new MCPEventEmitter(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
    eventEmitter.removeAllListeners();
  });

  describe('MCPEventEmitter', () => {
    describe('tool execution events', () => {
      it('should emit tool started event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.TOOL_STARTED, mockListener);

        const eventData = {
          toolName: 'analyze-repo',
          sessionId: 'session-123',
          timestamp: new Date(),
          arguments: { repoPath: '/test/repo' }
        };

        eventEmitter.emit(MCPEventType.TOOL_STARTED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit tool completed event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.TOOL_COMPLETED, mockListener);

        const eventData = {
          toolName: 'build-image',
          sessionId: 'session-123',
          timestamp: new Date(),
          result: { ok: true, value: { imageId: 'sha256:abc123' } },
          duration: 45000
        };

        eventEmitter.emit(MCPEventType.TOOL_COMPLETED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit tool failed event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.TOOL_FAILED, mockListener);

        const eventData = {
          toolName: 'scan-image',
          sessionId: 'session-123',
          timestamp: new Date(),
          error: 'Scanner not available',
          duration: 5000
        };

        eventEmitter.emit(MCPEventType.TOOL_FAILED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('workflow events', () => {
      it('should emit workflow started event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.WORKFLOW_STARTED, mockListener);

        const eventData = {
          workflowName: 'containerization-workflow',
          sessionId: 'workflow-456',
          timestamp: new Date(),
          config: { enableSampling: true, maxVulnerabilityLevel: 'high' }
        };

        eventEmitter.emit(MCPEventType.WORKFLOW_STARTED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit workflow completed event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.WORKFLOW_COMPLETED, mockListener);

        const eventData = {
          workflowName: 'containerization-workflow',
          sessionId: 'workflow-456',
          timestamp: new Date(),
          result: { 
            ok: true, 
            imageId: 'sha256:def456',
            scanResult: { vulnerabilities: { total: 3 } }
          },
          duration: 120000
        };

        eventEmitter.emit(MCPEventType.WORKFLOW_COMPLETED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit workflow failed event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.WORKFLOW_FAILED, mockListener);

        const eventData = {
          workflowName: 'containerization-workflow',
          sessionId: 'workflow-456',
          timestamp: new Date(),
          error: 'Build failed: Dockerfile syntax error',
          step: 'build-image',
          duration: 30000
        };

        eventEmitter.emit(MCPEventType.WORKFLOW_FAILED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('session events', () => {
      it('should emit session created event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.SESSION_CREATED, mockListener);

        const eventData = {
          sessionId: 'new-session-789',
          timestamp: new Date(),
          clientInfo: { name: 'mcp-client', version: '1.0.0' }
        };

        eventEmitter.emit(MCPEventType.SESSION_CREATED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit session ended event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.SESSION_ENDED, mockListener);

        const eventData = {
          sessionId: 'ending-session-789',
          timestamp: new Date(),
          reason: 'client_disconnect',
          duration: 300000
        };

        eventEmitter.emit(MCPEventType.SESSION_ENDED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('resource events', () => {
      it('should emit resource created event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.RESOURCE_CREATED, mockListener);

        const eventData = {
          resourceUri: 'dockerfile://new',
          sessionId: 'session-123',
          timestamp: new Date(),
          size: 512,
          contentType: 'text/plain'
        };

        eventEmitter.emit(MCPEventType.RESOURCE_CREATED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit resource updated event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.RESOURCE_UPDATED, mockListener);

        const eventData = {
          resourceUri: 'analysis://latest',
          sessionId: 'session-123',
          timestamp: new Date(),
          previousSize: 1024,
          newSize: 1280,
          changes: ['dependencies', 'language_version']
        };

        eventEmitter.emit(MCPEventType.RESOURCE_UPDATED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit resource deleted event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.RESOURCE_DELETED, mockListener);

        const eventData = {
          resourceUri: 'build-log://old',
          sessionId: 'session-123',
          timestamp: new Date(),
          reason: 'cleanup'
        };

        eventEmitter.emit(MCPEventType.RESOURCE_DELETED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('server events', () => {
      it('should emit server started event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.SERVER_STARTED, mockListener);

        const eventData = {
          timestamp: new Date(),
          port: undefined, // stdio transport
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
            prompts: { listChanged: true }
          }
        };

        eventEmitter.emit(MCPEventType.SERVER_STARTED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit server stopped event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.SERVER_STOPPED, mockListener);

        const eventData = {
          timestamp: new Date(),
          reason: 'shutdown',
          uptime: 7200000
        };

        eventEmitter.emit(MCPEventType.SERVER_STOPPED, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });

      it('should emit server error event', async () => {
        const mockListener = jest.fn();
        eventEmitter.on(MCPEventType.SERVER_ERROR, mockListener);

        const eventData = {
          timestamp: new Date(),
          error: 'Transport connection lost',
          context: 'stdio_transport',
          recoverable: true
        };

        eventEmitter.emit(MCPEventType.SERVER_ERROR, eventData);

        expect(mockListener).toHaveBeenCalledWith(eventData);
        expect(mockListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('event listener management', () => {
      it('should support multiple listeners for the same event', async () => {
        const listener1 = jest.fn();
        const listener2 = jest.fn();

        eventEmitter.on(MCPEventType.TOOL_STARTED, listener1);
        eventEmitter.on(MCPEventType.TOOL_STARTED, listener2);

        const eventData = {
          toolName: 'test-tool',
          sessionId: 'session-123',
          timestamp: new Date()
        };

        eventEmitter.emit(MCPEventType.TOOL_STARTED, eventData);

        expect(listener1).toHaveBeenCalledWith(eventData);
        expect(listener2).toHaveBeenCalledWith(eventData);
        expect(listener1).toHaveBeenCalledTimes(1);
        expect(listener2).toHaveBeenCalledTimes(1);
      });

      it('should support removing specific listeners', async () => {
        const listener1 = jest.fn();
        const listener2 = jest.fn();

        eventEmitter.on(MCPEventType.TOOL_COMPLETED, listener1);
        eventEmitter.on(MCPEventType.TOOL_COMPLETED, listener2);

        eventEmitter.off(MCPEventType.TOOL_COMPLETED, listener1);

        const eventData = {
          toolName: 'test-tool',
          sessionId: 'session-123',
          timestamp: new Date(),
          result: { ok: true },
          duration: 1000
        };

        eventEmitter.emit(MCPEventType.TOOL_COMPLETED, eventData);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).toHaveBeenCalledWith(eventData);
      });

      it('should support one-time listeners', async () => {
        const listener = jest.fn();
        eventEmitter.once(MCPEventType.SESSION_CREATED, listener);

        const eventData1 = {
          sessionId: 'session-1',
          timestamp: new Date()
        };

        const eventData2 = {
          sessionId: 'session-2',
          timestamp: new Date()
        };

        eventEmitter.emit(MCPEventType.SESSION_CREATED, eventData1);
        eventEmitter.emit(MCPEventType.SESSION_CREATED, eventData2);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith(eventData1);
      });

      it('should support removing all listeners for an event type', async () => {
        const listener1 = jest.fn();
        const listener2 = jest.fn();

        eventEmitter.on(MCPEventType.WORKFLOW_STARTED, listener1);
        eventEmitter.on(MCPEventType.WORKFLOW_STARTED, listener2);

        eventEmitter.removeAllListeners(MCPEventType.WORKFLOW_STARTED);

        const eventData = {
          workflowName: 'test-workflow',
          sessionId: 'session-123',
          timestamp: new Date()
        };

        eventEmitter.emit(MCPEventType.WORKFLOW_STARTED, eventData);

        expect(listener1).not.toHaveBeenCalled();
        expect(listener2).not.toHaveBeenCalled();
      });

      it('should support removing all listeners', async () => {
        const toolListener = jest.fn();
        const workflowListener = jest.fn();

        eventEmitter.on(MCPEventType.TOOL_STARTED, toolListener);
        eventEmitter.on(MCPEventType.WORKFLOW_STARTED, workflowListener);

        eventEmitter.removeAllListeners();

        eventEmitter.emit(MCPEventType.TOOL_STARTED, {
          toolName: 'test-tool',
          sessionId: 'session-123',
          timestamp: new Date()
        });

        eventEmitter.emit(MCPEventType.WORKFLOW_STARTED, {
          workflowName: 'test-workflow',
          sessionId: 'session-123',
          timestamp: new Date()
        });

        expect(toolListener).not.toHaveBeenCalled();
        expect(workflowListener).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle listener errors gracefully', async () => {
        const errorListener = jest.fn().mockImplementation(() => {
          throw new Error('Listener error');
        });
        const normalListener = jest.fn();

        eventEmitter.on(MCPEventType.TOOL_FAILED, errorListener);
        eventEmitter.on(MCPEventType.TOOL_FAILED, normalListener);

        const eventData = {
          toolName: 'failing-tool',
          sessionId: 'session-123',
          timestamp: new Date(),
          error: 'Tool error'
        };

        // Should not throw, and normal listener should still be called
        expect(() => eventEmitter.emit(MCPEventType.TOOL_FAILED, eventData)).not.toThrow();
        
        expect(errorListener).toHaveBeenCalledWith(eventData);
        expect(normalListener).toHaveBeenCalledWith(eventData);
        
        // Should log the listener error
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            event: MCPEventType.TOOL_FAILED,
            error: expect.any(Error)
          }),
          'Event listener error'
        );
      });

      it('should handle async listener errors', async () => {
        const asyncErrorListener = jest.fn().mockRejectedValue(new Error('Async listener error'));
        const normalListener = jest.fn();

        eventEmitter.on(MCPEventType.SESSION_ENDED, asyncErrorListener);
        eventEmitter.on(MCPEventType.SESSION_ENDED, normalListener);

        const eventData = {
          sessionId: 'session-123',
          timestamp: new Date(),
          reason: 'timeout'
        };

        eventEmitter.emit(MCPEventType.SESSION_ENDED, eventData);

        // Wait for async listeners to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(asyncErrorListener).toHaveBeenCalledWith(eventData);
        expect(normalListener).toHaveBeenCalledWith(eventData);
      });
    });

    describe('event data validation', () => {
      it('should accept valid event data', async () => {
        const listener = jest.fn();
        eventEmitter.on(MCPEventType.RESOURCE_CREATED, listener);

        const validEventData = {
          resourceUri: 'dockerfile://valid',
          sessionId: 'valid-session',
          timestamp: new Date(),
          size: 1024,
          contentType: 'text/plain'
        };

        expect(() => eventEmitter.emit(MCPEventType.RESOURCE_CREATED, validEventData)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(validEventData);
      });

      it('should handle missing optional fields', async () => {
        const listener = jest.fn();
        eventEmitter.on(MCPEventType.TOOL_STARTED, listener);

        const minimalEventData = {
          toolName: 'minimal-tool',
          sessionId: 'session-123',
          timestamp: new Date()
          // arguments field is optional
        };

        expect(() => eventEmitter.emit(MCPEventType.TOOL_STARTED, minimalEventData)).not.toThrow();
        expect(listener).toHaveBeenCalledWith(minimalEventData);
      });
    });

    describe('performance and memory', () => {
      it('should handle many listeners efficiently', async () => {
        const listeners = Array.from({ length: 100 }, () => jest.fn());
        
        listeners.forEach(listener => {
          eventEmitter.on(MCPEventType.SERVER_STARTED, listener);
        });

        const eventData = {
          timestamp: new Date(),
          capabilities: {}
        };

        const startTime = process.hrtime.bigint();
        eventEmitter.emit(MCPEventType.SERVER_STARTED, eventData);
        const endTime = process.hrtime.bigint();

        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        expect(duration).toBeLessThan(100); // Should complete in less than 100ms

        listeners.forEach(listener => {
          expect(listener).toHaveBeenCalledWith(eventData);
        });
      });

      it('should clean up listeners properly', async () => {
        const listener = jest.fn();
        eventEmitter.on(MCPEventType.SESSION_CREATED, listener);
        
        expect(eventEmitter.listenerCount(MCPEventType.SESSION_CREATED)).toBe(1);
        
        eventEmitter.off(MCPEventType.SESSION_CREATED, listener);
        
        expect(eventEmitter.listenerCount(MCPEventType.SESSION_CREATED)).toBe(0);
      });
    });
  });
});