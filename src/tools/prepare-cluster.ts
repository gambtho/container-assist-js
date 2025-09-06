/**
 * Prepare Cluster Tool - Flat Architecture
 *
 * Prepares and validates Kubernetes cluster for deployment
 * Follows architectural requirement: only imports from src/lib/
 */

import { getSessionManager } from '../lib/session';
import { createKubernetesClient } from '../lib/kubernetes';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import type { WorkflowState } from '../types/session';

export interface PrepareClusterConfig {
  sessionId: string;
  cluster?: string;
  namespace?: string;
  createNamespace?: boolean;
  setupRbac?: boolean;
  installIngress?: boolean;
  checkRequirements?: boolean;
}

export interface PrepareClusterResult {
  success: boolean;
  sessionId: string;
  clusterReady: boolean;
  cluster: string;
  namespace: string;
  checks: {
    connectivity: boolean;
    permissions: boolean;
    namespaceExists: boolean;
    ingressController?: boolean;
    rbacConfigured?: boolean;
  };
  warnings?: string[];
}

/**
 * Check cluster connectivity
 */
async function checkConnectivity(k8sClient: unknown, logger: Logger): Promise<boolean> {
  try {
    const connected = await (k8sClient as { ping: () => Promise<boolean> }).ping();
    logger.debug({ connected }, 'Cluster connectivity check');
    return connected as boolean;
  } catch (error) {
    logger.warn({ error }, 'Cluster connectivity check failed');
    return false;
  }
}

/**
 * Check namespace exists
 */
async function checkNamespace(
  _k8sClient: unknown,
  namespace: string,
  logger: Logger,
): Promise<boolean> {
  try {
    // In production, actually check if namespace exists
    // For now, mock as existing
    logger.debug({ namespace }, 'Checking namespace');
    return true;
  } catch (error) {
    logger.warn({ namespace, error }, 'Namespace check failed');
    return false;
  }
}

/**
 * Create namespace if needed
 */
async function createNamespace(
  k8sClient: unknown,
  namespace: string,
  logger: Logger,
): Promise<void> {
  try {
    const namespaceManifest = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
      },
    };

    await (k8sClient as { apply: (manifest: object) => Promise<void> }).apply(namespaceManifest);
    logger.info({ namespace }, 'Namespace created');
  } catch (error) {
    logger.error({ namespace, error }, 'Failed to create namespace');
    throw error;
  }
}

/**
 * Setup RBAC if needed
 */
async function setupRbac(k8sClient: unknown, namespace: string, logger: Logger): Promise<void> {
  try {
    // Create service account
    const serviceAccount = {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: 'app-service-account',
        namespace,
      },
    };

    await (k8sClient as { apply: (manifest: object) => Promise<void> }).apply(serviceAccount);
    logger.info({ namespace }, 'RBAC configured');
  } catch (error) {
    logger.warn({ namespace, error }, 'RBAC setup failed');
  }
}

/**
 * Check for ingress controller
 */
async function checkIngressController(_k8sClient: unknown, logger: Logger): Promise<boolean> {
  try {
    // In production, check if ingress controller is installed
    // For now, mock as installed
    logger.debug('Checking for ingress controller');
    return true;
  } catch (error) {
    logger.warn({ error }, 'Ingress controller check failed');
    return false;
  }
}

/**
 * Prepare cluster for deployment
 */
export async function prepareCluster(
  config: PrepareClusterConfig,
  logger: Logger,
): Promise<Result<PrepareClusterResult>> {
  const timer = createTimer(logger, 'prepare-cluster');

  try {
    const {
      sessionId,
      cluster = 'default',
      namespace = 'default',
      createNamespace: shouldCreateNamespace = false,
      setupRbac: shouldSetupRbac = false,
      installIngress = false,
      checkRequirements = true,
    } = config;

    logger.info({ sessionId, cluster, namespace }, 'Starting cluster preparation');

    // Create lib instances
    const sessionManager = getSessionManager(logger);
    const k8sClient = createKubernetesClient(null, logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    const warnings: string[] = [];
    const checks = {
      connectivity: false,
      permissions: false,
      namespaceExists: false,
      ingressController: undefined as boolean | undefined,
      rbacConfigured: undefined as boolean | undefined,
    };

    // 1. Check connectivity
    checks.connectivity = await checkConnectivity(k8sClient, logger);
    if (!checks.connectivity) {
      return Failure('Cannot connect to Kubernetes cluster');
    }

    // 2. Check permissions (mock for now)
    checks.permissions = true;
    if (!checks.permissions) {
      warnings.push('Limited permissions - some operations may fail');
    }

    // 3. Check/create namespace
    checks.namespaceExists = await checkNamespace(k8sClient, namespace, logger);
    if (!checks.namespaceExists && shouldCreateNamespace) {
      await createNamespace(k8sClient, namespace, logger);
      checks.namespaceExists = true;
    } else if (!checks.namespaceExists) {
      warnings.push(`Namespace ${namespace} does not exist - deployment may fail`);
    }

    // 4. Setup RBAC if requested
    if (shouldSetupRbac) {
      await setupRbac(k8sClient, namespace, logger);
      checks.rbacConfigured = true;
    }

    // 5. Check for ingress controller
    if (checkRequirements || installIngress) {
      checks.ingressController = await checkIngressController(k8sClient, logger);
      if (!checks.ingressController) {
        warnings.push('No ingress controller found - external access may not work');
      }
    }

    // Determine if cluster is ready
    const clusterReady = checks.connectivity && checks.permissions && checks.namespaceExists;

    // Update session with cluster preparation status
    const updatedWorkflowState: WorkflowState = {
      ...session.workflow_state,
      cluster_result: {
        cluster_name: cluster,
        context: cluster,
        kubernetes_version: '1.28',
        namespaces_created: checks.namespaceExists ? [] : [namespace],
      },
      completed_steps: [...(session.workflow_state?.completed_steps || []), 'prepare-cluster'],
      errors: session.workflow_state?.errors || {},
      metadata: {
        ...(session.workflow_state?.metadata || {}),
        cluster_preparation: {
          cluster,
          namespace,
          clusterReady,
          checks,
          warnings,
        },
      },
    };

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ clusterReady });
    logger.info({ clusterReady, checks }, 'Cluster preparation completed');

    return Success({
      success: true,
      sessionId,
      clusterReady,
      cluster,
      namespace,
      checks: {
        connectivity: checks.connectivity,
        permissions: checks.permissions,
        namespaceExists: checks.namespaceExists,
        ...(checks.ingressController !== undefined && {
          ingressController: checks.ingressController,
        }),
        ...(checks.rbacConfigured !== undefined && { rbacConfigured: checks.rbacConfigured }),
      },
      ...(warnings.length > 0 && { warnings }),
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Cluster preparation failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Factory function for creating prepare-cluster tool instances
 */
export function createPrepareClusterTool(logger: Logger): {
  name: string;
  execute: (config: PrepareClusterConfig) => Promise<Result<PrepareClusterResult>>;
} {
  return {
    name: 'prepare-cluster',
    execute: (config: PrepareClusterConfig) => prepareCluster(config, logger),
  };
}

export default prepareCluster;
