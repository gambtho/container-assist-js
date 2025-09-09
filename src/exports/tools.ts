/**
 * Tool collection and registry for external consumption
 */

import { adaptTool } from './adapter.js';
import type { MCPTool } from './types.js';

// Import all tool implementations
import { analyzeRepo } from '../tools/analyze-repo/tool.js';
import { analyzeRepoSchema } from '../tools/analyze-repo/schema.js';
import { generateDockerfile } from '../tools/generate-dockerfile/tool.js';
import { generateDockerfileSchema } from '../tools/generate-dockerfile/schema.js';
import { buildImage } from '../tools/build-image/tool.js';
import { buildImageSchema } from '../tools/build-image/schema.js';
import { scanImage } from '../tools/scan/tool.js';
import { scanImageSchema } from '../tools/scan/schema.js';
import { tagImage } from '../tools/tag-image/tool.js';
import { tagImageSchema } from '../tools/tag-image/schema.js';
import { pushImage } from '../tools/push-image/tool.js';
import { pushImageSchema } from '../tools/push-image/schema.js';
import { generateK8sManifests } from '../tools/generate-k8s-manifests/tool.js';
import { generateK8sManifestsSchema } from '../tools/generate-k8s-manifests/schema.js';
import { prepareCluster } from '../tools/prepare-cluster/tool.js';
import { prepareClusterSchema } from '../tools/prepare-cluster/schema.js';
import { deployApplication } from '../tools/deploy/tool.js';
import { deployApplicationSchema } from '../tools/deploy/schema.js';
import { verifyDeployment } from '../tools/verify-deployment/tool.js';
import { verifyDeploymentSchema } from '../tools/verify-deployment/schema.js';
import { fixDockerfile } from '../tools/fix-dockerfile/tool.js';
import { fixDockerfileSchema } from '../tools/fix-dockerfile/schema.js';
import { resolveBaseImages } from '../tools/resolve-base-images/tool.js';
import { resolveBaseImagesSchema } from '../tools/resolve-base-images/schema.js';
import { opsTool } from '../tools/ops/tool.js';
import { opsToolSchema } from '../tools/ops/schema.js';
import { workflow } from '../tools/workflow/tool.js';
import { workflowSchema } from '../tools/workflow/schema.js';
import type { Tool } from '../domain/types.js';
import { createStandaloneContext } from './standalone-context.js';
import { createLogger } from '../lib/logger.js';

// Helper to create tool wrapper with standalone context support
const createToolWrapper = (
  name: string,
  description: string,
  schema: any,
  executeFn: (params: any, context: any) => Promise<any>,
): Tool => ({
  name,
  description,
  schema,
  execute: async (params, logger, context) => {
    const ctx = context || createStandaloneContext(params as any, logger || createLogger({ name }));
    return executeFn(params as any, ctx);
  },
});

// Create Tool wrappers for all functions
const analyzeRepoTool = createToolWrapper(
  'analyze_repo',
  'Analyze repository structure and detect technologies',
  analyzeRepoSchema.shape,
  analyzeRepo,
);

const generateDockerfileTool = createToolWrapper(
  'generate_dockerfile',
  'Generate a Dockerfile for the analyzed repository',
  generateDockerfileSchema.shape,
  generateDockerfile,
);

const buildImageTool = createToolWrapper(
  'build_image',
  'Build a Docker image',
  buildImageSchema.shape,
  buildImage,
);

const scanImageTool = createToolWrapper(
  'scan_image',
  'Scan a Docker image for vulnerabilities',
  scanImageSchema.shape,
  scanImage,
);

const tagImageTool = createToolWrapper(
  'tag_image',
  'Tag a Docker image',
  tagImageSchema.shape,
  tagImage,
);

const pushImageTool = createToolWrapper(
  'push_image',
  'Push a Docker image to a registry',
  pushImageSchema.shape,
  pushImage,
);

const generateK8sManifestsTool = createToolWrapper(
  'generate_k8s_manifests',
  'Generate Kubernetes manifests',
  generateK8sManifestsSchema.shape,
  generateK8sManifests,
);

const prepareClusterTool = createToolWrapper(
  'prepare_cluster',
  'Prepare Kubernetes cluster for deployment',
  prepareClusterSchema.shape,
  prepareCluster,
);

const deployApplicationTool = createToolWrapper(
  'deploy_application',
  'Deploy application to Kubernetes',
  deployApplicationSchema.shape,
  deployApplication,
);

const verifyDeploymentTool = createToolWrapper(
  'verify_deployment',
  'Verify deployment status',
  verifyDeploymentSchema.shape,
  verifyDeployment,
);

const fixDockerfileTool = createToolWrapper(
  'fix_dockerfile',
  'Fix issues in a Dockerfile',
  fixDockerfileSchema.shape,
  fixDockerfile,
);

const resolveBaseImagesTool = createToolWrapper(
  'resolve_base_images',
  'Resolve and recommend base images',
  resolveBaseImagesSchema.shape,
  resolveBaseImages,
);

const opsToolWrapper = createToolWrapper(
  'ops',
  'Operational utilities',
  opsToolSchema.shape,
  opsTool,
);

const workflowTool = createToolWrapper(
  'workflow',
  'Execute containerization workflows',
  workflowSchema.shape,
  workflow,
);

// Adapt all tools to MCPTool interface
const adaptedTools = {
  analyzeRepo: adaptTool(analyzeRepoTool),
  generateDockerfile: adaptTool(generateDockerfileTool),
  buildImage: adaptTool(buildImageTool),
  scanImage: adaptTool(scanImageTool),
  tagImage: adaptTool(tagImageTool),
  pushImage: adaptTool(pushImageTool),
  generateK8sManifests: adaptTool(generateK8sManifestsTool),
  prepareCluster: adaptTool(prepareClusterTool),
  deployApplication: adaptTool(deployApplicationTool),
  verifyDeployment: adaptTool(verifyDeploymentTool),
  fixDockerfile: adaptTool(fixDockerfileTool),
  resolveBaseImages: adaptTool(resolveBaseImagesTool),
  ops: adaptTool(opsToolWrapper),
  workflow: adaptTool(workflowTool),
};

/**
 * Tool collection object for easy access
 */
export const tools = adaptedTools;

/**
 * Get all available tools as an array
 */
export function getAllTools(): MCPTool[] {
  return Object.values(adaptedTools);
}

/**
 * Get all available tools as a map
 */
export function getToolsMap(): Map<string, MCPTool> {
  const map = new Map<string, MCPTool>();
  Object.values(adaptedTools).forEach((tool) => {
    map.set(tool.name, tool);
  });
  return map;
}
