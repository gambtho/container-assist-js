/**
 * Session Service Factory - Handles creation of session and workflow services
 */

import { SessionService } from '../session/manager.js'
import { SessionStoreFactory, StoreConfig } from '../../infrastructure/core/persistence/store-factory.js'
import { WorkflowOrchestrator } from '../workflow/orchestrator.js'
import { WorkflowManager } from '../workflow/manager.js'
import type { Logger } from '../../domain/types/index.js'
import type { ProgressEmitter } from '../interfaces.js'
import type { ApplicationConfig } from '../../config/index.js'

export interface SessionServices {
  sessionService: SessionService
  workflowOrchestrator: WorkflowOrchestrator
  workflowManager: WorkflowManager
}

export class SessionServiceFactory {
  static async create(
    config: ApplicationConfig,
    logger: Logger,
    progressEmitter: ProgressEmitter
  ): Promise<SessionServices> {
    
    // Create session store and service
    const storeConfig: StoreConfig = {
      type: 'memory'
    }

    const sessionStore = await SessionStoreFactory.create(storeConfig, logger)

    const sessionConfig: Record<string, any> = {}
    if (config.session?.ttl !== undefined) {
      sessionConfig.defaultTTL = config.session.ttl
    }
    if (config.session?.maxSessions !== undefined) {
      sessionConfig.maxActiveSessions = config.session.maxSessions
    }
    if (config.session?.persistencePath !== undefined) {
      sessionConfig.persistencePath = config.session.persistencePath
    }
    if (config.session?.persistenceInterval !== undefined) {
      sessionConfig.persistenceInterval = config.session.persistenceInterval
    }

    const sessionService = new SessionService(
      sessionStore,
      logger,
      sessionConfig
    )

    logger.info({
      storeType: storeConfig.type,
      maxSessions: config.session?.maxSessions || 1000,
    }, 'Session service initialized')

    // Create workflow manager for tracking executions
    const workflowManager = new WorkflowManager(logger)

    // Create workflow orchestrator
    const workflowOrchestrator = new WorkflowOrchestrator(
      sessionService,
      progressEmitter,
      logger
    )

    return {
      sessionService,
      workflowOrchestrator,
      workflowManager
    }
  }

  static async cleanup(services: SessionServices, logger: Logger): Promise<void> {
    const cleanupTasks: Promise<void>[] = []

    // Shutdown session service
    if (services.sessionService) {
      cleanupTasks.push(
        services.sessionService.shutdown()
          .catch((err: Error) => logger.error({ error: err }, 'Failed to shutdown session service'))
      )
    }

    // Shutdown workflow manager
    if (services.workflowManager) {
      cleanupTasks.push(
        Promise.resolve(services.workflowManager.shutdown())
          .catch((err: Error) => logger.error({ error: err }, 'Failed to shutdown workflow manager'))
      )
    }

    await Promise.all(cleanupTasks)
    logger.info('Session services cleaned up')
  }

  static async getHealthStatus(services: SessionServices): Promise<Record<string, any>> {
    let metrics
    if (services.sessionService) {
      try {
        metrics = await services.sessionService.getSessionMetrics()
      } catch (error) {
        // Metrics retrieval failed, but don't fail the health check
      }
    }
    return metrics || {}
  }
}