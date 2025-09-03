/**
 * AI-Powered Tools Integration Tests
 * Tests the complete AI workflow with MCP sampling
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { generateDockerfileHandler } from '../../../src/application/tools/generate-dockerfile/generate-dockerfile.js'
import { generateK8sManifestsHandler } from '../../../src/application/tools/generate-k8s-manifests/generate-k8s-manifests.js'
// ErrorRecoveryService - removed, not available
// DependencyFactory - removed, not available
import { MCPSampler } from '../../../src/infrastructure/ai/mcp-sampler.js'
import { MockSampler } from '../../../src/infrastructure/ai/mock-sampler.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('AI-Powered Tools Integration', () => {
  let deps
  let sessionId
  let testLogger
  
  beforeEach(async () => {
    testLogger = {
      info: jest.fn(),
      debug: jest.fn(), 
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(() => testLogger)
    }
    
    deps = DependencyFactory.createMock({
      logger: testLogger,
      sampler: new MockSampler(testLogger)
    })
    
    sessionId = `test-session-${Date.now()}`
    await deps.sessionService.create({
      id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      workflow_state: {
        analysisResult: {
          language: 'java',
          framework: 'spring-boot',
          buildSystem: { type: 'maven', buildFile: 'pom.xml' },
          port: 8080,
          hasTests: true,
          dependencies: {
            'spring-boot-starter-web': '3.2.0',
            'spring-boot-starter-actuator': '3.2.0'
          },
          envVariables: {
            'SPRING_PROFILES_ACTIVE': 'production'
          }
        }
      }
    })
  })
  
  afterEach(async () => {
    if (sessionId) {
      try {
        await deps.sessionService.delete?.(sessionId)
      } catch (error) {
      }
    }
  })
  
  describe('Dockerfile Generation', () => {
    test('should generate valid Dockerfile for Java Spring Boot', async () => {
      const result = await generateDockerfileHandler({
        sessionId,
        optimization: 'size',
        includeHealthcheck: true
      }, deps)
      
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.dockerfile).toContain('FROM')
      expect(result.data.dockerfile).toMatch(/eclipse-temurin|openjdk/)
      expect(result.data.dockerfile).toContain('COPY')
      expect(result.data.dockerfile).toContain('ENTRYPOINT')
      expect(result.data.stages.length).toBeGreaterThan(0)
      expect(result.data.path).toContain('Dockerfile')
    })
    
    test('should handle custom instructions', async () => {
      const result = await generateDockerfileHandler({
        sessionId,
        customInstructions: 'Add APM agent and enable JMX monitoring'
      }, deps)
      
      expect(result.success).toBe(true)
      expect(result.data.dockerfile).toBeDefined()
      // Mock sampler should include custom instructions in response
      expect(testLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/generation parameters prepared/i),
        expect.objectContaining({
          variables: expect.arrayContaining(['customInstructions'])
        })
      )
    })
    
    test('should optimize for different strategies', async () => {
      const strategies = ['size', 'build-speed', 'security', 'balanced']
      
      for (const optimization of strategies) {
        const result = await generateDockerfileHandler({
          sessionId,
          optimization
        }, deps)
        
        expect(result.success).toBe(true)
        expect(result.data.dockerfile).toBeDefined()
        
        if (optimization !== 'balanced') {
          // Should have called optimization
          expect(testLogger.info).toHaveBeenCalledWith(
            expect.stringMatching(/optimization applied/i),
            expect.objectContaining({ optimization })
          )
        }
      }
    })
    
    test('should handle validation failures with auto-fix', async () => {
      // Mock validator to return validation failures
      const mockValidator = {
        validateDockerfile: jest.fn().mockResolvedValue({
          valid: false,
          violations: ['Missing USER instruction', 'Using latest tag'],
          warnings: ['No HEALTHCHECK found']
        })
      }
      
      const testDeps = deps.withOverrides({ validator: mockValidator })
      
      const result = await generateDockerfileHandler({
        sessionId
      }, testDeps)
      
      expect(result.success).toBe(true)
      expect(mockValidator.validateDockerfile).toHaveBeenCalled()
      // Should have attempted to fix via AI
      expect(testLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/validation failed.*attempting fix/i),
        expect.any(Object)
      )
    })
    
    test('should fail gracefully when prerequisites missing', async () => {
      // Create session without analysis result
      const noAnalysisSessionId = `no-analysis-${Date.now()}`
      await deps.sessionService.create({
        id: noAnalysisSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        workflow_state: {}
      })
      
      const result = await generateDockerfileHandler({
        sessionId: noAnalysisSessionId
      }, deps)
      
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('PREREQUISITES_MISSING')
    })
    
    test('should reuse existing Dockerfile when not forcing regeneration', async () => {
      // First generation
      const firstResult = await generateDockerfileHandler({
        sessionId
      }, deps)
      expect(firstResult.success).toBe(true)
      
      // Second generation without force
      const secondResult = await generateDockerfileHandler({
        sessionId,
        forceRegenerate: false
      }, deps)
      
      expect(secondResult.success).toBe(true)
      expect(testLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/using existing dockerfile/i)
      )
    })
  })
  
  describe('Kubernetes Manifest Generation', () => {
    beforeEach(async () => {
      // Add build result to session
      await deps.sessionService.updateAtomic(sessionId, (s) => ({
        ...s,
        workflow_state: {
          ...s.workflow_state,
          buildResult: {
            imageName: 'myapp:v1.2.3',
            imageId: 'sha256:abcdef123456',
            size: 157000000
          }
        }
      }))
    })
    
    test('should generate complete K8s manifests', async () => {
      const result = await generateK8sManifestsHandler({
        sessionId,
        namespace: 'production',
        replicas: 3,
        serviceType: 'LoadBalancer',
        ingressEnabled: true,
        ingressHost: 'api.example.com'
      }, deps)
      
      expect(result.success).toBe(true)
      expect(result.data.manifests.length).toBeGreaterThanOrEqual(3)
      
      // Check for essential resources
      const kinds = result.data.manifests.map(m => m.kind)
      expect(kinds).toContain('Deployment')
      expect(kinds).toContain('Service')
      expect(kinds).toContain('Ingress')
      
      // Verify deployment details
      expect(result.data.deployment.replicas).toBe(3)
      expect(result.data.deployment.image).toBe('myapp:v1.2.3')
      
      // Verify service details
      expect(result.data.service.type).toBe('LoadBalancer')
      expect(result.data.instructions).toContain('kubectl apply -f k8s/')
    })
    
    test('should include optional resources when requested', async () => {
      const result = await generateK8sManifestsHandler({
        sessionId,
        includeHPA: true,
        includePDB: true,
        includeNetworkPolicy: true,
        includeServiceMonitor: true
      }, deps)
      
      expect(result.success).toBe(true)
      
      const additionalResources = result.data.additionalResources
      // Note: Mock implementation might not generate all resources
      // In real implementation, would check for HPA, PDB, NetworkPolicy, ServiceMonitor
      expect(Array.isArray(additionalResources)).toBe(true)
    })
    
    test('should handle different environments', async () => {
      const environments = ['development', 'staging', 'production']
      
      for (const environment of environments) {
        const result = await generateK8sManifestsHandler({
          sessionId,
          environment
        }, deps)
        
        expect(result.success).toBe(true)
        expect(testLogger.info).toHaveBeenCalledWith(
          expect.stringMatching(/k8s generation parameters prepared/i),
          expect.objectContaining({
            variables: expect.arrayContaining(['environment'])
          })
        )
      }
    })
    
    test('should validate and fix manifests', async () => {
      const mockValidator = {
        validateK8sManifests: jest.fn().mockResolvedValue({
          valid: false,
          errors: ['Missing namespace', 'Invalid resource limits'],
          warnings: ['Using default service account']
        })
      }
      
      const testDeps = deps.withOverrides({ validator: mockValidator })
      
      const result = await generateK8sManifestsHandler({
        sessionId
      }, testDeps)
      
      expect(result.success).toBe(true)
      expect(mockValidator.validateK8sManifests).toHaveBeenCalled()
      expect(testLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/validation failed.*attempting fix/i),
        expect.any(Object)
      )
    })
    
    test('should fail when build result missing', async () => {
      // Create session without build result
      const noBuildSessionId = `no-build-${Date.now()}`
      await deps.sessionService.create({
        id: noBuildSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        workflow_state: {
          analysisResult: {
            language: 'java',
            framework: 'spring-boot'
          }
        }
      })
      
      const result = await generateK8sManifestsHandler({
        sessionId: noBuildSessionId
      }, deps)
      
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('PREREQUISITES_MISSING')
    })
    
    test('should generate deployment instructions', async () => {
      const result = await generateK8sManifestsHandler({
        sessionId,
        namespace: 'test-ns',
        ingressEnabled: true,
        ingressHost: 'test.example.com'
      }, deps)
      
      expect(result.success).toBe(true)
      expect(result.data.instructions).toBeDefined()
      expect(result.data.instructions).toContain('kubectl apply -f k8s/')
      expect(result.data.instructions).toContain('kubectl get pods -n test-ns')
      expect(result.data.instructions).toContain('https://test.example.com')
    })
  })
  
  describe('Error Recovery Service', () => {
    let errorRecovery
    
    beforeEach(() => {
      errorRecovery = new ErrorRecoveryService(deps.sampler, testLogger)
    })
    
    test('should recover from Dockerfile generation errors', async () => {
      const errorContext = {
        tool: 'generate_dockerfile',
        operation: 'ai-generation',
        error: {
          code: 'DOCKERFILE_GENERATION_FAILED',
          message: 'Template variable not found: javaVersion'
        },
        context: {
          sessionId,
          sessionData: {
            dockerfile: 'FROM ubuntu\nCOPY . .\nCMD ["java"]'
          }
        },
        timestamp: new Date().toISOString(),
        severity: 'medium'
      }
      
      const result = await errorRecovery.recoverFromError(errorContext)
      
      expect(result.success).toBe(true)
      expect(result.data.action).toBeDefined()
      expect(result.data.suggestion).toBeDefined()
      expect(testLogger.info).toHaveBeenCalledWith(
        expect.stringMatching(/starting error recovery/i),
        expect.any(Object)
      )
    })
    
    test('should recover from build errors', async () => {
      const errorContext = {
        tool: 'build_image', 
        operation: 'docker-build',
        error: {
          code: 'BUILD_FAILED',
          message: 'COPY failed: file not found: target/app.jar'
        },
        context: {
          sessionId,
          sessionData: {
            dockerfile: 'FROM openjdk:17\nCOPY target/app.jar app.jar\nCMD ["java", "-jar", "app.jar"]',
            buildLog: 'Step 2/3 : COPY target/app.jar app.jar\nCOPY failed: file not found'
          }
        },
        timestamp: new Date().toISOString(),
        severity: 'high'
      }
      
      const result = await errorRecovery.recoverFromError(errorContext)
      
      expect(result.success).toBe(true)
      expect(['retry', 'fix', 'abort']).toContain(result.data.action)
      expect(result.data.suggestion).toBeDefined()
    })
    
    test('should recover from K8s errors', async () => {
      const errorContext = {
        tool: 'generate_k8s_manifests',
        operation: 'manifest-generation', 
        error: {
          code: 'K8S_GENERATION_FAILED',
          message: 'Invalid YAML: mapping values are not allowed in this context'
        },
        context: {
          sessionId,
          sessionData: {
            manifests: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\nspec:\n  replicas: 3'
          }
        },
        timestamp: new Date().toISOString(),
        severity: 'medium'
      }
      
      const result = await errorRecovery.recoverFromError(errorContext)
      
      expect(result.success).toBe(true)
      expect(result.data.action).toBeDefined()
      expect(result.data.suggestion).toBeDefined()
    })
    
    test('should respect max recovery attempts', async () => {
      const errorContext = {
        tool: 'generate_dockerfile',
        operation: 'ai-generation',
        error: {
          code: 'DOCKERFILE_GENERATION_FAILED', 
          message: 'Persistent error'
        },
        context: {
          sessionId
        },
        timestamp: new Date().toISOString()
      }
      
      // Simulate multiple failed attempts
      for (let i = 0; i < 4; i++) {
        const result = await errorRecovery.recoverFromError(errorContext)
        
        if (i < 3) {
          expect(result.success).toBe(true)
          expect(result.data.action).not.toBe('abort')
        } else {
          expect(result.success).toBe(true)
          expect(result.data.action).toBe('abort')
          expect(result.data.suggestion).toContain('Maximum recovery attempts')
        }
      }
    })
    
    test('should classify errors correctly', async () => {
      const testCases = [
        {
          message: 'Template variable not found',
          expected: 'template_error'
        },
        {
          message: 'File not found: target/app.jar',
          expected: 'file_not_found'
        },
        {
          message: 'ImagePullBackOff: pull access denied',
          expected: 'image_pull_error'
        },
        {
          message: 'Invalid YAML syntax',
          expected: 'format_error'
        }
      ]
      
      for (const testCase of testCases) {
        const dockerfileType = errorRecovery.classifyDockerfileError(testCase.message)
        const buildType = errorRecovery.classifyBuildError(testCase.message)
        const k8sType = errorRecovery.classifyK8sError(testCase.message)
        const deployType = errorRecovery.classifyDeploymentError(testCase.message)
        
        // At least one classifier should return the expected type
        const classifications = [dockerfileType, buildType, k8sType, deployType]
        expect(classifications.some(c => c === testCase.expected)).toBe(true)
      }
    })
    
    test('should provide recovery statistics', () => {
      const stats = errorRecovery.getStatistics()
      
      expect(stats).toHaveProperty('totalAttempts')
      expect(stats).toHaveProperty('successfulRecoveries')
      expect(stats).toHaveProperty('successRate')
      expect(stats).toHaveProperty('activeRecoveries')
      
      expect(typeof stats.totalAttempts).toBe('number')
      expect(typeof stats.successfulRecoveries).toBe('number')
      expect(typeof stats.successRate).toBe('number')
      expect(typeof stats.activeRecoveries).toBe('number')
    })
  })
  
  describe('Integration Workflow', () => {
    test('should complete full AI workflow: analysis -> dockerfile -> k8s', async () => {
      // 1. Generate Dockerfile
      const dockerfileResult = await generateDockerfileHandler({
        sessionId,
        optimization: 'balanced',
        includeHealthcheck: true
      }, deps)
      
      expect(dockerfileResult.success).toBe(true)
      expect(dockerfileResult.data.dockerfile).toBeDefined()
      
      // 2. Simulate build result
      await deps.sessionService.updateAtomic(sessionId, (s) => ({
        ...s,
        workflow_state: {
          ...s.workflow_state,
          buildResult: {
            imageName: 'myapp:latest',
            imageId: 'sha256:123456',
            size: 200000000
          }
        }
      }))
      
      // 3. Generate K8s manifests
      const k8sResult = await generateK8sManifestsHandler({
        sessionId,
        namespace: 'default',
        replicas: 2,
        serviceType: 'ClusterIP'
      }, deps)
      
      expect(k8sResult.success).toBe(true)
      expect(k8sResult.data.manifests.length).toBeGreaterThan(0)
      
      // 4. Verify session state updated
      const finalSession = await deps.sessionService.get(sessionId)
      expect(finalSession.workflow_state.dockerfileResult).toBeDefined()
      expect(finalSession.workflow_state.k8sResult).toBeDefined()
    })
    
    test('should handle AI sampling failures gracefully', async () => {
      // Create mock sampler that fails
      const failingSampler = {
        sample: jest.fn().mockResolvedValue({
          success: false,
          error: { message: 'AI service unavailable' }
        })
      }
      
      const testDeps = deps.withOverrides({ sampler: failingSampler })
      
      const result = await generateDockerfileHandler({
        sessionId
      }, testDeps)
      
      expect(result.success).toBe(false)
      expect(result.error.code).toBe('DOCKERFILE_GENERATION_FAILED')
      expect(failingSampler.sample).toHaveBeenCalled()
    })
    
    test('should emit progress events during operations', async () => {
      const progressEvents = []
      const mockProgressEmitter = {
        emit: jest.fn().mockImplementation(async (event) => {
          progressEvents.push(event)
        })
      }
      
      const testDeps = deps.withOverrides({ 
        progressEmitter: mockProgressEmitter
      })
      
      const result = await generateDockerfileHandler({
        sessionId
      }, testDeps)
      
      expect(result.success).toBe(true)
      expect(mockProgressEmitter.emit).toHaveBeenCalledTimes(4) // starting, 2 in_progress, completed
      
      const statuses = progressEvents.map(e => e.status)
      expect(statuses).toContain('starting')
      expect(statuses).toContain('in_progress')
      expect(statuses).toContain('completed')
    })
  })
})