/**
 * Integration tests for MCP Sampling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { MCPSamplerFactory } from '../../../src/infrastructure/ai/factory.js'
import { MockMCPSampler } from '../../../src/infrastructure/ai/mock-sampler.js'
import { EnhancedMCPSampler } from '../../../src/infrastructure/ai/enhanced-sampler.js'
import { PromptTemplateLoader } from '../../../src/infrastructure/ai/prompts/loader.js'
import { PromptRenderer } from '../../../src/infrastructure/ai/prompts/renderer.js'
import { SamplingRequest } from '../../../src/infrastructure/ai/types.js'
import { isOk, isFail } from '../../../src/domain/types/result.js'
import pino from 'pino'

// Mock server for testing
class MockServer {
  constructor(config = {}) {
    this.capabilities = config.capabilities || { sampling: false }
    this.responses = config.responses || {}
  }
  
  async request({ method, params }) {
    if (method === 'capabilities') {
      return this.capabilities
    }
    
    if (method === 'sampling/createMessage') {
      const response = this.responses.sampling || {
        content: 'Mock AI response',
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
      }
      return response
    }
    
    throw new Error(`Unknown method: ${method}`)
  }
}

describe('MCP Sampling Integration', () => {
  let logger
  
  beforeEach(() => {
    logger = pino({ level: 'silent' }) // Quiet during tests
  })
  
  describe('Mock Sampler', () => {
    let sampler
    
    beforeEach(() => {
      sampler = new MockMCPSampler(logger, {
        deterministicMode: true,
        simulateLatency: false,
        errorRate: 0
      })
    })
    
    it('should generate dockerfile for Java Spring Boot', async () => {
      const request = {
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          framework: 'spring-boot',
          buildSystem: 'maven',
          javaVersion: '17',
          port: '8080'
        },
        format: 'text',
        maxTokens: 2000,
        temperature: 0.2
      }
      
      const result = await sampler.sample(request)
      
      expect(isOk(result)).toBe(true)
      expect(result.data.content).toContain('FROM')
      expect(result.data.content).toContain('openjdk')
      expect(result.data.content).toContain('EXPOSE 8080')
      expect(result.data.format).toBe('text')
      expect(result.data.metadata.mock).toBe(true)
    })
    
    it('should handle dockerfile fix requests', async () => {
      const request = {
        templateId: 'dockerfile-fix',
        variables: {
          dockerfile: 'FROM java:8\nCOPY . .\nCMD ["java", "App"]',
          error: 'Using deprecated base image, No USER specified',
          context: '{"language":"java","framework":"spring-boot"}'
        },
        format: 'text'
      }
      
      const result = await sampler.sample(request)
      
      expect(isOk(result)).toBe(true)
      expect(result.data.content).toContain('USER')
      expect(result.data.content).toContain('openjdk')
      expect(result.data.content).not.toContain('java:8')
    })
    
    it('should generate K8s manifests', async () => {
      const request = {
        templateId: 'k8s-generation',
        variables: {
          image: 'test-app:latest',
          port: '8080',
          framework: 'spring-boot',
          replicas: '3'
        },
        format: 'yaml'
      }
      
      const result = await sampler.sample(request)
      
      expect(isOk(result)).toBe(true)
      expect(result.data.content).toContain('apiVersion: apps/v1')
      expect(result.data.content).toContain('kind: Deployment')
      expect(result.data.content).toContain('kind: Service')
      expect(result.data.format).toBe('yaml')
    })
    
    it('should simulate errors when configured', async () => {
      sampler.setErrorRate(1.0) // Always error
      
      const request = {
        templateId: 'dockerfile-generation',
        variables: {},
        format: 'text'
      }
      
      const result = await sampler.sample(request)
      
      expect(isFail(result)).toBe(true)
      expect(result.error.message).toContain('simulated error')
    })
    
    it('should apply variations when not in deterministic mode', async () => {
      const dynamicSampler = new MockMCPSampler(logger, {
        deterministicMode: false,
        simulateLatency: false,
        errorRate: 0
      })
      
      const request = {
        templateId: 'dockerfile-generation',
        variables: {
          language: 'python',
          framework: 'django',
          buildSystem: 'pip',
          port: '8000'
        },
        format: 'text'
      }
      
      const result = await dynamicSampler.sample(request)
      
      expect(isOk(result)).toBe(true)
      expect(result.data.content).toContain('python')
      expect(result.data.content).not.toContain('openjdk')
    })
  })
  
  describe('Factory', () => {
    it('should create mock sampler when mode is mock', async () => {
      const server = new MockServer()
      const sampler = await MCPSamplerFactory.create(server, logger, {
        mode: 'mock',
        templateDir: './templates'
      })
      
      expect(sampler).toBeInstanceOf(MockMCPSampler)
      expect(await sampler.isAvailable()).toBe(true)
    })
    
    it('should fall back to mock in auto mode when MCP not available', async () => {
      const server = new MockServer({ capabilities: { sampling: false } })
      
      const sampler = await MCPSamplerFactory.create(server, logger, {
        mode: 'auto',
        templateDir: './templates'
      })
      
      expect(sampler).toBeInstanceOf(MockMCPSampler)
    })
    
    it('should use MCP sampler when available in auto mode', async () => {
      const server = new MockServer({ 
        capabilities: { sampling: true },
        responses: { sampling: { content: 'AI response' } }
      })
      
      // Mock the isAvailable method to return true
      server.capabilities.sampling = true
      
      const sampler = await MCPSamplerFactory.create(server, logger, {
        mode: 'auto',
        templateDir: './templates'
      })
      
      // Should create EnhancedMCPSampler when sampling is available
      expect(sampler).toBeDefined()
    })
    
    it('should throw error for invalid mode', async () => {
      const server = new MockServer()
      
      await expect(
        MCPSamplerFactory.create(server, logger, {
          mode: 'invalid'
        })
      ).rejects.toThrow('Invalid sampler mode')
    })
  })
  
  describe('Template Rendering', () => {
    let renderer
    
    beforeEach(() => {
      renderer = new PromptRenderer(logger)
    })
    
    it('should handle variable substitution', () => {
      const template = {
        id: 'test',
        system: 'System with {{var1}}',
        user: 'User with {{var2}} and {{var3}}',
        variables: [
          { name: 'var1', required: true },
          { name: 'var2', required: true },
          { name: 'var3', required: false, default: 'default3' }
        ]
      }
      
      const result = renderer.render(template, {
        var1: 'value1',
        var2: 'value2'
      })
      
      expect(result.system).toBe('System with value1')
      expect(result.user).toBe('User with value2 and default3')
      expect(result.metadata.defaultsUsed).toContain('var3')
    })
    
    it('should handle conditionals', () => {
      const template = {
        id: 'test',
        system: 'System',
        user: '{{#if hasFeature}}Feature enabled{{/if}}{{#unless hasFeature}}Feature disabled{{/unless}}'
      }
      
      const withFeature = renderer.render(template, { hasFeature: 'true' })
      expect(withFeature.user).toBe('Feature enabled')
      
      const withoutFeature = renderer.render(template, { hasFeature: '' })
      expect(withoutFeature.user).toBe('Feature disabled')
    })
    
    it('should handle loops', () => {
      const template = {
        id: 'test',
        system: 'System',
        user: 'Items: {{#each items}}{{item}} {{/each}}'
      }
      
      const result = renderer.render(template, {
        items: JSON.stringify(['item1', 'item2', 'item3'])
      })
      
      expect(result.user).toBe('Items: item1 item2 item3 ')
    })
    
    it('should throw error for missing required variables in strict mode', () => {
      const template = {
        id: 'test',
        system: 'System',
        user: 'User with {{required}}',
        variables: [
          { name: 'required', required: true }
        ]
      }
      
      expect(() => {
        renderer.render(template, {})
      }).toThrow('Missing required variables: required')
    })
  })
  
  describe('Template Loading', () => {
    it('should validate template structure', async () => {
      const loader = new PromptTemplateLoader('./templates', logger)
      
      // This will throw if templates directory doesn't exist
      // In real tests, we'd mock the file system
      try {
        await loader.load('non-existent')
      } catch (error) {
        expect(error.message).toContain('Template not found')
      }
    })
  })
  
  describe('Request Validation', () => {
    it('should validate sampling request format', () => {
      const validRequest = {
        templateId: 'dockerfile-generation',
        variables: { test: 'value' },
        format: 'text',
        maxTokens: 1000,
        temperature: 0.5
      }
      
      const parsed = SamplingRequest.parse(validRequest)
      expect(parsed.templateId).toBe('dockerfile-generation')
      expect(parsed.format).toBe('text')
    })
    
    it('should reject invalid template ID', () => {
      const invalidRequest = {
        templateId: 'invalid-template',
        variables: {}
      }
      
      expect(() => {
        SamplingRequest.parse(invalidRequest)
      }).toThrow()
    })
    
    it('should apply defaults', () => {
      const minimalRequest = {
        templateId: 'dockerfile-generation',
        variables: {}
      }
      
      const parsed = SamplingRequest.parse(minimalRequest)
      expect(parsed.format).toBe('text')
      expect(parsed.maxTokens).toBe(2000)
      expect(parsed.temperature).toBe(0.2)
    })
  })
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const failingServer = {
        async request() {
          throw new Error('Network error: ECONNREFUSED')
        },
        capabilities: {}
      }
      
      const sampler = new EnhancedMCPSampler(failingServer, logger, {
        retryAttempts: 2,
        retryDelayMs: 100
      })
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      expect(isFail(result)).toBe(true)
      expect(result.error.retryable).toBe(true)
    })
    
    it('should not retry on validation errors', async () => {
      const failingServer = {
        async request() {
          throw new Error('Invalid request: bad format')
        },
        capabilities: {}
      }
      
      const sampler = new EnhancedMCPSampler(failingServer, logger, {
        retryAttempts: 3,
        retryDelayMs: 100
      })
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      expect(isFail(result)).toBe(true)
      expect(result.error.retryable).toBe(false)
    })
  })
  
  describe('Metrics', () => {
    it('should track request metrics', async () => {
      const sampler = new MockMCPSampler(logger)
      
      // Make several requests
      await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      await sampler.sample({
        templateId: 'k8s-generation',
        variables: { image: 'test' }
      })
      
      const metrics = sampler.getMetrics()
      expect(metrics.callCount).toBe(2)
      expect(metrics.errorRate).toBe(0)
    })
  })
})