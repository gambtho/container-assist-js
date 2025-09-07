import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ContainerizationMCPServer } from '../../../src/mcp/server';
import type { Logger } from 'pino';

// Mock all dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../../../src/lib/logger.js');
jest.mock('../../../src/lib/session.js');
jest.mock('../../../src/mcp/registry.js');
jest.mock('../../../src/mcp/resources/manager.js');
jest.mock('../../../src/mcp/resources/containerization-resource-manager.js');
jest.mock('../../../src/application/tools/intelligent/ai-prompts.js');
jest.mock('../../../src/mcp/server-extensions.js');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from '../../../src/lib/logger.js';
import { createSessionManager } from '../../../src/lib/session.js';
import * as registry from '../../../src/mcp/registry.js';
import { McpResourceManager } from '../../../src/mcp/resources/manager.js';
import { ContainerizationResourceManager } from '../../../src/mcp/resources/containerization-resource-manager.js';
import { PromptTemplatesManager } from '../../../src/application/tools/intelligent/ai-prompts.js';
import { extendServerCapabilities } from '../../../src/mcp/server-extensions.js';

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

describe('ContainerizationMCPServer', () => {
  let mockServer: any;
  let mockTransport: any;
  let mockSessionManager: any;
  let mockResourceManager: any;
  let mockContainerizationResourceManager: any;
  let mockPromptTemplates: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Server
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn()
    };
    (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);

    // Mock StdioServerTransport
    mockTransport = {
      start: jest.fn(),
      close: jest.fn()
    };
    (StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>).mockImplementation(() => mockTransport);

    // Mock createLogger
    (createLogger as jest.MockedFunction<typeof createLogger>).mockReturnValue(mockLogger);

    // Mock createSessionManager
    mockSessionManager = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      endSession: jest.fn()
    };
    (createSessionManager as jest.MockedFunction<typeof createSessionManager>).mockReturnValue(mockSessionManager);

    // Mock registry functions
    (registry.ensureInitialized as jest.MockedFunction<typeof registry.ensureInitialized>).mockReturnValue(undefined);
    (registry.getAllTools as jest.MockedFunction<typeof registry.getAllTools>).mockReturnValue([
      {
        name: 'analyze-repo',
        description: 'Analyze repository structure',
        schema: { type: 'object', properties: {} },
        execute: jest.fn()
      },
      {
        name: 'build-image',
        description: 'Build Docker image',
        schema: { type: 'object', properties: {} },
        execute: jest.fn()
      }
    ]);
    (registry.getAllWorkflows as jest.MockedFunction<typeof registry.getAllWorkflows>).mockReturnValue([
      {
        name: 'containerization-workflow',
        description: 'Complete containerization workflow',
        schema: { type: 'object', properties: {} },
        execute: jest.fn()
      }
    ]);
    (registry.getTool as jest.MockedFunction<typeof registry.getTool>).mockReturnValue({
      name: 'analyze-repo',
      description: 'Analyze repository structure',
      schema: { type: 'object', properties: {} },
      execute: jest.fn().mockResolvedValue({ ok: true, value: { language: 'nodejs' } })
    });
    (registry.getWorkflow as jest.MockedFunction<typeof registry.getWorkflow>).mockReturnValue(null);

    // Mock resource managers
    mockResourceManager = {
      listResources: jest.fn(),
      readResource: jest.fn(),
      writeResource: jest.fn()
    };
    (McpResourceManager as jest.MockedClass<typeof McpResourceManager>).mockImplementation(() => mockResourceManager);

    mockContainerizationResourceManager = {
      listResources: jest.fn(),
      readResource: jest.fn(),
      writeResource: jest.fn()
    };
    (ContainerizationResourceManager as jest.MockedClass<typeof ContainerizationResourceManager>).mockImplementation(() => mockContainerizationResourceManager);

    // Mock prompt templates
    mockPromptTemplates = {
      getTemplates: jest.fn(),
      getTemplate: jest.fn()
    };
    (PromptTemplatesManager as jest.MockedClass<typeof PromptTemplatesManager>).mockImplementation(() => mockPromptTemplates);

    // Mock server extensions
    (extendServerCapabilities as jest.MockedFunction<typeof extendServerCapabilities>).mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default logger when none provided', () => {
      new ContainerizationMCPServer();

      expect(createLogger).toHaveBeenCalledWith({ name: 'mcp-server' });
      expect(registry.ensureInitialized).toHaveBeenCalledWith(mockLogger);
    });

    it('should use provided logger', () => {
      const customLogger = { ...mockLogger, info: jest.fn() };
      new ContainerizationMCPServer(customLogger);

      expect(createLogger).not.toHaveBeenCalled();
      expect(registry.ensureInitialized).toHaveBeenCalledWith(customLogger);
    });

    it('should initialize with default options', () => {
      new ContainerizationMCPServer();

      expect(Server).toHaveBeenCalledWith(
        {
          name: 'containerization-assist',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
            prompts: { listChanged: true }
          }
        }
      );
    });

    it('should initialize with custom options', () => {
      const options = {
        name: 'custom-server',
        version: '2.0.0',
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false }
        }
      };

      new ContainerizationMCPServer(undefined, options);

      expect(Server).toHaveBeenCalledWith(
        {
          name: 'custom-server',
          version: '2.0.0'
        },
        {
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false },
            prompts: { listChanged: false }
          }
        }
      );
    });

    it('should initialize all required components', () => {
      new ContainerizationMCPServer();

      expect(createSessionManager).toHaveBeenCalledWith(mockLogger);
      expect(McpResourceManager).toHaveBeenCalled();
      expect(ContainerizationResourceManager).toHaveBeenCalledWith(mockResourceManager, mockLogger);
      expect(PromptTemplatesManager).toHaveBeenCalledWith(mockLogger);
      expect(StdioServerTransport).toHaveBeenCalled();
    });

    it('should setup request handlers', () => {
      new ContainerizationMCPServer();

      expect(mockServer.setRequestHandler).toHaveBeenCalled();
      // Should have handlers for ListToolsRequest, CallToolRequest, and potentially others
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(expect.any(Number));
    });

    it('should extend server capabilities', () => {
      const server = new ContainerizationMCPServer();

      expect(extendServerCapabilities).toHaveBeenCalledWith(server);
    });
  });

  describe('request handlers', () => {
    let server: ContainerizationMCPServer;
    let listToolsHandler: any;
    let callToolHandler: any;

    beforeEach(() => {
      server = new ContainerizationMCPServer();
      
      // Extract the handlers that were set up
      const setRequestHandlerCalls = mockServer.setRequestHandler.mock.calls;
      
      // Find ListToolsRequest handler
      const listToolsCall = setRequestHandlerCalls.find(call => 
        call[0] && call[0].method === 'tools/list'
      );
      listToolsHandler = listToolsCall?.[1];

      // Find CallToolRequest handler  
      const callToolCall = setRequestHandlerCalls.find(call => 
        call[0] && call[0].method === 'tools/call'
      );
      callToolHandler = callToolCall?.[1];
    });

    describe('ListToolsRequest handler', () => {
      it('should return combined list of tools and workflows', async () => {
        if (!listToolsHandler) {
          throw new Error('ListToolsRequest handler not found');
        }

        const result = await listToolsHandler();

        expect(result).toEqual({
          tools: [
            {
              name: 'analyze-repo',
              description: 'Analyze repository structure',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'build-image',
              description: 'Build Docker image',
              inputSchema: { type: 'object', properties: {} }
            },
            {
              name: 'containerization-workflow',
              description: 'Complete containerization workflow',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        });

        expect(registry.getAllTools).toHaveBeenCalled();
        expect(registry.getAllWorkflows).toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith('Received tools/list request');
        expect(mockLogger.info).toHaveBeenCalledWith({ count: 3 }, 'Returning tool list');
      });

      it('should handle empty tools and workflows', async () => {
        (registry.getAllTools as jest.MockedFunction<typeof registry.getAllTools>).mockReturnValue([]);
        (registry.getAllWorkflows as jest.MockedFunction<typeof registry.getAllWorkflows>).mockReturnValue([]);

        if (!listToolsHandler) {
          throw new Error('ListToolsRequest handler not found');
        }

        const result = await listToolsHandler();

        expect(result).toEqual({ tools: [] });
        expect(mockLogger.info).toHaveBeenCalledWith({ count: 0 }, 'Returning tool list');
      });
    });

    describe('CallToolRequest handler', () => {
      it('should execute a tool successfully', async () => {
        if (!callToolHandler) {
          throw new Error('CallToolRequest handler not found');
        }

        const request = {
          params: {
            name: 'analyze-repo',
            arguments: { repoPath: '/test/repo' }
          }
        };

        const result = await callToolHandler(request);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, value: { language: 'nodejs' } }, null, 2)
            }
          ]
        });

        expect(registry.getWorkflow).toHaveBeenCalledWith('analyze-repo');
        expect(registry.getTool).toHaveBeenCalledWith('analyze-repo');
        expect(mockLogger.info).toHaveBeenCalledWith({ tool: 'analyze-repo' }, 'Received tool execution request');
      });

      it('should execute a workflow when available', async () => {
        const mockWorkflow = {
          name: 'containerization-workflow',
          execute: jest.fn().mockResolvedValue({ ok: true, value: { imageId: 'sha256:abc123' } })
        };
        (registry.getWorkflow as jest.MockedFunction<typeof registry.getWorkflow>).mockReturnValue(mockWorkflow);

        if (!callToolHandler) {
          throw new Error('CallToolRequest handler not found');
        }

        const request = {
          params: {
            name: 'containerization-workflow',
            arguments: { repoPath: '/test/repo' }
          }
        };

        const result = await callToolHandler(request);

        expect(mockWorkflow.execute).toHaveBeenCalledWith({ repoPath: '/test/repo' }, mockLogger);
        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, value: { imageId: 'sha256:abc123' } }, null, 2)
            }
          ]
        });

        expect(mockLogger.debug).toHaveBeenCalledWith({ workflow: 'containerization-workflow' }, 'Executing workflow');
      });

      it('should handle tool not found', async () => {
        (registry.getWorkflow as jest.MockedFunction<typeof registry.getWorkflow>).mockReturnValue(null);
        (registry.getTool as jest.MockedFunction<typeof registry.getTool>).mockReturnValue(null);

        if (!callToolHandler) {
          throw new Error('CallToolRequest handler not found');
        }

        const request = {
          params: {
            name: 'nonexistent-tool',
            arguments: {}
          }
        };

        const result = await callToolHandler(request);

        expect(result.content[0].text).toContain('Tool not found: nonexistent-tool');
        expect(mockLogger.error).toHaveBeenCalledWith({ tool: 'nonexistent-tool' }, 'Tool not found');
      });

      it('should handle tool execution errors', async () => {
        const mockTool = {
          name: 'analyze-repo',
          execute: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
        };
        (registry.getTool as jest.MockedFunction<typeof registry.getTool>).mockReturnValue(mockTool);

        if (!callToolHandler) {
          throw new Error('CallToolRequest handler not found');
        }

        const request = {
          params: {
            name: 'analyze-repo',
            arguments: {}
          }
        };

        const result = await callToolHandler(request);

        expect(result.content[0].text).toContain('Tool execution failed');
        expect(mockLogger.error).toHaveBeenCalledWith(
          { tool: 'analyze-repo', error: expect.any(Error) },
          'Tool execution failed'
        );
      });
    });
  });

  describe('server lifecycle', () => {
    it('should be in initial state after construction', () => {
      const server = new ContainerizationMCPServer();
      
      // Server should be constructed but not running initially
      expect(server).toBeDefined();
      expect(Server).toHaveBeenCalled();
      expect(StdioServerTransport).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle server initialization errors', () => {
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => {
        throw new Error('Server initialization failed');
      });

      expect(() => new ContainerizationMCPServer()).toThrow('Server initialization failed');
    });

    it('should handle transport initialization errors', () => {
      (StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>).mockImplementation(() => {
        throw new Error('Transport initialization failed');
      });

      expect(() => new ContainerizationMCPServer()).toThrow('Transport initialization failed');
    });

    it('should handle session manager initialization errors', () => {
      (createSessionManager as jest.MockedFunction<typeof createSessionManager>).mockImplementation(() => {
        throw new Error('Session manager initialization failed');
      });

      expect(() => new ContainerizationMCPServer()).toThrow('Session manager initialization failed');
    });

    it('should handle resource manager initialization errors', () => {
      (ContainerizationResourceManager as jest.MockedClass<typeof ContainerizationResourceManager>).mockImplementation(() => {
        throw new Error('Resource manager initialization failed');
      });

      expect(() => new ContainerizationMCPServer()).toThrow('Resource manager initialization failed');
    });
  });

  describe('integration', () => {
    it('should pass logger to all components', () => {
      const customLogger = { ...mockLogger, info: jest.fn() };
      new ContainerizationMCPServer(customLogger);

      expect(createSessionManager).toHaveBeenCalledWith(customLogger);
      expect(ContainerizationResourceManager).toHaveBeenCalledWith(mockResourceManager, customLogger);
      expect(PromptTemplatesManager).toHaveBeenCalledWith(customLogger);
    });

    it('should initialize registry with logger', () => {
      const customLogger = { ...mockLogger, info: jest.fn() };
      new ContainerizationMCPServer(customLogger);

      expect(registry.ensureInitialized).toHaveBeenCalledWith(customLogger);
    });

    it('should configure resource manager with correct options', () => {
      new ContainerizationMCPServer();

      expect(McpResourceManager).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTtl: expect.any(Number),
          maxResourceSize: expect.any(Number),
          cacheConfig: expect.objectContaining({
            defaultTtl: expect.any(Number)
          })
        }),
        mockLogger
      );
    });
  });
});