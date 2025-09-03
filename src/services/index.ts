/**
 * Services Index - Simplified service initialization
 * Replaces complex factory pattern with simple functions
 */

import type { Logger } from 'pino';
import { createDockerService, type DockerServiceConfig } from './docker';
import { createKubernetesService, type KubernetesConfig } from './kubernetes';
import { type AIConfig, AIService, createAIService } from './ai';
import { createSessionService, SessionService } from './session.js';
import { EventEmitter } from 'events';
import type { MCPSampler } from '../application/interfaces.js';

export interface ServicesConfig {
  docker?: DockerServiceConfig;
  kubernetes?: KubernetesConfig;
  ai?: AIConfig;
  session?: { ttl?: number };
}

export interface Services {
  docker: Awaited<ReturnType<typeof createDockerService>>;
  kubernetes: Awaited<ReturnType<typeof createKubernetesService>>;
  ai: AIService;
  session: SessionService;
  events: EventEmitter;
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

  // Initialize services in parallel where possible
  const [docker, kubernetes, session] = await Promise.all([
    createDockerService(config.docker ?? {}, logger),
    createKubernetesService(config.kubernetes ?? {}, logger),
    createSessionService(config.session ?? {}, logger)
  ]);

  // Create AI service
  const ai = createAIService(config.ai ?? {}, sampler, logger);

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
    events
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
export { SessionService } from './session';

// Re-export config types
export type { DockerServiceConfig, KubernetesConfig, AIConfig };
