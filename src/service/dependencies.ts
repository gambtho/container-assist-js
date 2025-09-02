/**
 * Simplified Dependency injection container for the MCP server
 * Now focuses on coordination between focused service factories
 */

import type { Logger } from '../domain/types/index.js'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { ApplicationConfig } from '../config/index.js'
import { 
  AIServiceFactory, 
  InfrastructureServiceFactory, 
  SessionServiceFactory,
  type AIServices,
  type InfrastructureServices, 
  type SessionServices 
} from './factories/index.js'


export class Dependencies {
  // Core configuration - now uses ApplicationConfig
  public readonly config: ApplicationConfig
  public readonly logger: Logger
  public readonly mcpServer?: Server

  // Service groups - delegated to factories
  private aiServices?: AIServices
  private infrastructureServices?: InfrastructureServices
  private sessionServices?: SessionServices

  // State
  private initialized = false

  constructor({
    config,
    logger,
    mcpServer,
  }: {
    config: ApplicationConfig;
    logger: Logger
    mcpServer?: Server
  }) {
    this.config = config
    this.logger = logger
    this.mcpServer = mcpServer
  }

  // Convenience getters for backward compatibility
  get sessionService() { return this.sessionServices?.sessionService!; }
  get workflowOrchestrator() { return this.sessionServices?.workflowOrchestrator!; }
  get workflowManager() { return this.sessionServices?.workflowManager!; }
  get progressEmitter() { return this.infrastructureServices?.progressEmitter!; }
  get dockerClient() { return this.infrastructureServices?.dockerClient!; }
  get repositoryAnalyzer() { return this.infrastructureServices?.repositoryAnalyzer; }
  get eventPublisher() { return this.infrastructureServices?.eventPublisher!; }
  get mcpSampler() { return this.aiServices?.mcpSampler; }
  get structuredSampler() { return this.aiServices?.structuredSampler; }
  get contentValidator() { return this.aiServices?.contentValidator; }

  /**
   * Initialize all dependencies using focused service factories
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('Dependencies already initialized')
    }

    this.logger.info('Initializing dependencies with service factories')

    try {
      // Step 1: Initialize AI services first (since other services may depend on them)
      this.aiServices = await AIServiceFactory.create(this.config, this.logger, this.mcpServer)
      
      // Step 2: Initialize infrastructure services (may use AI services)
      this.infrastructureServices = await InfrastructureServiceFactory.create(
        this.config, 
        this.logger, 
        this.aiServices.mcpSampler
      )

      // Step 3: Initialize session and workflow services
      this.sessionServices = await SessionServiceFactory.create(
        this.config,
        this.logger,
        this.infrastructureServices.progressEmitter
      )

      this.initialized = true
      this.logger.info('All service factories initialized successfully')

    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize service factories')
      throw error
    }
  }

  /**
   * Clean up all dependencies using service factory cleanup methods
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up dependencies')

    const cleanupTasks: Promise<void>[] = []

    // Cleanup session services
    if (this.sessionServices) {
      cleanupTasks.push(
        SessionServiceFactory.cleanup(this.sessionServices, this.logger)
      )
    }

    // Cleanup infrastructure services
    if (this.infrastructureServices) {
      cleanupTasks.push(
        InfrastructureServiceFactory.cleanup(this.infrastructureServices, this.logger)
      )
    }

    // AI services don't need explicit cleanup currently
    // but we could add it later if needed

    await Promise.all(cleanupTasks)

    // Clear service references
    this.aiServices = undefined
    this.infrastructureServices = undefined
    this.sessionServices = undefined
    this.initialized = false
    
    this.logger.info('All service factories cleaned up')
  }

  /**
   * Validate that all required service factories are initialized
   */
  validate(): void {
    if (!this.initialized) {
      throw new Error('Dependencies not initialized')
    }

    if (!this.sessionServices) {
      throw new Error('Session services not initialized')
    }

    if (!this.infrastructureServices) {
      throw new Error('Infrastructure services not initialized')
    }

    // AI services are optional
    if (!this.aiServices && !this.config.features?.mockMode) {
      this.logger.warn('No AI services available - AI features will not work')
    }
  }

  /**
   * Get health status from all service factories
   */
  async getHealth(): Promise<{
    healthy: boolean
    services: Record<string, boolean>
    metrics?: Record<string, any>
  }> {
    const services: Record<string, boolean> = {
      aiServices: !!this.aiServices,
      infrastructureServices: !!this.infrastructureServices,
      sessionServices: !!this.sessionServices,
      // Individual service health
      sessionService: !!this.sessionServices?.sessionService,
      workflowOrchestrator: !!this.sessionServices?.workflowOrchestrator,
      workflowManager: !!this.sessionServices?.workflowManager,
      progressEmitter: !!this.infrastructureServices?.progressEmitter,
      dockerClient: !!this.infrastructureServices?.dockerClient,
      repositoryAnalyzer: !!this.infrastructureServices?.repositoryAnalyzer,
      eventPublisher: !!this.infrastructureServices?.eventPublisher,
      mcpSampler: !!this.aiServices?.mcpSampler,
      structuredSampler: !!this.aiServices?.structuredSampler,
      contentValidator: !!this.aiServices?.contentValidator,
    }

    // Get metrics from session services
    let metrics
    if (this.sessionServices) {
      try {
        metrics = await SessionServiceFactory.getHealthStatus(this.sessionServices)
      } catch (error) {
        this.logger.error({ error }, 'Failed to get service health metrics')
      }
    }

    const healthy = this.initialized && !!this.sessionServices && !!this.infrastructureServices

    return {
      healthy,
      services,
      ...(metrics ? { metrics } : {})
    }
  }

  /**
   * Create a tool context with all required dependencies
   */
  createToolContext() {
    this.validate()

    return {
      sessionService: this.sessionService,
      workflowOrchestrator: this.workflowOrchestrator,
      workflowManager: this.workflowManager,
      progressEmitter: this.progressEmitter,
      dockerClient: this.dockerClient,
      kubernetesService: undefined,
      repositoryAnalyzer: this.repositoryAnalyzer,
      eventPublisher: this.eventPublisher,
      mcpSampler: this.mcpSampler,
      structuredSampler: this.structuredSampler,
      contentValidator: this.contentValidator,
      logger: this.logger,
      config: this.config,
    }
  }
}