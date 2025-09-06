import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { pino } from 'pino'
import { SessionManager } from '../../../src/workflows/orchestration/session-manager.js'
import { WorkflowStage, DEFAULT_WORKFLOW_CONFIG } from '../../../src/workflows/orchestration/types.js'

describe('SessionManager Integration Tests', () => {
  let sessionManager: SessionManager
  let logger: any

  beforeEach(() => {
    logger = pino({ level: 'silent' })
    sessionManager = new SessionManager(logger)
  })

  afterEach(async () => {
    // Clean up all sessions
    await sessionManager.reset()
  })

  describe('Session Creation', () => {
    it('should create a new session with default configuration', async () => {
      const repository = {
        path: '/tmp/test-repo',
        name: 'test-repo'
      }

      const result = await sessionManager.createSession(repository)

      expect(result.ok).toBe(true)
      expect(result.value).toBeDefined()

      const session = result.value
      expect(session.id).toBeDefined()
      expect(session.id).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/)
      expect(session.repository).toEqual(repository)
      expect(session.config).toEqual(DEFAULT_WORKFLOW_CONFIG)
      expect(session.state.currentStage).toBe(WorkflowStage.ANALYSIS)
      expect(session.state.completedStages).toEqual([])
      expect(session.state.failedStages).toEqual([])
      expect(session.artifacts.size).toBe(0)
      expect(session.startTime).toBeInstanceOf(Date)
      expect(session.lastActivity).toBeInstanceOf(Date)
    })

    it('should create a session with custom configuration', async () => {
      const repository = {
        path: '/tmp/custom-repo',
        name: 'custom-repo',
        url: 'https://github.com/user/repo.git',
        branch: 'main'
      }

      const customConfig = {
        enableSampling: false,
        maxCandidates: 5,
        targetEnvironment: 'prod' as const,
        buildTimeout: 600
      }

      const result = await sessionManager.createSession(repository, customConfig)

      expect(result.ok).toBe(true)
      
      const session = result.value
      expect(session.repository).toEqual(repository)
      expect(session.config.enableSampling).toBe(false)
      expect(session.config.maxCandidates).toBe(5)
      expect(session.config.targetEnvironment).toBe('prod')
      expect(session.config.buildTimeout).toBe(600)
      
      // Should merge with defaults
      expect(session.config.enableBuildCache).toBe(DEFAULT_WORKFLOW_CONFIG.enableBuildCache)
    })

    it('should generate unique session IDs', async () => {
      const repository = { path: '/tmp/unique-test', name: 'unique-test' }
      const sessionIds = new Set<string>()

      // Create multiple sessions
      for (let i = 0; i < 10; i++) {
        const result = await sessionManager.createSession({
          ...repository,
          path: `${repository.path}-${i}`
        })
        expect(result.ok).toBe(true)
        sessionIds.add(result.value.id)
      }

      expect(sessionIds.size).toBe(10) // All IDs should be unique
    })
  })

  describe('Session Retrieval', () => {
    it('should retrieve an existing session', async () => {
      const repository = { path: '/tmp/retrieve-test', name: 'retrieve-test' }
      
      const createResult = await sessionManager.createSession(repository)
      expect(createResult.ok).toBe(true)
      
      const sessionId = createResult.value.id
      
      const retrieveResult = await sessionManager.getSession(sessionId)
      expect(retrieveResult.ok).toBe(true)
      expect(retrieveResult.value.id).toBe(sessionId)
      expect(retrieveResult.value.repository).toEqual(repository)
    })

    it('should return error for non-existent session', async () => {
      const result = await sessionManager.getSession('nonexistent_session_id')
      
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Session nonexistent_session_id not found')
    })

    it('should update last activity when retrieving session', async () => {
      const repository = { path: '/tmp/activity-test', name: 'activity-test' }
      
      const createResult = await sessionManager.createSession(repository)
      const sessionId = createResult.value.id
      const originalLastActivity = createResult.value.lastActivity

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10))

      const retrieveResult = await sessionManager.getSession(sessionId)
      expect(retrieveResult.ok).toBe(true)
      
      const newLastActivity = retrieveResult.value.lastActivity
      expect(newLastActivity.getTime()).toBeGreaterThan(originalLastActivity.getTime())
    })
  })

  describe('Session Updates', () => {
    let sessionId: string

    beforeEach(async () => {
      const repository = { path: '/tmp/update-test', name: 'update-test' }
      const createResult = await sessionManager.createSession(repository)
      sessionId = createResult.value.id
    })

    it('should update session state for stage progression', async () => {
      // Start stage
      let result = await sessionManager.updateSessionState(sessionId, WorkflowStage.DOCKERFILE_GENERATION, 'started')
      expect(result.ok).toBe(true)
      expect(result.value.state.currentStage).toBe(WorkflowStage.DOCKERFILE_GENERATION)

      // Complete stage
      result = await sessionManager.updateSessionState(sessionId, WorkflowStage.DOCKERFILE_GENERATION, 'completed')
      expect(result.ok).toBe(true)
      expect(result.value.state.completedStages).toContain(WorkflowStage.DOCKERFILE_GENERATION)
      expect(result.value.state.failedStages).not.toContain(WorkflowStage.DOCKERFILE_GENERATION)
    })

    it('should handle stage failures and retry counting', async () => {
      // Fail stage
      let result = await sessionManager.updateSessionState(sessionId, WorkflowStage.BUILD, 'failed')
      expect(result.ok).toBe(true)
      expect(result.value.state.failedStages).toContain(WorkflowStage.BUILD)
      expect(result.value.state.retryCount[WorkflowStage.BUILD]).toBe(1)

      // Fail again
      result = await sessionManager.updateSessionState(sessionId, WorkflowStage.BUILD, 'failed')
      expect(result.ok).toBe(true)
      expect(result.value.state.retryCount[WorkflowStage.BUILD]).toBe(2)

      // Eventually succeed
      result = await sessionManager.updateSessionState(sessionId, WorkflowStage.BUILD, 'completed')
      expect(result.ok).toBe(true)
      expect(result.value.state.completedStages).toContain(WorkflowStage.BUILD)
      expect(result.value.state.failedStages).not.toContain(WorkflowStage.BUILD)
    })

    it('should update general session properties', async () => {
      const updates = {
        config: {
          ...DEFAULT_WORKFLOW_CONFIG,
          enableSampling: false
        }
      }

      const result = await sessionManager.updateSession(sessionId, updates)
      expect(result.ok).toBe(true)
      expect(result.value.config.enableSampling).toBe(false)
    })
  })

  describe('Artifact Management', () => {
    let sessionId: string

    beforeEach(async () => {
      const repository = { path: '/tmp/artifact-test', name: 'artifact-test' }
      const createResult = await sessionManager.createSession(repository)
      sessionId = createResult.value.id
    })

    it('should add and retrieve session artifacts', async () => {
      const artifactName = 'analysis_summary'
      const resourceUri = 'resource://analysis/summary'

      // Add artifact
      const addResult = await sessionManager.addSessionArtifact(sessionId, artifactName, resourceUri)
      expect(addResult.ok).toBe(true)

      // Retrieve artifact
      const getResult = await sessionManager.getSessionArtifact(sessionId, artifactName)
      expect(getResult.ok).toBe(true)
      expect(getResult.value).toBe(resourceUri)
    })

    it('should return error for non-existent artifact', async () => {
      const result = await sessionManager.getSessionArtifact(sessionId, 'nonexistent_artifact')
      
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Artifact nonexistent_artifact not found')
    })

    it('should handle multiple artifacts per session', async () => {
      const artifacts = [
        ['analysis_summary', 'resource://analysis/summary'],
        ['dockerfile_winner', 'resource://dockerfile/winner'],
        ['build_logs', 'resource://build/logs']
      ]

      // Add multiple artifacts
      for (const [name, uri] of artifacts) {
        const result = await sessionManager.addSessionArtifact(sessionId, name, uri)
        expect(result.ok).toBe(true)
      }

      // Retrieve all artifacts
      for (const [name, expectedUri] of artifacts) {
        const result = await sessionManager.getSessionArtifact(sessionId, name)
        expect(result.ok).toBe(true)
        expect(result.value).toBe(expectedUri)
      }

      // Check session has all artifacts
      const sessionResult = await sessionManager.getSession(sessionId)
      expect(sessionResult.ok).toBe(true)
      expect(sessionResult.value.artifacts.size).toBe(artifacts.length)
    })
  })

  describe('Session Listing and Statistics', () => {
    beforeEach(async () => {
      // Create test sessions in various states
      const sessions = [
        { path: '/tmp/active-1', stage: WorkflowStage.ANALYSIS },
        { path: '/tmp/active-2', stage: WorkflowStage.BUILD },
        { path: '/tmp/completed', stage: WorkflowStage.VERIFICATION, completed: true },
        { path: '/tmp/failed', stage: WorkflowStage.SCAN, failed: true }
      ]

      for (const sessionData of sessions) {
        const createResult = await sessionManager.createSession({
          path: sessionData.path,
          name: sessionData.path.split('/').pop()!
        })

        if (sessionData.completed) {
          // Mark all stages as completed
          for (const stage of Object.values(WorkflowStage)) {
            await sessionManager.updateSessionState(createResult.value.id, stage, 'completed')
          }
        } else if (sessionData.failed) {
          await sessionManager.updateSessionState(createResult.value.id, sessionData.stage, 'failed')
        } else {
          await sessionManager.updateSessionState(createResult.value.id, sessionData.stage, 'started')
        }
      }
    })

    it('should list all active sessions', async () => {
      const sessions = await sessionManager.listSessions()
      
      expect(sessions.length).toBe(4)
      
      const sessionPaths = sessions.map(s => s.repository.path)
      expect(sessionPaths).toContain('/tmp/active-1')
      expect(sessionPaths).toContain('/tmp/active-2')
      expect(sessionPaths).toContain('/tmp/completed')
      expect(sessionPaths).toContain('/tmp/failed')
    })

    it('should provide accurate session statistics', async () => {
      const stats = sessionManager.getSessionStats()
      
      expect(stats.total).toBe(4)
      expect(stats.byStage[WorkflowStage.ANALYSIS]).toBe(1)
      expect(stats.byStage[WorkflowStage.BUILD]).toBe(1)
      expect(stats.byStage[WorkflowStage.VERIFICATION]).toBe(1)
      expect(stats.byStage[WorkflowStage.SCAN]).toBe(1)
      
      expect(stats.byStatus.active).toBeGreaterThanOrEqual(2) // At least the two active ones
      expect(stats.byStatus.completed).toBeGreaterThanOrEqual(1)
      expect(stats.byStatus.failed).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Session Cleanup', () => {
    it('should delete sessions', async () => {
      const repository = { path: '/tmp/delete-test', name: 'delete-test' }
      
      const createResult = await sessionManager.createSession(repository)
      const sessionId = createResult.value.id
      
      // Verify session exists
      const getResult1 = await sessionManager.getSession(sessionId)
      expect(getResult1.ok).toBe(true)
      
      // Delete session
      const deleteResult = await sessionManager.deleteSession(sessionId)
      expect(deleteResult.ok).toBe(true)
      
      // Verify session is gone
      const getResult2 = await sessionManager.getSession(sessionId)
      expect(getResult2.ok).toBe(false)
    })

    it('should handle deletion of non-existent session', async () => {
      const result = await sessionManager.deleteSession('nonexistent_session')
      
      expect(result.ok).toBe(false)
      expect(result.error).toContain('Session nonexistent_session not found')
    })

    it('should cleanup expired sessions', async () => {
      // Create a session
      const repository = { path: '/tmp/cleanup-test', name: 'cleanup-test' }
      const createResult = await sessionManager.createSession(repository)
      const sessionId = createResult.value.id

      // Manually set last activity to old date (simulate TTL expiry)
      const session = await sessionManager.getSession(sessionId)
      if (session.ok) {
        session.value.lastActivity = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
        await sessionManager.updateSession(sessionId, { lastActivity: session.value.lastActivity })
      }

      // Run cleanup
      await sessionManager.cleanupExpiredSessions()

      // Session should be gone
      const getResult = await sessionManager.getSession(sessionId)
      expect(getResult.ok).toBe(false)
    })

    it('should reset all sessions', async () => {
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        await sessionManager.createSession({
          path: `/tmp/reset-test-${i}`,
          name: `reset-test-${i}`
        })
      }

      let sessions = await sessionManager.listSessions()
      expect(sessions.length).toBe(3)

      // Reset all sessions
      await sessionManager.reset()

      sessions = await sessionManager.listSessions()
      expect(sessions.length).toBe(0)
    })
  })

  describe('Concurrent Session Management', () => {
    it('should handle concurrent session creation', async () => {
      const concurrentCreations = Array.from({ length: 10 }, (_, i) =>
        sessionManager.createSession({
          path: `/tmp/concurrent-${i}`,
          name: `concurrent-${i}`
        })
      )

      const results = await Promise.all(concurrentCreations)
      
      // All should succeed
      results.forEach(result => {
        expect(result.ok).toBe(true)
      })

      // All should have unique IDs
      const sessionIds = results.map(r => r.value.id)
      const uniqueIds = new Set(sessionIds)
      expect(uniqueIds.size).toBe(10)

      // Verify all sessions exist
      const sessions = await sessionManager.listSessions()
      expect(sessions.length).toBe(10)
    })

    it('should handle concurrent updates to same session', async () => {
      const repository = { path: '/tmp/concurrent-update', name: 'concurrent-update' }
      const createResult = await sessionManager.createSession(repository)
      const sessionId = createResult.value.id

      // Concurrent updates
      const updates = [
        sessionManager.updateSessionState(sessionId, WorkflowStage.ANALYSIS, 'completed'),
        sessionManager.updateSessionState(sessionId, WorkflowStage.DOCKERFILE_GENERATION, 'started'),
        sessionManager.addSessionArtifact(sessionId, 'test1', 'resource://test1'),
        sessionManager.addSessionArtifact(sessionId, 'test2', 'resource://test2')
      ]

      const results = await Promise.all(updates)
      
      // All should succeed
      results.forEach(result => {
        expect(result.ok).toBe(true)
      })

      // Verify final state
      const finalSession = await sessionManager.getSession(sessionId)
      expect(finalSession.ok).toBe(true)
      expect(finalSession.value.state.completedStages).toContain(WorkflowStage.ANALYSIS)
      expect(finalSession.value.state.currentStage).toBe(WorkflowStage.DOCKERFILE_GENERATION)
      expect(finalSession.value.artifacts.size).toBe(2)
    })
  })
})