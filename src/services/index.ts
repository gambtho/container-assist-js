/**
 * Services Index - Simplified service initialization
 * Replaces complex factory pattern with simple functions
 */

import type { Logger } from 'pino';
import { createDockerService, type DockerServiceConfig } from './docker';
import { createKubernetesService, type KubernetesConfig } from './kubernetes';
import { type AIConfig } from './ai';
import {
  createEnhancedAIService,
  type EnhancedAIConfig
} from '../infrastructure/enhanced-ai-service';
import { SessionService, type SessionServiceConfig } from '../application/session/manager';
import { InMemorySessionStore } from '../runtime/persistence/memory-store';
import { EventEmitter } from 'events';
import { ProgressChannel } from '../runtime/messaging/progress-channel';
import type { MCPSampler } from '../application/interfaces';

export interface ServicesConfig {
  docker?: DockerServiceConfig;
  kubernetes?: KubernetesConfig;
  ai?: EnhancedAIConfig;
  session?: SessionServiceConfig;
}

export interface Services {
  docker: Awaited<ReturnType<typeof createDockerService>>;
  kubernetes: Awaited<ReturnType<typeof createKubernetesService>>;
  ai: ReturnType<typeof createEnhancedAIService>;
  session: SessionService;
  events: EventEmitter;
  progress: ProgressChannel;
}

/**
 * Initialize all services with simple, direct approach
 * No factory classes, just a straightforward async function
 */
export async function initializeServices(
  config: ServicesConfig,
  logger: Logger,
  sampler?: MCPSampler
): Promise<Services> {
  logger.info('Initializing services...');

  // Create shared event infrastructure
  const events = new EventEmitter();
  const progress = new ProgressChannel(events, logger);

  // Initialize services in parallel where possible
  const [docker, kubernetes] = await Promise.all([
    createDockerService(config.docker ?? {}, logger),
    createKubernetesService(config.kubernetes ?? {}, logger)
  ]);

  // Create application SessionService with memory store
  const sessionStore = new InMemorySessionStore(logger);
  const session = new SessionService(sessionStore, logger, config.session);

  // Use enhanced AI service with optimization features
  const ai = createEnhancedAIService(config.ai ?? {}, sampler, logger);

  logger.info(
    {
      docker: true,
      kubernetes: true,
      ai: ai.isAvailable(),
      session: true
    },
    'Services initialized'
  );

  return {
    docker,
    kubernetes,
    ai,
    session,
    events,
    progress
  };
}

/**
 * Cleanup all services
 */
export async function cleanupServices(services: Services, logger: Logger): Promise<void> {
  logger.info('Cleaning up services...');

  try {
    await Promise.all([
      services.docker.close(),
      services.kubernetes.close(),
      services.session.close()
    ]);

    // Clean up event emitters
    services.events.removeAllListeners();

    logger.info('Services cleanup completed');
  } catch (error) {
    logger.error({ error }, 'Services cleanup failed');
  }
}

// Re-export service types for convenience
export { DockerService } from './docker';
export { KubernetesService } from './kubernetes';
export { AIService } from './ai';
export { EnhancedAIService } from '../infrastructure/enhanced-ai-service';
export { SessionService } from './session';

// Re-export config types
export type { DockerServiceConfig, KubernetesConfig, AIConfig, EnhancedAIConfig };
