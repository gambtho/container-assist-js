/**
 * Prepare Cluster Tool - Flat Architecture
 *
 * Prepares and validates Kubernetes cluster for deployment
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../../lib/session';
import type { ExtendedToolContext } from '../shared-types';
import { createKubernetesClient } from '../../lib/kubernetes';
import { createTimer, type Logger } from '../../lib/logger';
import { Success, Failure, type Result, type WorkflowState } from '../../domain/types';

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

interface K8sClientAdapter {
  ping(): Promise<boolean>;
  namespaceExists(namespace: string): Promise<boolean>;
  applyManifest(
    manifest: Record<string, unknown>,
    namespace?: string,
  ): Promise<{ success: boolean; error?: string }>;
  checkIngressController(): Promise<boolean>;
  checkPermissions(namespace: string): Promise<boolean>;
}

function createK8sClientAdapter(
  k8sClient: ReturnType<typeof createKubernetesClient>,
): K8sClientAdapter {
  return {
    ping: () => k8sClient.ping(),
    namespaceExists: (namespace: string) => k8sClient.namespaceExists(namespace),
    applyManifest: async (manifest: Record<string, unknown>, namespace?: string) => {
      const result = await k8sClient.applyManifest(manifest, namespace);
      if (result.ok) {
        return { success: true };
      } else {
        return { success: false, error: result.error };
      }
    },
    checkIngressController: () => k8sClient.checkIngressController(),
    checkPermissions: (namespace: string) => k8sClient.checkPermissions(namespace),
  };
}

/**
 * Check cluster connectivity
 */
async function checkConnectivity(k8sClient: K8sClientAdapter, logger: Logger): Promise<boolean> {
  try {
    const connected = await k8sClient.ping();
    logger.debug({ connected }, 'Cluster connectivity check');
    return connected;
  } catch (error) {
    logger.warn({ error }, 'Cluster connectivity check failed');
    return false;
  }
}

/**
 * Check namespace exists
 */
async function checkNamespace(
  k8sClient: K8sClientAdapter,
  namespace: string,
  logger: Logger,
): Promise<boolean> {
  try {
    const exists = await k8sClient.namespaceExists(namespace);
    logger.debug({ namespace, exists }, 'Checking namespace');
    return exists;
  } catch (error) {
    logger.warn({ namespace, error }, 'Namespace check failed');
    return false;
  }
}

/**
 * Create namespace if needed
 */
async function createNamespace(
  k8sClient: K8sClientAdapter,
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

    const result = await k8sClient.applyManifest(namespaceManifest);
    if (result.success) {
      logger.info({ namespace }, 'Namespace created');
    } else {
      throw new Error(result.error || 'Failed to create namespace');
    }
  } catch (error) {
    logger.error({ namespace, error }, 'Failed to create namespace');
    throw error;
  }
}

/**
 * Setup RBAC if needed
 */
async function setupRbac(
  k8sClient: K8sClientAdapter,
  namespace: string,
  logger: Logger,
): Promise<void> {
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

    const result = await k8sClient.applyManifest(serviceAccount, namespace);
    if (result.success) {
      logger.info({ namespace }, 'RBAC configured');
    } else {
      logger.warn({ namespace, error: result.error }, 'RBAC setup failed');
    }
  } catch (error) {
    logger.warn({ namespace, error }, 'RBAC setup failed');
  }
}

/**
 * Check for ingress controller
 */
async function checkIngressController(
  k8sClient: K8sClientAdapter,
  logger: Logger,
): Promise<boolean> {
  try {
    const hasIngress = await k8sClient.checkIngressController();
    logger.debug({ hasIngress }, 'Checking for ingress controller');
    return hasIngress;
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
  context?: ExtendedToolContext,
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
    const sessionManager =
      (context && 'sessionManager' in context && context.sessionManager) ||
      createSessionManager(logger);
    const k8sClientRaw = createKubernetesClient(logger);
    const k8sClient = createK8sClientAdapter(k8sClientRaw);

    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
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

    // 2. Check permissions
    checks.permissions = await k8sClient.checkPermissions(namespace);
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
    const sessionState = session;
    const updatedWorkflowState: WorkflowState = {
      ...sessionState,
      completed_steps: [...(sessionState.completed_steps || []), 'prepare-cluster'],
      errors: sessionState.errors || {},
      metadata: {
        ...(sessionState.metadata || {}),
        cluster_preparation: {
          cluster,
          namespace,
          clusterReady,
          checks,
          warnings,
        },
        cluster_result: {
          cluster_name: cluster,
          context: cluster,
          kubernetes_version: '1.28',
          namespaces_created: checks.namespaceExists ? [] : [namespace],
        },
      },
    };

    await sessionManager.update(sessionId, updatedWorkflowState);

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
 * Prepare cluster tool instance
 */
export const prepareClusterTool = {
  name: 'prepare-cluster',
  execute: (config: PrepareClusterConfig, logger: Logger) => prepareCluster(config, logger),
};
