import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { pino } from 'pino'
import { WorkflowCoordinator } from '../../../src/workflows/orchestration/coordinator.js'
import { createRealResourceManager, createRealProgressNotifier } from '../../../src/workflows/orchestration/real-implementations.js'

describe('Real Implementation Integration Tests', () => {
  let coordinator: WorkflowCoordinator
  let logger: any

  beforeEach(() => {
    // Create a test logger that doesn't output during tests
    logger = pino({ level: 'silent' })
  })

  afterEach(async () => {
    // Cleanup any active sessions
    if (coordinator) {
      const sessions = await coordinator.listActiveSessions()
      for (const session of sessions) {
        await coordinator.cancelWorkflow(session.id)
      }
    }
  })

  describe('Team Alpha Real Implementations', () => {
    it('should create coordinator with real Team Alpha implementations', async () => {
      const realResourceManager = createRealResourceManager(logger)
      const realProgressNotifier = createRealProgressNotifier(logger)
      
      coordinator = new WorkflowCoordinator(
        logger,
        realResourceManager,
        realProgressNotifier
      )

      expect(coordinator).toBeDefined()
      
      // Test basic functionality
      const repositoryPath = '/tmp/real-impl-test'
      const result = await coordinator.executeWorkflow(repositoryPath, {
        enableSampling: false, // Start simple
        keepIntermediateArtifacts: true
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeDefined()
      expect(result.value.sessionId).toBeDefined()
    }, 30000)

    it('should handle resource management with real Team Alpha ResourceManager', async () => {
      const realResourceManager = createRealResourceManager(logger)
      
      // Test direct resource operations
      const testUri = 'mcp://test/resource/example'
      const testContent = { message: 'Hello from Team Alpha integration!', timestamp: new Date() }
      
      // This should work through the adapter
      const publishedUri = await realResourceManager.publish(testUri, testContent, 300) // 5 minute TTL
      expect(publishedUri).toBe(testUri)
      
      // Read back the content
      const retrievedContent = await realResourceManager.read(testUri)
      expect(retrievedContent).toEqual(testContent)
    })

    it('should handle progress notifications with real Team Alpha ProgressNotifier', async () => {
      const progressEvents: any[] = []
      
      const realProgressNotifier = createRealProgressNotifier(logger)
      
      // Mock the event emission to capture events
      const originalNotifyProgress = realProgressNotifier.notifyProgress
      realProgressNotifier.notifyProgress = (progress) => {
        progressEvents.push({ type: 'progress', ...progress })
        originalNotifyProgress.call(realProgressNotifier, progress)
      }

      const originalNotifyComplete = realProgressNotifier.notifyComplete  
      realProgressNotifier.notifyComplete = (token) => {
        progressEvents.push({ type: 'complete', token })
        originalNotifyComplete.call(realProgressNotifier, token)
      }

      // Test progress notifications
      const testToken = 'test_progress_token'
      
      realProgressNotifier.notifyProgress({
        token: testToken,
        value: 25,
        message: 'Starting test operation'
      })

      realProgressNotifier.notifyProgress({
        token: testToken,
        value: 75,
        message: 'Test operation in progress'
      })

      realProgressNotifier.notifyComplete(testToken)
      
      // Verify events were captured
      expect(progressEvents).toHaveLength(3)
      expect(progressEvents[0].type).toBe('progress')
      expect(progressEvents[0].value).toBe(25)
      expect(progressEvents[1].value).toBe(75)
      expect(progressEvents[2].type).toBe('complete')
    })
  })

  describe('Environment-Based Implementation Selection', () => {
    it('should use real implementations when USE_REAL_IMPLEMENTATIONS=true', async () => {
      // Temporarily set environment variable
      const originalEnv = process.env.USE_REAL_IMPLEMENTATIONS
      process.env.USE_REAL_IMPLEMENTATIONS = 'true'
      
      try {
        coordinator = new WorkflowCoordinator(logger)
        
        // The coordinator should now be using real implementations
        // We can verify this by checking the constructor names logged during initialization
        expect(coordinator).toBeDefined()
        
        // Test that it works end-to-end
        const result = await coordinator.executeWorkflow('/tmp/env-test')
        expect(result.ok).toBe(true)
        
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.USE_REAL_IMPLEMENTATIONS = originalEnv
        } else {
          delete process.env.USE_REAL_IMPLEMENTATIONS
        }
      }
    }, 25000)

    it('should fall back to mocks when USE_REAL_IMPLEMENTATIONS=false', async () => {
      // Ensure environment variable is not set
      const originalEnv = process.env.USE_REAL_IMPLEMENTATIONS
      process.env.USE_REAL_IMPLEMENTATIONS = 'false'
      
      try {
        coordinator = new WorkflowCoordinator(logger)
        
        expect(coordinator).toBeDefined()
        
        // Should still work with mocks
        const result = await coordinator.executeWorkflow('/tmp/mock-fallback-test')
        expect(result.ok).toBe(true)
        
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.USE_REAL_IMPLEMENTATIONS = originalEnv
        } else {
          delete process.env.USE_REAL_IMPLEMENTATIONS
        }
      }
    }, 25000)
  })

  describe('Error Handling with Real Implementations', () => {
    it('should handle resource manager errors gracefully', async () => {
      const realResourceManager = createRealResourceManager(logger)
      
      // Test with invalid URI
      try {
        await realResourceManager.publish('invalid-uri-format', { test: 'data' })
        fail('Should have thrown an error for invalid URI')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toContain('Invalid URI')
      }
    })

    it('should handle progress notifier errors gracefully', async () => {
      const realProgressNotifier = createRealProgressNotifier(logger)
      
      // Test with invalid progress value - should be clamped
      expect(() => {
        realProgressNotifier.notifyProgress({
          token: 'test',
          value: -10 // Invalid negative value
        })
      }).not.toThrow()
      
      expect(() => {
        realProgressNotifier.notifyProgress({
          token: 'test',  
          value: 150 // Invalid over 100 value
        })
      }).not.toThrow()
    })
  })

  describe('Performance with Real Implementations', () => {
    it('should maintain performance standards with real implementations', async () => {
      const realResourceManager = createRealResourceManager(logger)
      const realProgressNotifier = createRealProgressNotifier(logger)
      
      coordinator = new WorkflowCoordinator(
        logger,
        realResourceManager,
        realProgressNotifier
      )

      const startTime = Date.now()
      
      const result = await coordinator.executeWorkflow('/tmp/performance-test', {
        enableSampling: false,
        keepIntermediateArtifacts: false
      })
      
      const duration = Date.now() - startTime
      
      expect(result.ok).toBe(true)
      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds
      expect(result.value.metrics.totalDuration).toBeGreaterThan(0)
    }, 35000)
  })
})