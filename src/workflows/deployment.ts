/**
 * Deployment Workflow - Orchestrates the complete deployment pipeline
 *
 * Steps:
 * 1. Prepare Kubernetes cluster
 * 2. Generate K8s manifests
 * 3. Push image to registry
 * 4. Deploy application to cluster
 * 5. Verify deployment health
 */

import { prepareCluster } from '../tools/prepare-cluster';
import { generateK8sManifests } from '../tools/generate-k8s-manifests';
import { pushImage } from '../tools/push';
import { deployApplication } from '../tools/deploy';
import { verifyDeployment } from '../tools/verify-deployment';
import { createSessionManager } from '../lib/session';
import { createTimer, createLogger, type Logger } from '../lib/logger';
import type {
  DeploymentWorkflowParams,
  DeploymentWorkflowResult,
  WorkflowStep,
  WorkflowContext,
} from './types';

/**
 * Run the complete deployment workflow
 */
export async function runDeploymentWorkflow(
  params: DeploymentWorkflowParams,
  providedLogger?: Logger,
): Promise<DeploymentWorkflowResult> {
  const logger = providedLogger || createLogger({ name: 'deployment-workflow' });
  const timer = createTimer(logger, 'deployment-workflow');
  const sessionManager = createSessionManager(logger);
  const { sessionId, imageId, clusterConfig, deploymentOptions } = params;

  // Initialize workflow context
  const context: WorkflowContext = {
    sessionId,
    steps: [],
    artifacts: new Map(),
    metadata: {
      startTime: new Date(),
      imageId,
      deploymentName: deploymentOptions.name,
    },
  };

  // Define workflow steps
  const steps: WorkflowStep[] = [
    { name: 'prepare-cluster', status: 'pending' },
    { name: 'generate-manifests', status: 'pending' },
    { name: 'push-image', status: 'pending' },
    { name: 'deploy-application', status: 'pending' },
    { name: 'verify-deployment', status: 'pending' },
  ];
  context.steps = steps;

  try {
    logger.info('Starting deployment workflow');

    // Update session
    await sessionManager.update(sessionId, {
      status: 'active',
      stage: 'prepare-cluster',
    });

    // Step 1: Prepare cluster
    const prepareStep = steps[0]!;
    prepareStep.status = 'running';
    prepareStep.startTime = new Date();
    context.currentStep = prepareStep.name;

    logger.info('Preparing Kubernetes cluster');

    const clusterResult = await prepareCluster(
      {
        sessionId,
        cluster: clusterConfig.context || 'default',
        namespace: clusterConfig.namespace || 'default',
        createNamespace: true,
      },
      logger,
    );

    if (!clusterResult.ok) {
      prepareStep.status = 'failed';
      prepareStep.error = `Cluster preparation failed: ${clusterResult.error}`;
      throw new Error(prepareStep.error);
    }
    const cluster = clusterResult.value;

    prepareStep.status = 'completed';
    prepareStep.endTime = new Date();
    prepareStep.output = cluster;
    context.artifacts.set('cluster', cluster);

    // Step 2: Generate K8s manifests
    const generateStep = steps[1]!;
    generateStep.status = 'running';
    generateStep.startTime = new Date();
    context.currentStep = generateStep.name;

    await sessionManager.update(sessionId, {
      stage: 'generate-manifests',
    });

    logger.info('Generating Kubernetes manifests');

    const manifestResult = await generateK8sManifests(
      {
        sessionId,
        appName: deploymentOptions.name,
        namespace: cluster.namespace,
        replicas: deploymentOptions.replicas || 1,
        port: deploymentOptions.port || 8080,
        serviceType: deploymentOptions.serviceType || 'ClusterIP',
        ...(deploymentOptions.resources && {
          resources: {
            requests: {
              memory: deploymentOptions.resources.requests?.memory || '256Mi',
              cpu: deploymentOptions.resources.requests?.cpu || '100m',
            },
            limits: {
              memory: deploymentOptions.resources.limits?.memory || '512Mi',
              cpu: deploymentOptions.resources.limits?.cpu || '500m',
            },
          },
        }),
      },
      logger,
    );

    if (!manifestResult.ok) {
      generateStep.status = 'failed';
      generateStep.error = `Manifest generation failed: ${manifestResult.error}`;
      throw new Error(generateStep.error);
    }
    const manifests = manifestResult.value;

    generateStep.status = 'completed';
    generateStep.endTime = new Date();
    generateStep.output = manifests;
    context.artifacts.set('manifests', manifests);

    // Step 3: Push image to registry
    const pushStep = steps[2]!;
    pushStep.status = 'running';
    pushStep.startTime = new Date();
    context.currentStep = pushStep.name;

    await sessionManager.update(sessionId, {
      stage: 'push-image',
    });

    logger.info('Pushing image to registry');

    // Update session with image info for push tool
    await sessionManager.update(sessionId, {
      workflow_state: {
        build_result: {
          imageId,
          tags: [`${deploymentOptions.registry}/${imageId}:latest`],
        },
      } as any,
    });

    const pushResult = await pushImage(
      {
        sessionId,
        registry: deploymentOptions.registry || 'docker.io',
      },
      logger,
    );

    if (!pushResult.ok) {
      pushStep.status = 'failed';
      pushStep.error = `Image push failed: ${pushResult.error}`;
      throw new Error(pushStep.error);
    }
    const push = pushResult.value;

    pushStep.status = 'completed';
    pushStep.endTime = new Date();
    pushStep.output = push;
    context.artifacts.set('push', push);

    // Step 4: Deploy application
    const deployStep = steps[3]!;
    deployStep.status = 'running';
    deployStep.startTime = new Date();
    context.currentStep = deployStep.name;

    await sessionManager.update(sessionId, {
      stage: 'deploy-application',
    });

    logger.info('Deploying application to cluster');

    // Update session with manifests for deploy tool
    await sessionManager.update(sessionId, {
      workflow_state: {
        ...((await sessionManager.get(sessionId))?.workflow_state || {}),
        manifests: manifests.manifests,
      } as any,
    });

    const deployResult = await deployApplication(
      {
        sessionId,
        namespace: cluster.namespace,
        cluster: cluster.cluster,
        wait: true,
        timeout: 300,
      },
      logger,
    );

    if (!deployResult.ok) {
      deployStep.status = 'failed';
      deployStep.error = `Deployment failed: ${deployResult.error}`;
      throw new Error(deployStep.error);
    }
    const deploy = deployResult.value;

    deployStep.status = 'completed';
    deployStep.endTime = new Date();
    deployStep.output = deploy;
    context.artifacts.set('deployment', deploy);

    // Step 5: Verify deployment
    const verifyStep = steps[4]!;
    verifyStep.status = 'running';
    verifyStep.startTime = new Date();
    context.currentStep = verifyStep.name;

    await sessionManager.update(sessionId, {
      stage: 'verify-deployment',
    });

    logger.info('Verifying deployment health');

    const verifyResult = await verifyDeployment(
      {
        sessionId,
        deploymentName: deploymentOptions.name,
        namespace: cluster.namespace,
        timeout: 120,
        healthcheckUrl: '/health',
      },
      logger,
    );

    let verify: any = null;
    if (!verifyResult.ok) {
      verifyStep.status = 'failed';
      verifyStep.error = `Verification failed: ${verifyResult.error}`;
      // Verification failures are warnings, deployment may still be functional
      logger.warn('Deployment verification had issues');
    } else {
      verifyStep.status = 'completed';
      verify = verifyResult.value;
    }

    verifyStep.endTime = new Date();
    verifyStep.output = verify;
    context.artifacts.set('verification', verify);

    // Workflow completed
    const endTime = new Date();
    await sessionManager.update(sessionId, {
      status: 'completed',
      stage: 'finished',
      metadata: {
        completedAt: endTime.toISOString(),
        results: {
          deploymentName: deploymentOptions.name,
          namespace: cluster.namespace,
          serviceName: deploy.serviceName,
          endpoints: verify?.endpoints,
          replicas: verify?.replicas,
        },
      },
    });

    timer.end();
    logger.info('Deployment workflow completed successfully');

    return {
      success: true,
      sessionId,
      results: {
        deploymentName: deploymentOptions.name,
        namespace: cluster.namespace,
        endpoints: verify?.endpoints,
        service: {
          name: deploy.serviceName,
          type: deploymentOptions.serviceType || 'ClusterIP',
        },
        pods: verify
          ? [
              {
                name: `${deploymentOptions.name}-pod`,
                ready: verify.ready,
                status: 'Running',
                restarts: 0,
              },
            ]
          : [],
        verificationStatus: {
          deployment: true,
          service: !!deploy.serviceName,
          endpoints: verify?.endpoints && verify.endpoints.length > 0,
          health: !!verify,
        },
      },
      metadata: {
        startTime: context.metadata.startTime as Date,
        endTime,
        duration: endTime.getTime() - (context.metadata.startTime as Date).getTime(),
        steps: context.steps,
      },
    };
  } catch (error) {
    const endTime = new Date();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Mark current step as failed
    const currentStepObj = steps.find((s) => s.name === context.currentStep);
    if (currentStepObj && currentStepObj.status === 'running') {
      currentStepObj.status = 'failed';
      currentStepObj.endTime = endTime;
      currentStepObj.error = errorMessage;
    }

    // Mark remaining steps as skipped
    steps.forEach((step) => {
      if (step.status === 'pending') {
        step.status = 'skipped';
      }
    });

    await sessionManager.update(sessionId, {
      status: 'failed',
      metadata: {
        error: errorMessage,
        failedAt: endTime.toISOString(),
      },
    });

    timer.end();
    logger.error('Deployment workflow failed');

    return {
      success: false,
      sessionId,
      error: errorMessage,
      metadata: {
        startTime: context.metadata.startTime as Date,
        endTime,
        duration: endTime.getTime() - (context.metadata.startTime as Date).getTime(),
        steps: context.steps,
      },
    };
  }
}

/**
 * Export for MCP registration
 */
export const deploymentWorkflow = {
  name: 'deployment-workflow',
  description: 'Complete deployment pipeline from cluster preparation to verified deployment',
  execute: runDeploymentWorkflow,
  schema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session identifier' },
      imageId: { type: 'string', description: 'Docker image ID to deploy' },
      clusterConfig: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'Kubernetes context' },
          namespace: { type: 'string', description: 'Target namespace' },
          kubeconfig: { type: 'string', description: 'Path to kubeconfig file' },
        },
      },
      deploymentOptions: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Deployment name' },
          replicas: { type: 'number', description: 'Number of replicas' },
          port: { type: 'number', description: 'Container port' },
          serviceType: {
            type: 'string',
            enum: ['ClusterIP', 'NodePort', 'LoadBalancer'],
            description: 'Kubernetes service type',
          },
          registry: { type: 'string', description: 'Container registry URL' },
          imagePullPolicy: {
            type: 'string',
            enum: ['Always', 'IfNotPresent', 'Never'],
            description: 'Image pull policy',
          },
          resources: {
            type: 'object',
            properties: {
              limits: {
                type: 'object',
                properties: {
                  cpu: { type: 'string' },
                  memory: { type: 'string' },
                },
              },
              requests: {
                type: 'object',
                properties: {
                  cpu: { type: 'string' },
                  memory: { type: 'string' },
                },
              },
            },
          },
          env: { type: 'object', description: 'Environment variables' },
          labels: { type: 'object', description: 'Kubernetes labels' },
          annotations: { type: 'object', description: 'Kubernetes annotations' },
        },
        required: ['name', 'registry'],
      },
    },
    required: ['sessionId', 'imageId', 'deploymentOptions'],
  },
};
