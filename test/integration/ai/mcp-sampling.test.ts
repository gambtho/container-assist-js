/**
 * MCP Sampling Integration Tests
 * Tests the MCP sampling infrastructure
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { EnhancedMCPSampler } from '../../../src/infrastructure/ai/enhanced-sampler.js'
import { MockSampler } from '../../../src/infrastructure/ai/mock-sampler.js'
import { MCPSamplingError } from '../../../src/infrastructure/ai/types.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('MCP Sampling Infrastructure', () => {
  let mockServer
  let logger
  let sampler
  
  beforeEach(() => {
    mockServer = {
      request: jest.fn(),
      capabilities: { sampling: true }
    }
    
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(() => logger)
    }
    
    sampler = new EnhancedMCPSampler(mockServer, logger, {
      templateDir: path.join(__dirname, '../../../src/infrastructure/ai/prompts/templates'),
      cacheEnabled: true,
      retryAttempts: 2,
      retryDelayMs: 100
    })
  })
  
  describe('Enhanced MCP Sampler', () => {
    test('should sample with valid request', async () => {
      mockServer.request.mockResolvedValue({
        content: 'FROM eclipse-temurin:17-jdk-alpine\nWORKDIR /app\nCOPY . .\nCMD ["java", "-jar", "app.jar"]',
        model: 'claude-3-opus',
        usage: {
          promptTokens: 150,
          completionTokens: 85,
          totalTokens: 235
        }
      })
      
      const result = await sampler.sample({
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
      })
      
      expect(result.success).toBe(true)
      expect(result.data.content).toContain('FROM eclipse-temurin')
      expect(result.data.format).toBe('text')
      expect(result.data.tokenUsage).toBeDefined()
      expect(result.data.tokenUsage.total).toBe(235)
      
      expect(mockServer.request).toHaveBeenCalledWith({
        method: 'sampling/createMessage',
        params: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' })
          ]),
          modelPreferences: expect.objectContaining({
            maxTokens: 2000,
            temperature: 0.2
          })
        })
      })
    })
    
    test('should validate request schema', async () => {
      const invalidRequest = {
        templateId: 'invalid-template',
        variables: {},
        format: 'invalid-format'
      }
      
      await expect(sampler.sample(invalidRequest))
        .rejects.toThrow()
    })
    
    test('should retry on retryable errors', async () => {
      mockServer.request
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue({
          content: 'Success on third attempt',
          model: 'claude-3-opus'
        })
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          buildSystem: 'maven'
        }
      })
      
      expect(result.success).toBe(true)
      expect(result.data.content).toBe('Success on third attempt')
      expect(mockServer.request).toHaveBeenCalledTimes(3)
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          error: 'Rate limit exceeded'
        }),
        'Retrying sampling request'
      )
    })
    
    test('should fail after max retries', async () => {
      mockServer.request.mockRejectedValue(new Error('Persistent failure'))
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          buildSystem: 'maven'
        }
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBeInstanceOf(MCPSamplingError)
      expect(result.error.message).toContain('Persistent failure')
      expect(mockServer.request).toHaveBeenCalledTimes(2) // Initial + 1 retry
    })
    
    test('should not retry non-retryable errors', async () => {
      mockServer.request.mockRejectedValue(new Error('Invalid request'))
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          buildSystem: 'maven'
        }
      })
      
      expect(result.success).toBe(false)
      expect(mockServer.request).toHaveBeenCalledTimes(1) // No retries
    })
    
    test('should validate JSON format responses', async () => {
      mockServer.request.mockResolvedValue({
        content: 'invalid json content {',
        model: 'claude-3-opus'
      })
      
      const result = await sampler.sample({
        templateId: 'error-analysis',
        variables: {
          errorType: 'test',
          errorMessage: 'test error'
        },
        format: 'json'
      })
      
      expect(result.success).toBe(false)
      expect(result.error.message).toContain('not valid JSON')
    })
    
    test('should validate YAML format responses', async () => {
      mockServer.request.mockResolvedValue({
        content: 'invalid: yaml: content: [',
        model: 'claude-3-opus'
      })
      
      const result = await sampler.sample({
        templateId: 'k8s-generation',
        variables: {
          appName: 'test',
          image: 'test:latest'
        },
        format: 'yaml'
      })
      
      expect(result.success).toBe(false)
      expect(result.error.message).toContain('not valid YAML')
    })
    
    test('should load templates from file system', async () => {
      mockServer.request.mockResolvedValue({
        content: 'Template loaded successfully',
        model: 'claude-3-opus'
      })
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          buildSystem: 'maven'
        }
      })
      
      expect(result.success).toBe(true)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'dockerfile-generation'
        }),
        expect.stringMatching(/loaded prompt template/i)
      )
    })
    
    test('should fall back to built-in templates', async () => {
      mockServer.request.mockResolvedValue({
        content: 'Built-in template used',
        model: 'claude-3-opus'
      })
      
      // Use a template that doesn't exist as file
      const result = await sampler.sample({
        templateId: 'non-existent-template',
        variables: {
          test: 'value'
        }
      })
      
      // Should fail because template doesn't exist in built-ins either
      expect(result.success).toBe(false)
      expect(result.error.message).toContain('Template not found')
    })
    
    test('should cache templates', async () => {
      mockServer.request.mockResolvedValue({
        content: 'Cached template response',
        model: 'claude-3-opus'
      })
      
      // First request - loads template
      await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      // Second request - uses cached template
      await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'python' }
      })
      
      expect(logger.debug).toHaveBeenCalledWith(
        { templateId: 'dockerfile-generation' },
        'Using cached template'
      )
    })
    
    test('should interpolate template variables', async () => {
      mockServer.request.mockResolvedValue({
        content: 'Variable interpolation successful',
        model: 'claude-3-opus'
      })
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          framework: 'spring-boot',
          buildSystem: 'maven',
          port: '8080'
        }
      })
      
      expect(result.success).toBe(true)
      
      // Verify the template was rendered with variables
      const samplingCall = mockServer.request.mock.calls[0][0]
      const userMessage = samplingCall.params.messages.find(m => m.role === 'user')
      expect(userMessage.content).toContain('java')
      expect(userMessage.content).toContain('spring-boot')
      expect(userMessage.content).toContain('maven')
      expect(userMessage.content).toContain('8080')
    })
    
    test('should handle missing required variables', async () => {
      const template = {
        id: 'test-template',
        system: 'Test system prompt',
        user: 'Test with {{requiredVar}}',
        variables: [
          { name: 'requiredVar', required: true }
        ]
      }
      
      // Mock the template loading to return our test template
      sampler.promptCache.set('test-template', template)
      
      const result = await sampler.sample({
        templateId: 'test-template',
        variables: {} // Missing required variable
      })
      
      expect(result.success).toBe(false)
      expect(result.error.message).toContain('Missing required variables')
    })
    
    test('should use default values for optional variables', async () => {
      const template = {
        id: 'test-template',
        system: 'Test system prompt',
        user: 'Port: {{port}}',
        variables: [
          { name: 'port', required: false, default: '8080' }
        ]
      }
      
      sampler.promptCache.set('test-template', template)
      mockServer.request.mockResolvedValue({
        content: 'Default value used',
        model: 'claude-3-opus'
      })
      
      const result = await sampler.sample({
        templateId: 'test-template',
        variables: {} // No variables provided
      })
      
      expect(result.success).toBe(true)
      
      const userMessage = mockServer.request.mock.calls[0][0].params.messages
        .find(m => m.role === 'user')
      expect(userMessage.content).toContain('8080')
    })
    
    test('should provide sampler capabilities', () => {
      const capabilities = sampler.getCapabilities()
      
      expect(capabilities).toHaveProperty('maxTokens')
      expect(capabilities).toHaveProperty('supportedFormats')
      expect(capabilities).toHaveProperty('templates')
      expect(capabilities).toHaveProperty('features')
      
      expect(Array.isArray(capabilities.supportedFormats)).toBe(true)
      expect(Array.isArray(capabilities.templates)).toBe(true)
      expect(typeof capabilities.features).toBe('object')
    })
    
    test('should track metrics', async () => {
      mockServer.request.mockResolvedValue({
        content: 'Metrics test',
        model: 'claude-3-opus'
      })
      
      const initialMetrics = sampler.getMetrics()
      expect(initialMetrics.requestCount).toBe(0)
      
      await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      const finalMetrics = sampler.getMetrics()
      expect(finalMetrics.requestCount).toBe(1)
      expect(finalMetrics.errorCount).toBe(0)
      expect(finalMetrics.errorRate).toBe(0)
    })
    
    test('should track error metrics', async () => {
      mockServer.request.mockRejectedValue(new Error('Test error'))
      
      const result = await sampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      expect(result.success).toBe(false)
      
      const metrics = sampler.getMetrics()
      expect(metrics.errorCount).toBeGreaterThan(0)
      expect(metrics.errorRate).toBeGreaterThan(0)
      expect(metrics.lastError).toContain('Test error')
    })
    
    test('should clear cache', () => {
      // Load a template to cache it
      sampler.promptCache.set('test-template', { id: 'test' })
      
      expect(sampler.getMetrics().cacheSize).toBe(1)
      
      sampler.clearCache()
      
      expect(sampler.getMetrics().cacheSize).toBe(0)
      expect(logger.info).toHaveBeenCalledWith('Prompt cache cleared')
    })
    
    test('should check availability', async () => {
      // Test with sampling capability
      expect(await sampler.isAvailable()).toBe(true)
      
      // Test without sampling capability
      mockServer.capabilities = {}
      mockServer.request.mockResolvedValue({ sampling: false })
      
      expect(await sampler.isAvailable()).toBe(false)
    })
  })
  
  describe('Mock Sampler', () => {
    let mockSampler
    
    beforeEach(() => {
      mockSampler = new MockSampler(logger)
    })
    
    test('should provide deterministic responses', async () => {
      const result = await mockSampler.sample({
        templateId: 'dockerfile-generation',
        variables: {
          language: 'java',
          framework: 'spring-boot'
        }
      })
      
      expect(result.success).toBe(true)
      expect(result.data.content).toContain('FROM')
      expect(result.data.content).toContain('java')
      expect(result.data.format).toBe('text')
    })
    
    test('should handle different template types', async () => {
      const templates = [
        'dockerfile-generation',
        'dockerfile-fix', 
        'k8s-generation',
        'k8s-fix',
        'error-analysis'
      ]
      
      for (const templateId of templates) {
        const result = await mockSampler.sample({
          templateId,
          variables: { test: 'value' }
        })
        
        expect(result.success).toBe(true)
        expect(result.data.content).toBeDefined()
        expect(result.data.content.length).toBeGreaterThan(0)
      }
    })
    
    test('should simulate different response formats', async () => {
      const formats = ['text', 'json', 'yaml']
      
      for (const format of formats) {
        const result = await mockSampler.sample({
          templateId: 'dockerfile-generation',
          variables: { language: 'java' },
          format
        })
        
        expect(result.success).toBe(true)
        expect(result.data.format).toBe(format)
        
        if (format === 'json') {
          expect(() => JSON.parse(result.data.content)).not.toThrow()
        }
      }
    })
    
    test('should include token usage', async () => {
      const result = await mockSampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      expect(result.success).toBe(true)
      expect(result.data.tokenUsage).toBeDefined()
      expect(result.data.tokenUsage.prompt).toBeGreaterThan(0)
      expect(result.data.tokenUsage.completion).toBeGreaterThan(0)
      expect(result.data.tokenUsage.total).toBeGreaterThan(0)
    })
    
    test('should simulate varying response times', async () => {
      const start = Date.now()
      
      const result = await mockSampler.sample({
        templateId: 'dockerfile-generation',
        variables: { language: 'java' }
      })
      
      const duration = Date.now() - start
      
      expect(result.success).toBe(true)
      expect(duration).toBeGreaterThan(50) // Mock includes simulated delay
      expect(duration).toBeLessThan(1000) // But not too long for tests
    })
    
    test('should provide consistent responses for same inputs', async () => {
      const input = {
        templateId: 'dockerfile-generation',
        variables: { language: 'java', framework: 'spring-boot' }
      }
      
      const result1 = await mockSampler.sample(input)
      const result2 = await mockSampler.sample(input)
      
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      expect(result1.data.content).toBe(result2.data.content)
    })
  })
})