/**
 * Configuration Mapper - Maps application configuration to service configurations
 * Ensures proper configuration of all service components including security scanning
 */

import type { ApplicationConfig } from '../config/types';
import type { ServicesConfig } from './index';
import type { DockerServiceConfig } from './docker';
import type { KubernetesConfig } from './kubernetes';
import type { AIConfig } from './ai';

/**
 * Build services configuration from application configuration
 */
export function buildServicesConfig(appConfig: ApplicationConfig): ServicesConfig {
  const dockerConfig: DockerServiceConfig = {};

  // Only add properties if they have defined values
  if (appConfig.infrastructure.docker.socketPath !== undefined) {
    dockerConfig.socketPath = appConfig.infrastructure.docker.socketPath;
  }

  if (appConfig.infrastructure.docker.host !== undefined) {
    dockerConfig.host = appConfig.infrastructure.docker.host;
  }

  if (appConfig.infrastructure.docker.port !== undefined) {
    dockerConfig.port = appConfig.infrastructure.docker.port;
  }

  // Include Trivy configuration when scanning is enabled
  if (appConfig.infrastructure.scanning.enabled) {
    dockerConfig.trivy = {
      scannerPath: 'trivy', // Could be made configurable
      cacheDir: '/tmp/trivy-cache',
      timeout: appConfig.infrastructure.scanning.timeout ?? 300000,
    };
  }

  const kubernetesConfig: KubernetesConfig = {
    kubeconfig: appConfig.infrastructure.kubernetes.kubeconfig,
    namespace: appConfig.infrastructure.kubernetes.namespace,
  };

  if (appConfig.infrastructure.kubernetes.context !== undefined) {
    kubernetesConfig.context = appConfig.infrastructure.kubernetes.context;
  }

  const aiConfig: AIConfig = {
    modelPreferences: {
      default: appConfig.aiServices.ai.model,
    },
  };

  if (appConfig.aiServices.ai.temperature !== undefined) {
    aiConfig.temperature = appConfig.aiServices.ai.temperature;
  }

  if (appConfig.aiServices.ai.maxTokens !== undefined) {
    aiConfig.maxTokens = appConfig.aiServices.ai.maxTokens;
  }

  return {
    docker: dockerConfig,
    kubernetes: kubernetesConfig,
    ai: aiConfig,
    session: {
      ttl:
        appConfig.mcp.sessionTTL != null && appConfig.mcp.sessionTTL !== ''
          ? parseTTL(appConfig.mcp.sessionTTL)
          : 3600000,
    },
  };
}

/**
 * Parse TTL string to milliseconds
 */
function parseTTL(ttl: string): number {
  const match = ttl.match(/^(\d+)(h|m|s)$/);
  if (!match) {
    return 3600000; // Default to 1 hour
  }
  const [, value, unit] = match;
  if (!value) {
    return 3600000; // Default to 1 hour if no value found
  }
  const num = parseInt(value, 10);
  switch (unit) {
    case 'h':
      return num * 3600000;
    case 'm':
      return num * 60000;
    case 's':
      return num * 1000;
    default:
      return 3600000;
  }
}
