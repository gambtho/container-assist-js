/**
 * Verify Deployment Tool - Flat Architecture
 *
 * Verifies Kubernetes deployment health and retrieves endpoints
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '@lib/session';
import { createKubernetesClient } from '@lib/kubernetes';
import { createTimer, type Logger } from '@lib/logger';
import { Success, Failure, type Result } from '@types';
import { DEFAULT_TIMEOUTS } from '@config/defaults';

export interface VerifyDeploymentConfig {
  sessionId: string;
  namespace?: string;
  deploymentName?: string;
  timeout?: number;
  healthcheckUrl?: string;
}

export interface VerifyDeploymentResult {
  success: boolean;
  sessionId: string;
  namespace: string;
  deploymentName: string;
  serviceName: string;
  endpoints: Array<{
    type: 'internal' | 'external';
    url: string;
    port: number;
    healthy?: boolean;
  }>;
  ready: boolean;
  replicas: number;
  status: {
    readyReplicas: number;
    totalReplicas: number;
    conditions: Array<{
      type: string;
      status: string;
      message: string;
    }>;
  };
  healthCheck?: {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message: string;
    checks?: Array<{
      name: string;
      status: 'pass' | 'fail';
      message?: string;
    }>;
  };
}

/**
 * Check deployment health
 */
async function checkDeploymentHealth(
  k8sClient: any,
  namespace: string,
  deploymentName: string,
  timeout: number,
): Promise<{
  ready: boolean;
  readyReplicas: number;
  totalReplicas: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  message: string;
}> {
  const startTime = Date.now();
  const pollInterval = DEFAULT_TIMEOUTS.healthCheck || 5000;

  while (Date.now() - startTime < timeout * 1000) {
    const statusResult = await k8sClient.getDeploymentStatus(namespace, deploymentName);

    if (statusResult.ok && statusResult.value?.ready) {
      return {
        ready: true,
        readyReplicas: statusResult.value.readyReplicas ?? 0,
        totalReplicas: statusResult.value.totalReplicas ?? 0,
        status: 'healthy',
        message: 'Deployment is healthy and ready',
      };
    }

    // Wait before checking again using configured interval
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    ready: false,
    readyReplicas: 0,
    totalReplicas: 1,
    status: 'unhealthy',
    message: 'Deployment health check timed out',
  };
}

/**
 * Check endpoint health
 */
async function checkEndpointHealth(url: string): Promise<boolean> {
  try {
    // Make HTTP health check request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUTS.healthCheck || 5000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'containerization-assist-health-check',
        },
      });

      clearTimeout(timeoutId);

      // Consider 2xx and 3xx responses as healthy
      return response.ok || (response.status >= 300 && response.status < 400);
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);

      // If it's an abort error, the request timed out
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return false;
      }

      // For other errors (network issues, etc.), consider unhealthy
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Verify deployment
 */
export async function verifyDeployment(
  config: VerifyDeploymentConfig,
  logger: Logger,
): Promise<Result<VerifyDeploymentResult>> {
  const timer = createTimer(logger, 'verify-deployment');

  try {
    const {
      sessionId,
      namespace: configNamespace,
      deploymentName: configDeploymentName,
      timeout = 60,
      healthcheckUrl,
    } = config;

    logger.info({ sessionId }, 'Starting deployment verification');

    // Create lib instances
    const sessionManager = createSessionManager(logger);
    const k8sClient = createKubernetesClient(logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get deployment info from session or config
    const deploymentResult = (session.workflow_state as { deployment_result?: unknown })
      ?.deployment_result as
      | {
          namespace?: string;
          deploymentName?: string;
          serviceName?: string;
          endpoints?: Array<{
            type: 'internal' | 'external';
            url: string;
            port: number;
            healthy?: boolean;
          }>;
        }
      | undefined;
    if (!deploymentResult && !configDeploymentName) {
      return Failure('No deployment found - run deploy_application first');
    }

    const namespace = configNamespace ?? deploymentResult?.namespace ?? 'default';
    const deploymentName = configDeploymentName ?? deploymentResult?.deploymentName ?? 'app';
    const serviceName = deploymentResult?.serviceName ?? deploymentName;
    const endpoints = deploymentResult?.endpoints ?? [];

    logger.info({ namespace, deploymentName }, 'Checking deployment health');

    // Check deployment health
    const health = await checkDeploymentHealth(k8sClient, namespace, deploymentName, timeout);

    // Check endpoint health if provided
    const healthChecks: Array<{ name: string; status: 'pass' | 'fail'; message?: string }> = [];

    if (healthcheckUrl) {
      const isHealthy = await checkEndpointHealth(healthcheckUrl);
      healthChecks.push({
        name: 'endpoint',
        status: isHealthy ? 'pass' : 'fail',
        message: isHealthy ? 'Endpoint is reachable' : 'Endpoint is not reachable',
      });
    }

    // Check each endpoint
    for (const endpoint of endpoints) {
      if (endpoint.type === 'external') {
        const isHealthy = await checkEndpointHealth(endpoint.url);
        endpoint.healthy = isHealthy;
        healthChecks.push({
          name: `${endpoint.type}-endpoint`,
          status: isHealthy ? 'pass' : 'fail',
          message: `${endpoint.url}:${endpoint.port}`,
        });
      }
    }

    // Determine overall health status
    const allHealthy = healthChecks.every((check) => check.status === 'pass');
    const overallStatus =
      health.ready && (healthChecks.length === 0 || allHealthy)
        ? 'healthy'
        : health.ready
          ? 'unhealthy'
          : 'unknown';

    // Update session with verification results
    const sessionState = (session as any).workflow_state || {};
    const updatedWorkflowState = {
      sessionId: session.sessionId,
      createdAt: session.createdAt || new Date(),
      updatedAt: new Date(),
      ...sessionState,
      completed_steps: [...(sessionState.completed_steps || []), 'verify-deployment'],
      metadata: {
        ...(sessionState.metadata || {}),
        verification_result: {
          namespace,
          deploymentName,
          serviceName,
          endpoints,
          ready: health.ready,
          status: {
            readyReplicas: health.readyReplicas,
            totalReplicas: health.totalReplicas,
            conditions: [
              {
                type: 'Available',
                status: health.ready ? 'True' : 'False',
                message: health.message,
              },
            ],
          },
          healthCheck: {
            status: overallStatus,
            message: health.message,
            checks: healthChecks,
          },
        },
      },
    };

    await sessionManager.update(sessionId, updatedWorkflowState);

    timer.end({ deploymentName, ready: health.ready });
    logger.info(
      {
        deploymentName,
        ready: health.ready,
        healthStatus: overallStatus,
      },
      'Deployment verification completed',
    );

    const result: VerifyDeploymentResult = {
      success: true,
      sessionId,
      namespace,
      deploymentName,
      serviceName,
      endpoints: endpoints as Array<{
        type: 'internal' | 'external';
        url: string;
        port: number;
        healthy?: boolean;
      }>,
      ready: health.ready,
      replicas: health.totalReplicas,
      status: {
        readyReplicas: health.readyReplicas,
        totalReplicas: health.totalReplicas,
        conditions: [
          {
            type: 'Available',
            status: health.ready ? 'True' : 'False',
            message: health.message,
          },
        ],
      },
      healthCheck: {
        status: overallStatus,
        message: health.message,
        ...(healthChecks.length > 0 && { checks: healthChecks }),
      },
    };

    return Success(result);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Deployment verification failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Verify deployment tool instance
 */
export const verifyDeploymentTool = {
  name: 'verify-deployment',
  execute: (config: VerifyDeploymentConfig, logger: Logger) => verifyDeployment(config, logger),
};
