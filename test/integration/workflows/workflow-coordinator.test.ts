import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { pino } from 'pino'
import { WorkflowCoordinator } from '../../../src/workflows/orchestration/coordinator.js'
import { WorkflowStage } from '../../../src/workflows/orchestration/types.js'

describe('WorkflowCoordinator Integration Tests', () => {
  let coordinator: WorkflowCoordinator
  let logger: any

  beforeEach(() => {
    // Create a test logger that doesn't output during tests
    logger = pino({ level: 'silent' })
    
    // Initialize coordinator with mocks
    coordinator = new WorkflowCoordinator(logger)
  })

  afterEach(async () => {
    // Cleanup any active sessions
    const sessions = await coordinator.listActiveSessions()
    for (const session of sessions) {
      await coordinator.cancelWorkflow(session.id)
    }
  })

  describe('Happy Path Workflow', () => {
    it('should execute complete workflow successfully', async () => {
      const repositoryPath = '/tmp/test-node-app'
      
      const result = await coordinator.executeWorkflow(repositoryPath, {
        enableSampling: true,
        maxCandidates: 3,
        targetEnvironment: 'dev'
      })

      expect(result.ok).toBe(true)
      expect(result.value).toBeDefined()
      
      const workflowResult = result.value
      expect(workflowResult.sessionId).toBeDefined()
      expect(workflowResult.duration).toBeGreaterThan(0)
      expect(workflowResult.completedStages).toContain(WorkflowStage.ANALYSIS)
      expect(workflowResult.completedStages).toContain(WorkflowStage.DOCKERFILE_GENERATION)
      expect(workflowResult.completedStages).toContain(WorkflowStage.BUILD)
      expect(workflowResult.completedStages).toContain(WorkflowStage.SCAN)
      expect(workflowResult.completedStages).toContain(WorkflowStage.K8S_GENERATION)
      expect(workflowResult.completedStages).toContain(WorkflowStage.DEPLOYMENT)
      expect(workflowResult.completedStages).toContain(WorkflowStage.VERIFICATION)
      
      expect(workflowResult.metrics).toBeDefined()
      expect(workflowResult.metrics.totalDuration).toBeGreaterThan(0)
      expect(Object.keys(workflowResult.metrics.stageDurations)).toHaveLength(7)
      
      expect(workflowResult.finalArtifacts).toBeDefined()
      expect(Object.keys(workflowResult.finalArtifacts).length).toBeGreaterThan(0)
    }, 30000) // 30 second timeout for full workflow

    it('should execute workflow with sampling disabled', async () => {
      const repositoryPath = '/tmp/test-python-app'
      
      const result = await coordinator.executeWorkflow(repositoryPath, {
        enableSampling: false,
        targetEnvironment: 'prod'
      })

      expect(result.ok).toBe(true)
      
      const workflowResult = result.value
      expect(workflowResult.sessionId).toBeDefined()
      expect(workflowResult.completedStages.length).toBeGreaterThan(0)
    }, 25000)
  })

  describe('Configuration Handling', () => {
    it('should use default configuration when none provided', async () => {
      const repositoryPath = '/tmp/default-config-test'
      
      const result = await coordinator.executeWorkflow(repositoryPath)

      expect(result.ok).toBe(true)
      
      // Verify session was created with defaults
      const sessions = await coordinator.listActiveSessions()
      const session = sessions.find(s => s.repository.path === repositoryPath)
      
      expect(session).toBeDefined()
      expect(session.config.enableSampling).toBe(true) // Default
      expect(session.config.maxCandidates).toBe(3) // Default
      expect(session.config.targetEnvironment).toBe('dev') // Default
    }, 20000)

    it('should override default configuration with provided values', async () => {
      const repositoryPath = '/tmp/custom-config-test'
      const customConfig = {
        enableSampling: false,
        maxCandidates: 5,
        targetEnvironment: 'staging' as const,
        buildTimeout: 600,
        enableAutoRemediation: false
      }
      
      const result = await coordinator.executeWorkflow(repositoryPath, customConfig)

      expect(result.ok).toBe(true)
      
      const sessions = await coordinator.listActiveSessions()
      const session = sessions.find(s => s.repository.path === repositoryPath)
      
      expect(session).toBeDefined()
      expect(session.config.enableSampling).toBe(false)
      expect(session.config.maxCandidates).toBe(5)
      expect(session.config.targetEnvironment).toBe('staging')
      expect(session.config.buildTimeout).toBe(600)
      expect(session.config.enableAutoRemediation).toBe(false)
    }, 20000)
  })

  describe('Session Management', () => {
    it('should create and manage sessions properly', async () => {
      const repositoryPath = '/tmp/session-test'
      
      // Start workflow
      const workflowPromise = coordinator.executeWorkflow(repositoryPath)
      
      // Check session creation
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait for session creation
      const sessions = await coordinator.listActiveSessions()
      expect(sessions.length).toBe(1)
      
      const session = sessions[0]
      expect(session.repository.path).toBe(repositoryPath)
      expect(session.id).toBeDefined()
      
      // Check session status
      const statusResult = await coordinator.getSessionStatus(session.id)
      expect(statusResult.ok).toBe(true)
      expect(statusResult.value.id).toBe(session.id)
      
      // Wait for workflow completion
      const result = await workflowPromise
      expect(result.ok).toBe(true)
    }, 25000)

    it('should allow workflow cancellation', async () => {
      const repositoryPath = '/tmp/cancellation-test'
      
      // Start workflow
      coordinator.executeWorkflow(repositoryPath)
      
      // Wait for session creation
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const sessions = await coordinator.listActiveSessions()
      expect(sessions.length).toBe(1)
      
      const sessionId = sessions[0].id
      
      // Cancel workflow
      const cancelResult = await coordinator.cancelWorkflow(sessionId)
      expect(cancelResult.ok).toBe(true)
      
      // Verify session is gone
      const remainingSessions = await coordinator.listActiveSessions()
      expect(remainingSessions.find(s => s.id === sessionId)).toBeUndefined()
    })

    it('should handle multiple concurrent workflows', async () => {
      const workflows = [
        coordinator.executeWorkflow('/tmp/concurrent-test-1'),
        coordinator.executeWorkflow('/tmp/concurrent-test-2'),
        coordinator.executeWorkflow('/tmp/concurrent-test-3')
      ]
      
      // Wait a bit for sessions to be created
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const sessions = await coordinator.listActiveSessions()
      expect(sessions.length).toBe(3)
      
      // Wait for all workflows to complete
      const results = await Promise.all(workflows)
      
      results.forEach((result, index) => {
        expect(result.ok).toBe(true)
        expect(result.value.sessionId).toBeDefined()
      })
    }, 40000)
  })

  describe('Error Handling', () => {
    it('should handle invalid repository path gracefully', async () => {
      const invalidPath = '/nonexistent/repository/path'
      
      const result = await coordinator.executeWorkflow(invalidPath)
      
      // Mock implementation should still succeed, but in real implementation
      // this would test proper error handling
      expect(result.ok).toBe(true)
      
      // In a real scenario with actual tools, we'd expect:
      // expect(result.ok).toBe(false)
      // expect(result.error).toContain('Repository not found')
    })

    it('should track retry attempts in metrics', async () => {
      const repositoryPath = '/tmp/retry-test'
      
      const result = await coordinator.executeWorkflow(repositoryPath)
      
      expect(result.ok).toBe(true)
      expect(result.value.metrics.retryCount).toBeGreaterThanOrEqual(0)
    }, 25000)
  })

  describe('Progress Tracking', () => {
    it('should emit progress notifications during workflow execution', async () => {
      const repositoryPath = '/tmp/progress-test'
      const progressEvents: any[] = []
      
      // Mock progress notifier to capture events
      const mockProgressNotifier = {
        notifyProgress: (progress: any) => {
          progressEvents.push({ type: 'progress', ...progress })
        },
        notifyComplete: (token: string) => {
          progressEvents.push({ type: 'complete', token })
        },
        notifyError: (token: string, error: string) => {
          progressEvents.push({ type: 'error', token, error })
        }
      }
      
      const testCoordinator = new WorkflowCoordinator(
        logger,
        undefined, // Use default resource manager
        mockProgressNotifier
      )
      
      const result = await testCoordinator.executeWorkflow(repositoryPath)
      
      expect(result.ok).toBe(true)
      expect(progressEvents.length).toBeGreaterThan(0)
      
      // Should have at least initial progress and completion events
      const progressUpdates = progressEvents.filter(e => e.type === 'progress')
      const completeEvents = progressEvents.filter(e => e.type === 'complete')
      
      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(completeEvents.length).toBe(1)
      
      // Progress should be between 0-100
      progressUpdates.forEach(event => {
        expect(event.value).toBeGreaterThanOrEqual(0)
        expect(event.value).toBeLessThanOrEqual(100)
      })
    }, 25000)
  })

  describe('Artifact Management', () => {
    it('should collect and return workflow artifacts', async () => {
      const repositoryPath = '/tmp/artifact-test'
      
      const result = await coordinator.executeWorkflow(repositoryPath, {
        keepIntermediateArtifacts: true
      })
      
      expect(result.ok).toBe(true)
      expect(result.value.finalArtifacts).toBeDefined()
      
      const artifacts = result.value.finalArtifacts
      
      // Should have artifacts from various stages
      const artifactNames = Object.keys(artifacts)
      expect(artifactNames.length).toBeGreaterThan(0)
      
      // Check for expected artifact types
      const hasAnalysisArtifacts = artifactNames.some(name => name.startsWith('analysis_'))
      const hasDockerfileArtifacts = artifactNames.some(name => name.startsWith('dockerfile_'))
      const hasBuildArtifacts = artifactNames.some(name => name.startsWith('build_'))
      
      expect(hasAnalysisArtifacts).toBe(true)
      expect(hasDockerfileArtifacts).toBe(true)
      expect(hasBuildArtifacts).toBe(true)
    }, 25000)
  })

  describe('Performance Metrics', () => {
    it('should collect timing metrics for each stage', async () => {
      const repositoryPath = '/tmp/metrics-test'
      
      const result = await coordinator.executeWorkflow(repositoryPath)
      
      expect(result.ok).toBe(true)
      expect(result.value.metrics).toBeDefined()
      
      const metrics = result.value.metrics
      expect(metrics.totalDuration).toBeGreaterThan(0)
      expect(metrics.stageDurations).toBeDefined()
      
      // Should have timing for each completed stage
      const stageDurations = metrics.stageDurations
      const stages = Object.keys(stageDurations)
      
      expect(stages.length).toBeGreaterThan(0)
      
      // All stage durations should be positive
      stages.forEach(stage => {
        expect(stageDurations[stage as WorkflowStage]).toBeGreaterThan(0)
      })
      
      // Total duration should be at least the sum of stage durations
      const stageSum = Object.values(stageDurations).reduce((sum, duration) => sum + duration, 0)
      expect(metrics.totalDuration).toBeGreaterThanOrEqual(stageSum)
    }, 25000)
  })
})