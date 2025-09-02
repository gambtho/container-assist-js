/**
 * Infrastructure Service Factory - Handles creation of infrastructure services
 */

import type { Logger } from '../../domain/types/index.js'
import type { 
  DockerClient, 
  RepositoryAnalyzer, 
  ProgressEmitter, 
  EventPublisher,
  MCPSampler
} from '../interfaces.js'
import type { ApplicationConfig } from '../../config/index.js'

export interface InfrastructureServices {
  eventPublisher: EventPublisher
  progressEmitter: ProgressEmitter
  dockerClient: DockerClient
  repositoryAnalyzer?: RepositoryAnalyzer
}

export class InfrastructureServiceFactory {
  static async create(
    config: ApplicationConfig,
    logger: Logger,
    mcpSampler?: MCPSampler
  ): Promise<InfrastructureServices> {
    
    // Create event publisher
    const { EventPublisher } = await import('../../infrastructure/core/messaging/publisher.js')
    const eventPublisher = new EventPublisher(logger)

    // Create progress emitter
    const { ProgressEmitter } = await import('../../infrastructure/core/messaging/progress.js')
    const progressEmitter = new ProgressEmitter(logger)

    // Create Docker integration
    const { createDockerIntegration } = await import('../../infrastructure/external/docker/integration.js')
    const dockerClient = createDockerIntegration(
      config.infrastructure?.docker || {},
      logger,
      eventPublisher
    )

    // Initialize Docker integration
    const dockerInit = await dockerClient.initialize()
    if (dockerInit.success) {
      logger.info('Docker integration initialized successfully')
    } else {
      logger.warn({
        error: dockerInit.error?.message
      }, 'Docker integration initialization failed')
    }

    // Create repository analyzer if AI is available
    let repositoryAnalyzer: RepositoryAnalyzer | undefined
    if (mcpSampler) {
      const { UniversalRepositoryAnalyzer } = await import('../../infrastructure/ai/repository-analyzer.js')
      repositoryAnalyzer = new UniversalRepositoryAnalyzer(mcpSampler, logger)
      logger.info('Repository analyzer initialized with AI capabilities')
    } else {
      logger.warn('Repository analyzer requires MCP sampler - analysis features may be limited')
    }

    return {
      eventPublisher,
      progressEmitter,
      dockerClient,
      repositoryAnalyzer
    }
  }

  static async cleanup(services: InfrastructureServices, logger: Logger): Promise<void> {
    const cleanupTasks: Promise<void>[] = []

    // Close Docker client
    if (services.dockerClient) {
      cleanupTasks.push(
        services.dockerClient.close()
          .catch((err: Error) => logger.error({ error: err }, 'Failed to close Docker client'))
      )
    }

    // Shutdown progress emitter
    if (services.progressEmitter) {
      cleanupTasks.push(
        Promise.resolve(services.progressEmitter.shutdown())
          .catch((err: Error) => logger.error({ error: err }, 'Failed to shutdown progress emitter'))
      )
    }

    await Promise.all(cleanupTasks)
    logger.info('Infrastructure services cleaned up')
  }
}