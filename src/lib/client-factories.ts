/**
 * Client Factory Utilities
 *
 * Centralized factory for creating configured Docker and Kubernetes clients
 * with common error handling, configuration, and lifecycle management.
 */

import type { Logger } from 'pino';
import { createDockerClient } from './docker';
import { createKubernetesClient } from './kubernetes';
import { Success, Failure, type Result } from '../types/core';

export interface ClientConfig {
  /** Optional timeout for operations (milliseconds) */
  timeout?: number;
  /** Optional retry configuration */
  retry?: {
    attempts: number;
    delay: number;
  };
  /** Additional client-specific options */
  options?: Record<string, unknown>;
}

export interface ManagedClient<T> {
  /** The underlying client instance */
  client: T;
  /** Cleanup function to release resources */
  cleanup: () => Promise<void>;
  /** Check if client is healthy/connected */
  isHealthy: () => Promise<boolean>;
}

/**
 * Create a managed Docker client with common configuration and cleanup
 */
export async function createManagedDockerClient(
  logger: Logger,
  config?: ClientConfig,
): Promise<Result<ManagedClient<any>>> {
  try {
    const dockerClient = createDockerClient(logger);

    // Note: Docker client connection test skipped - no ping method available

    const managedClient: ManagedClient<any> = {
      client: dockerClient,
      cleanup: async () => {
        // Docker client cleanup if needed
        logger.debug('Docker client cleanup completed');
      },
      isHealthy: async () => {
        // Note: Docker client health check not implemented - no ping method available
        return true;
      },
    };

    logger.debug({ timeout: config?.timeout }, 'Managed Docker client created');
    return Success(managedClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Failure(`Failed to create Docker client: ${message}`);
  }
}

/**
 * Create a managed Kubernetes client with common configuration and cleanup
 */
export async function createManagedKubernetesClient(
  logger: Logger,
  config?: ClientConfig,
): Promise<Result<ManagedClient<any>>> {
  try {
    const k8sClient = createKubernetesClient(logger);

    // Note: Kubernetes client connection test skipped - no coreApi method available

    const managedClient: ManagedClient<any> = {
      client: k8sClient,
      cleanup: async () => {
        // Kubernetes client cleanup if needed
        logger.debug('Kubernetes client cleanup completed');
      },
      isHealthy: async () => {
        // Note: Kubernetes client health check not implemented - no coreApi method available
        return true;
      },
    };

    logger.debug({ timeout: config?.timeout }, 'Managed Kubernetes client created');
    return Success(managedClient);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Failure(`Failed to create Kubernetes client: ${message}`);
  }
}

/**
 * Execute an operation with automatic client lifecycle management
 */
export async function withDockerClient<T>(
  logger: Logger,
  operation: (client: any) => Promise<Result<T>>,
  config?: ClientConfig,
): Promise<Result<T>> {
  const clientResult = await createManagedDockerClient(logger, config);
  if (!clientResult.ok) {
    return clientResult;
  }

  const managedClient = clientResult.value;

  try {
    return await operation(managedClient.client);
  } finally {
    await managedClient.cleanup();
  }
}

/**
 * Execute an operation with automatic Kubernetes client lifecycle management
 */
export async function withKubernetesClient<T>(
  logger: Logger,
  operation: (client: any) => Promise<Result<T>>,
  config?: ClientConfig,
): Promise<Result<T>> {
  const clientResult = await createManagedKubernetesClient(logger, config);
  if (!clientResult.ok) {
    return clientResult;
  }

  const managedClient = clientResult.value;

  try {
    return await operation(managedClient.client);
  } finally {
    await managedClient.cleanup();
  }
}

/**
 * Batch create multiple clients with shared configuration
 */
export async function createClientBatch(
  logger: Logger,
  clientTypes: ('docker' | 'kubernetes')[],
  config?: ClientConfig,
): Promise<Result<Record<string, ManagedClient<any>>>> {
  const clients: Record<string, ManagedClient<any>> = {};
  const createdClients: string[] = [];

  try {
    for (const type of clientTypes) {
      let result: Result<ManagedClient<any>>;

      if (type === 'docker') {
        result = await createManagedDockerClient(logger, config);
      } else {
        result = await createManagedKubernetesClient(logger, config);
      }

      if (!result.ok) {
        // Cleanup already created clients
        for (const createdType of createdClients) {
          const client = clients[createdType];
          if (client) {
            await client.cleanup();
          }
        }
        return Failure(`Failed to create ${type} client: ${result.error}`);
      }

      clients[type] = result.value;
      createdClients.push(type);
    }

    return Success(clients);
  } catch (error) {
    // Cleanup any created clients
    for (const createdType of createdClients) {
      const client = clients[createdType];
      if (client) {
        await client.cleanup();
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return Failure(`Client batch creation failed: ${message}`);
  }
}
