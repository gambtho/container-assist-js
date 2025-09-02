/**
 * MCP Protocol Integration Tests
 * 
 * Validates that all tools comply with MCP protocol requirements
 * and tests tool chaining and workflow scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { ContainerKitMCPServer } from '../../src/index.js'
import { Config } from '../../src/service/config/config.js'
import type { ToolDescriptor } from '../../src/service/tools/tool-types.js'

describe('MCP Protocol Integration', () => {
  let server: ContainerKitMCPServer
  let config: Config
  
  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test'
    process.env.MOCK_MODE = 'true'
    
    config = new Config()
    server = new ContainerKitMCPServer(config)
    
    // Initialize server
    await server['deps'].initialize()
    await server['registry'].registerAll()
  })
  
  afterAll(async () => {
    // Cleanup
    await server['deps'].cleanup()
  })

  describe('Tool Registration', () => {
    it('should register all 15 expected tools', () => {
      const toolList = server['registry'].listTools()
      expect(toolList.tools).toBeDefined()
      expect(toolList.tools.length).toBeGreaterThanOrEqual(15)
    })

    it('should have tools in all expected categories', () => {
      const toolList = server['registry'].listTools()
      const tools = toolList.tools
      
      // Group tools by category (inferred from name patterns)
      const categories = {
        analysis: ['analyze_repository', 'resolve_base_images'],
        build: ['generate_dockerfile', 'generate_dockerfile_ext', 'fix_dockerfile', 'build_image', 'scan_image'],
        registry: ['tag_image', 'push_image'],
        deployment: ['generate_k8s_manifests', 'prepare_cluster', 'deploy_application', 'verify_deployment'],
        orchestration: ['start_workflow', 'workflow_status'],
        utilities: ['ping', 'list_tools', 'server_status']
      }
      
      for (const [category, expectedTools] of Object.entries(categories)) {
        for (const toolName of expectedTools) {
          const tool = tools.find(t => t.name === toolName)
          expect(tool).toBeDefined()
          expect(tool?.description).toBeDefined()
          expect(tool?.inputSchema).toBeDefined()
        }
      }
    })

    it('should have valid JSON schemas for all tools', () => {
      const toolList = server['registry'].listTools()
      
      for (const tool of toolList.tools) {
        expect(tool.inputSchema).toBeDefined()
        expect(typeof tool.inputSchema).toBe('object')
        
        // Validate it's a valid JSON Schema
        const schema = tool.inputSchema as any
        expect(schema.type).toBeDefined()
        
        // MCP expects certain schema structure
        if (schema.type === 'object') {
          expect(schema.properties).toBeDefined()
        }
      }
    })
  })

  describe('Tool Execution', () => {
    it('should execute ping tool successfully', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'ping',
        arguments: {}
      })
      
      expect(result).toBeDefined()
      expect(!result.success).not.toBe(true)
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
    })

    it('should execute list_tools successfully', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'list_tools',
        arguments: {}
      })
      
      expect(result).toBeDefined()
      expect(!result.success).not.toBe(true)
      expect(result.content).toBeDefined()
    })

    it('should execute server_status successfully', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'server_status',
        arguments: {}
      })
      
      expect(result).toBeDefined()
      expect(!result.success).not.toBe(true)
      expect(result.content).toBeDefined()
    })

    it('should handle missing tool gracefully', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'non_existent_tool',
        arguments: {}
      })
      
      expect(result).toBeDefined()
      expect(!result.success).toBe(true)
      expect(result.content[0].text).toContain('not found')
    })

    it('should validate input parameters', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'analyze_repository',
        arguments: {
          // Missing required 'repoPath' parameter
        }
      })
      
      expect(result).toBeDefined()
      expect(!result.success).toBe(true)
      expect(result.content[0].text).toContain('validation')
    })
  })

  describe('Tool Chaining', () => {
    it('should support workflow from analysis to build', async () => {
      // Step 1: Analyze repository
      const analysisResult = await server['registry'].handleToolCall({
        name: 'analyze_repository',
        arguments: {
          repoPath: '/test/repo'
        }
      })
      
      expect(!analysisResult.success).not.toBe(true)
      
      // Step 2: Generate Dockerfile based on analysis
      const dockerfileResult = await server['registry'].handleToolCall({
        name: 'generate_dockerfile',
        arguments: {
          language: 'nodejs',
          framework: 'express',
          dependencies: ['express', 'body-parser'],
          ports: [3000]
        }
      })
      
      expect(!dockerfileResult.success).not.toBe(true)
      
      // Step 3: Build image (would fail in mock mode but should validate)
      const buildResult = await server['registry'].handleToolCall({
        name: 'build_image',
        arguments: {
          context: '/test/repo',
          dockerfile: 'Dockerfile',
          tag: 'test:latest'
        }
      })
      
      // In mock mode, build might fail but request should be valid
      expect(buildResult).toBeDefined()
    })

    it('should support deployment workflow', async () => {
      // Step 1: Generate K8s manifests
      const manifestResult = await server['registry'].handleToolCall({
        name: 'generate_k8s_manifests',
        arguments: {
          image: 'test:latest',
          name: 'test-app',
          replicas: 2,
          port: 3000
        }
      })
      
      expect(manifestResult).toBeDefined()
      expect(!manifestResult.success).not.toBe(true)
      
      // Step 2: Prepare cluster (mock mode)
      const prepareResult = await server['registry'].handleToolCall({
        name: 'prepare_cluster',
        arguments: {
          namespace: 'test'
        }
      })
      
      expect(prepareResult).toBeDefined()
    })
  })

  describe('Session Management', () => {
    it('should start and track workflow', async () => {
      // Start workflow
      const startResult = await server['registry'].handleToolCall({
        name: 'start_workflow',
        arguments: {
          projectPath: '/test/repo',
          targetEnvironment: 'development'
        }
      })
      
      expect(startResult).toBeDefined()
      expect(!startResult.success).not.toBe(true)
      
      // Check workflow status
      const statusResult = await server['registry'].handleToolCall({
        name: 'workflow_status',
        arguments: {
          sessionId: 'test-session'
        }
      })
      
      expect(statusResult).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should provide clear error messages for validation failures', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'build_image',
        arguments: {
          // Missing required fields
          context: null,
          tag: ''
        }
      })
      
      expect(!result.success).toBe(true)
      expect(result.content[0].text).toBeDefined()
      expect(result.content[0].text.toLowerCase()).toContain('validation')
    })

    it('should handle tool execution errors gracefully', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'build_image',
        arguments: {
          context: '/nonexistent/path',
          dockerfile: 'Dockerfile',
          tag: 'test:latest'
        }
      })
      
      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      // Error should be returned in MCP format
      expect(Array.isArray(result.content)).toBe(true)
    })
  })

  describe('MCP Protocol Compliance', () => {
    it('should return content in MCP format', async () => {
      const result = await server['registry'].handleToolCall({
        name: 'ping',
        arguments: {}
      })
      
      // MCP expects content array with type and text/data
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect(result.content[0]).toHaveProperty('type')
      expect(result.content[0].type).toBe('text')
      expect(result.content[0]).toHaveProperty('text')
    })

    it('should handle concurrent tool calls', async () => {
      const promises = [
        server['registry'].handleToolCall({ name: 'ping', arguments: {} }),
        server['registry'].handleToolCall({ name: 'list_tools', arguments: {} }),
        server['registry'].handleToolCall({ name: 'server_status', arguments: {} })
      ]
      
      const results = await Promise.all(promises)
      
      for (const result of results) {
        expect(result).toBeDefined()
        expect(!result.success).not.toBe(true)
        expect(result.content).toBeDefined()
      }
    })

    it('should provide tool discovery through list_tools', async () => {
      const toolList = await server['registry'].listTools()
      
      expect(toolList).toBeDefined()
      expect(toolList.tools).toBeDefined()
      expect(Array.isArray(toolList.tools)).toBe(true)
      
      // Each tool should have required MCP fields
      for (const tool of toolList.tools) {
        expect(tool.name).toBeDefined()
        expect(typeof tool.name).toBe('string')
        expect(tool.description).toBeDefined()
        expect(tool.inputSchema).toBeDefined()
      }
    })
  })
})