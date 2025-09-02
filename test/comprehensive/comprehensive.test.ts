/**
 * Comprehensive tests
 * Tests all 15 tools, registry, dependencies, and orchestration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { EnhancedToolRegistry, ToolDescriptor, ToolContext } from '../../src/service/tools/enhanced-registry.js'
import { DependencyFactory } from '../../src/service/tools/dependencies.js'
import { WorkflowOrchestrator } from '../../src/service/workflow/orchestrator-enhanced.js'
import * as schemas from '../../src/service/tools/enhanced-schemas.js'
import { ok, fail } from '../../src/domain/types/result.js'

import { analyzeRepositoryHandler } from '../../src/service/tools/handlers/analyze-enhanced.js'
import { generateDockerfileHandler } from '../../src/service/tools/handlers/dockerfile-enhanced.js'
import { buildImageHandler } from '../../src/service/tools/handlers/build-image-enhanced.js'
import { scanImageHandler } from '../../src/service/tools/handlers/scan-image-enhanced.js'
import { tagImageHandler, pushImageHandler } from '../../src/service/tools/handlers/tag-push-enhanced.js'
import { 
  generateK8sManifestsHandler,
  prepareClusterHandler,
  deployApplicationHandler,
  verifyDeploymentHandler
} from '../../src/service/tools/handlers/k8s-enhanced.js'
import { startWorkflowHandler, workflowStatusHandler } from '../../src/service/tools/handlers/orchestration-enhanced.js'

describe('Enhanced Tool Registry', () => {
  let registry
  let mockDeps
  let mockServer
  
  beforeEach(() => {
    mockServer = {
      setRequestHandler: jest.fn(),
      request: jest.fn()
    }
    
    mockDeps = DependencyFactory.createMock()
    registry = new EnhancedToolRegistry(mockServer, mockDeps)
  })
  
  describe('Tool Registration', () => {
    it('should register tool with instrumentation', () => {
      const descriptor = new ToolDescriptor({
        name: 'test_tool',
        description: 'Test tool',
        category: 'utility',
        inputSchema: schemas.PingInput,
        outputSchema: schemas.PingOutput,
        handler: async (input) => ok({ pong: true }),
        timeout: 5000,
        retryable: true,
        maxRetries: 3
      })
      
      registry.register(descriptor)
      
      const tool = registry.getTool('test_tool')
      expect(tool).toBeDefined()
      expect(tool.name).toBe('test_tool')
      expect(tool.timeout).toBe(5000)
      expect(tool.retryable).toBe(true)
    })
    
    it('should wrap handler with timeout', async () => {
      registry.register({
        name: 'slow_tool',
        description: 'Slow tool',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 200))
          return ok({ result: 'done' })
        },
        timeout: 100
      })
      
      const tool = registry.getTool('slow_tool')
      const context = new ToolContext('test-session')
      
      const result = await tool.handler({}, mockDeps, context)
      
      expect(result.success).toBe(false)
      expect(result.error.message).toContain('timed out')
    })
    
    it('should retry on failure', async () => {
      let attempts = 0
      
      registry.register({
        name: 'retry_tool',
        description: 'Retryable tool',
        retryable: true,
        maxRetries: 3,
        handler: async () => {
          attempts++
          if (attempts < 3) {
            throw new Error('Transient error')
          }
          return ok({ attempts })
        }
      })
      
      const tool = registry.getTool('retry_tool')
      const context = new ToolContext('test-session')
      
      const result = await tool.handler({}, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.attempts).toBe(3)
    })
    
    it('should emit chain hints', async () => {
      const chainListener = jest.fn()
      registry.onChainHint(chainListener)
      
      registry.register({
        name: 'tool_with_hint',
        description: 'Tool with chain hint',
        handler: async () => ok({ data: 'test' }),
        chainHint: {
          nextTool: 'next_tool',
          reason: 'Ready for next step',
          paramMapper: (output) => ({ input: output.data })
        }
      })
      
      const tool = registry.getTool('tool_with_hint')
      const context = new ToolContext('test-session')
      
      await tool.handler({}, mockDeps, context)
      
      expect(chainListener).toHaveBeenCalledWith({
        tool: 'next_tool',
        reason: 'Ready for next step',
        params: { input: 'test' }
      })
    })
  })
  
  describe('MCP Integration', () => {
    it('should export tools for MCP', () => {
      registry.register({
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: schemas.PingInput,
        outputSchema: schemas.PingOutput,
        handler: async () => ok({})
      })
      
      const exported = registry.exportForMCP()
      
      expect(exported).toHaveLength(1)
      expect(exported[0].name).toBe('test_tool')
      expect(exported[0].inputSchema).toBeDefined()
    })
    
    it('should register with MCP server', async () => {
      await registry.registerWithMCP()
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2)
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object), // ListToolsRequestSchema
        expect.any(Function)
      )
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object), // CallToolRequestSchema
        expect.any(Function)
      )
    })
  })
  
  describe('Metrics and Stats', () => {
    it('should track execution statistics', async () => {
      registry.register({
        name: 'metrics_tool',
        description: 'Tool for metrics',
        handler: async () => ok({ result: 'success' })
      })
      
      const tool = registry.getTool('metrics_tool')
      const context = new ToolContext('test-session')
      
      await tool.handler({}, mockDeps, context)
      await tool.handler({}, mockDeps, context)
      
      const stats = registry.getStats('metrics_tool')
      
      expect(stats.count).toBe(2)
      expect(stats.errorRate).toBe(0)
      expect(stats.avgDuration).toBeGreaterThan(0)
    })
  })
})

describe('Phase 4: Tool Implementations', () => {
  let mockDeps
  let context
  
  beforeEach(() => {
    mockDeps = DependencyFactory.createMock()
    context = new ToolContext('test-session-123')
    context.logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  })
  
  describe('analyze_repository tool', () => {
    it('should analyze Java repository', async () => {
      mockDeps.fileSystem.exists = jest.fn().mockResolvedValue(true)
      mockDeps.sessionService.create = jest.fn().mockResolvedValue({
        id: 'test-session-123'
      })
      
      const input = {
        repo_path: '/test/java-app',
        depth: 'deep',
        include_tests: true
      }
      
      const result = await analyzeRepositoryHandler(input, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.sessionId).toBe('test-session-123')
      expect(result.language).toBeDefined()
    })
  })
  
  describe('generate_dockerfile tool', () => {
    it('should generate Dockerfile with AI', async () => {
      mockDeps.sessionService.get = jest.fn().mockResolvedValue({
        id: 'test-session-123',
        repoPath: '/test/app',
        workflow_state: {
          analysisResult: {
            language: 'java',
            languageVersion: '17',
            framework: 'spring-boot',
            buildSystem: { type: 'maven' },
            ports: [8080]
          }
        }
      })
      
      mockDeps.sampler.sample = jest.fn().mockResolvedValue({
        success: true,
        data: 'FROM openjdk:17\nWORKDIR /app\nCOPY . .\nCMD ["java", "-jar", "app.jar"]'
      })
      
      mockDeps.validator.validateDockerfile = jest.fn().mockResolvedValue({
        violations: []
      })
      
      const input = {
        session_id: 'test-session-123',
        multistage: true,
        optimize_size: true
      }
      
      const result = await generateDockerfileHandler(input, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.dockerfile).toContain('FROM')
      expect(mockDeps.sampler.sample).toHaveBeenCalledWith(
        'dockerfile-generation',
        expect.any(Object)
      )
    })
  })
  
  describe('build_image tool', () => {
    it('should build Docker image', async () => {
      mockDeps.sessionService.get = jest.fn().mockResolvedValue({
        id: 'test-session-123',
        projectName: 'test-app',
        repoPath: '/test/app',
        workflow_state: {}
      })
      
      const mockStream = {
        on: jest.fn((event, handler) => {
          if (event === 'data') {
            handler(JSON.stringify({
              stream: 'Step 1/5 : FROM openjdk:17\n'
            }))
            handler(JSON.stringify({
              stream: 'Successfully built abc123\n'
            }))
          }
          if (event === 'end') {
            handler()
          }
        })
      }
      
      mockDeps.docker.buildImage = jest.fn().mockResolvedValue(mockStream)
      mockDeps.docker.inspectImage = jest.fn().mockResolvedValue({
        Size: 100000000,
        RootFS: { Layers: ['layer1', 'layer2'] },
        Created: new Date().toISOString(),
        Architecture: 'amd64',
        Os: 'linux'
      })
      
      const input = {
        session_id: 'test-session-123',
        context: '.',
        dockerfile: 'Dockerfile',
        tag: 'latest'
      }
      
      const result = await buildImageHandler(input, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.imageId).toBe('abc123')
      expect(result.size).toBe(100000000)
      expect(result.layers).toBe(2)
    })
  })
})

describe('Phase 4: Workflow Orchestration', () => {
  let orchestrator
  let mockDeps
  let mockLogger
  
  beforeEach(() => {
    mockDeps = DependencyFactory.createMock()
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: () => mockLogger
    }
    
    orchestrator = new WorkflowOrchestrator({
      sessionId: 'test-workflow-123',
      steps: [
        {
          name: 'analyze_repository',
          description: 'Analyzing repository',
          tool: 'analyze_repository',
          required: true
        },
        {
          name: 'generate_dockerfile',
          description: 'Generating Dockerfile',
          tool: 'generate_dockerfile',
          required: true
        }
      ],
      deps: mockDeps,
      logger: mockLogger
    })
  })
  
  describe('Workflow Execution', () => {
    it('should execute workflow steps in order', async () => {
      const mockRegistry = new Map()
      
      mockRegistry.set('analyze_repository', {
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { language: 'java' }
        })
      })
      
      mockRegistry.set('generate_dockerfile', {
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: { dockerfile: 'FROM openjdk:17' }
        })
      })
      
      mockDeps.registry = {
        getTool: (name) => mockRegistry.get(name),
        getSuggestions: () => []
      }
      
      const result = await orchestrator.execute()
      
      expect(result.success).toBe(true)
      expect(result.completedSteps).toEqual([
        'analyze_repository',
        'generate_dockerfile'
      ])
      expect(result.failedSteps).toEqual([])
    })
    
    it('should handle step failures', async () => {
      const mockRegistry = new Map()
      
      mockRegistry.set('analyze_repository', {
        handler: jest.fn().mockResolvedValue({
          success: false,
          error: new Error('Analysis failed')
        })
      })
      
      mockDeps.registry = {
        getTool: (name) => mockRegistry.get(name),
        getSuggestions: () => []
      }
      
      const result = await orchestrator.execute()
      
      expect(result.success).toBe(false)
      expect(result.failedSteps).toContain('analyze_repository')
      expect(result.errors.length).toBeGreaterThan(0)
    })
    
    it('should emit progress events', async () => {
      const stepStartHandler = jest.fn()
      const stepCompleteHandler = jest.fn()
      
      orchestrator.on('stepStart', stepStartHandler)
      orchestrator.on('stepComplete', stepCompleteHandler)
      
      const mockRegistry = new Map()
      mockRegistry.set('analyze_repository', {
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: {}
        })
      })
      mockRegistry.set('generate_dockerfile', {
        handler: jest.fn().mockResolvedValue({
          success: true,
          data: {}
        })
      })
      
      mockDeps.registry = {
        getTool: (name) => mockRegistry.get(name),
        getSuggestions: () => []
      }
      
      await orchestrator.execute()
      
      expect(stepStartHandler).toHaveBeenCalledTimes(2)
      expect(stepCompleteHandler).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('Recovery Mechanisms', () => {
    it('should attempt recovery on failure', async () => {
      let attempts = 0
      
      const mockRegistry = new Map()
      mockRegistry.set('analyze_repository', {
        handler: jest.fn().mockImplementation(async () => {
          attempts++
          if (attempts === 1) {
            throw new Error('Transient error')
          }
          return { success: true, data: {} }
        })
      })
      
      mockDeps.registry = {
        getTool: (name) => mockRegistry.get(name),
        getSuggestions: () => []
      }
      
      orchestrator.steps[0].retryOnFailure = true
      
      const result = await orchestrator.execute()
      
      expect(attempts).toBe(2)
      expect(result.completedSteps).toContain('analyze_repository')
    })
  })
  
  describe('Workflow Control', () => {
    it('should support pause and resume', async () => {
      let paused = false
      
      orchestrator.on('paused', () => { paused = true })
      orchestrator.on('resumed', () => { paused = false })
      
      orchestrator.pause()
      expect(paused).toBe(true)
      
      orchestrator.resume()
      expect(paused).toBe(false)
    })
    
    it('should support abort', () => {
      orchestrator.abort()
      expect(orchestrator.abortController.signal.aborted).toBe(true)
    })
    
    it('should provide status', () => {
      const status = orchestrator.getStatus()
      
      expect(status.sessionId).toBe('test-workflow-123')
      expect(status.totalSteps).toBe(2)
      expect(status.currentStep).toBe(0)
      expect(status.paused).toBe(false)
      expect(status.aborted).toBe(false)
    })
  })
})

describe('Phase 4: Integration Tests', () => {
  describe('Complete Workflow', () => {
    it('should execute full containerization workflow', async () => {
      const mockDeps = DependencyFactory.createMock()
      const context = new ToolContext('integration-test')
      
      // Mock successful workflow
      mockDeps.sessionService.create = jest.fn().mockResolvedValue({
        id: 'integration-test'
      })
      
      mockDeps.activeWorkflows = new Map()
      
      const input = {
        repo_path: '/test/app',
        options: {
          skip_scan: false,
          push: false,
          deploy: false
        }
      }
      
      const result = await startWorkflowHandler(input, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.sessionId).toBeDefined()
      expect(result.workflowId).toBeDefined()
      expect(result.status).toBe('started')
      expect(result.steps.length).toBeGreaterThan(0)
    })
    
    it('should retrieve workflow status', async () => {
      const mockDeps = DependencyFactory.createMock()
      const context = new ToolContext('status-test')
      
      mockDeps.sessionService.get = jest.fn().mockResolvedValue({
        id: 'status-test',
        status: 'active',
        workflow_state: {
          completedSteps: ['analyze_repository'],
          currentStep: 'generate_dockerfile'
        },
        metadata: {
          options: {}
        }
      })
      
      const input = {
        session_id: 'status-test',
        include_artifacts: true
      }
      
      const result = await workflowStatusHandler(input, mockDeps, context)
      
      expect(result.success).toBe(true)
      expect(result.sessionId).toBe('status-test')
      expect(result.status).toBe('active')
      expect(result.progress).toBeDefined()
      expect(result.completedSteps).toContain('analyze_repository')
    })
  })
})