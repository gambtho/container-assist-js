/**
 * Tool Manifest - Explicit registry of implemented tools
 * Single source of truth for which tools are actually implemented vs stubs
 */

export enum ToolStatus {
  IMPLEMENTED = 'implemented',
  PARTIAL = 'partial',
  STUB = 'stub',
  DEPRECATED = 'deprecated'
}

export interface ToolManifestEntry {
  name: string;
  status: ToolStatus;
  category: string;
  description: string;
  dependencies?: string[];
  requiredServices?: string[];
  implementationPath?: string;
  notes?: string;
}

/**
 * Complete manifest of all tools and their implementation status
 */
export const TOOL_MANIFEST: Record<string, ToolManifestEntry> = {
  // Analysis Tools - IMPLEMENTED
  analyze_repository: {
    name: 'analyze_repository',
    status: ToolStatus.IMPLEMENTED,
    category: 'analysis',
    description: 'Analyzes repository structure, language, framework, and dependencies',
    requiredServices: ['filesystem'],
    implementationPath: 'analyze-repo/analyze-repo.ts',
  },

  resolve_base_images: {
    name: 'resolve_base_images',
    status: ToolStatus.IMPLEMENTED,
    category: 'analysis',
    description: 'Determines optimal base images for containerization',
    requiredServices: ['ai'],
    implementationPath: 'resolve-base-images/resolve-base-images.ts',
  },

  // Generation Tools - IMPLEMENTED
  generate_dockerfile: {
    name: 'generate_dockerfile',
    status: ToolStatus.IMPLEMENTED,
    category: 'generation',
    description: 'Generates optimized Dockerfile based on analysis',
    requiredServices: ['ai', 'filesystem'],
    implementationPath: 'generate-dockerfile/generate-dockerfile.ts',
  },

  generate_k8s_manifests: {
    name: 'generate_k8s_manifests',
    status: ToolStatus.IMPLEMENTED,
    category: 'generation',
    description: 'Generates Kubernetes deployment manifests',
    requiredServices: ['filesystem'],
    implementationPath: 'generate-k8s-manifests/generate-k8s-manifests.ts',
  },

  // Docker Operations - IMPLEMENTED
  build_image: {
    name: 'build_image',
    status: ToolStatus.IMPLEMENTED,
    category: 'docker',
    description: 'Builds Docker image from Dockerfile',
    requiredServices: ['docker'],
    dependencies: ['generate_dockerfile'],
    implementationPath: 'build-image/build-image.ts',
  },

  scan_image: {
    name: 'scan_image',
    status: ToolStatus.IMPLEMENTED,
    category: 'docker',
    description: 'Scans Docker image for security vulnerabilities using Trivy',
    requiredServices: ['docker'],
    dependencies: ['build_image'],
    implementationPath: 'scan-image/scan-image.ts',
    notes: 'Requires Trivy to be installed for real scanning',
  },

  tag_image: {
    name: 'tag_image',
    status: ToolStatus.IMPLEMENTED,
    category: 'docker',
    description: 'Tags Docker image with specified tags',
    requiredServices: ['docker'],
    dependencies: ['build_image'],
    implementationPath: 'tag-image/tag-image.ts',
  },

  push_image: {
    name: 'push_image',
    status: ToolStatus.IMPLEMENTED,
    category: 'docker',
    description: 'Pushes Docker image to registry',
    requiredServices: ['docker'],
    dependencies: ['tag_image'],
    implementationPath: 'push-image/push-image.ts',
  },

  // Kubernetes Operations - IMPLEMENTED
  deploy_application: {
    name: 'deploy_application',
    status: ToolStatus.IMPLEMENTED,
    category: 'kubernetes',
    description: 'Deploys application to Kubernetes cluster',
    requiredServices: ['kubernetes'],
    dependencies: ['generate_k8s_manifests', 'push_image'],
    implementationPath: 'deploy-application/deploy-application.ts',
  },

  verify_deployment: {
    name: 'verify_deployment',
    status: ToolStatus.IMPLEMENTED,
    category: 'kubernetes',
    description: 'Verifies deployment health and readiness',
    requiredServices: ['kubernetes'],
    dependencies: ['deploy_application'],
    implementationPath: 'verify-deployment/verify-deployment.ts',
  },

  // Workflow Tools - IMPLEMENTED
  start_workflow: {
    name: 'start_workflow',
    status: ToolStatus.IMPLEMENTED,
    category: 'workflow',
    description: 'Starts a complete containerization workflow',
    requiredServices: ['session'],
    implementationPath: 'workflow/start-workflow.ts',
  },

  workflow_status: {
    name: 'workflow_status',
    status: ToolStatus.IMPLEMENTED,
    category: 'workflow',
    description: 'Gets current workflow status and progress',
    requiredServices: ['session'],
    implementationPath: 'workflow/workflow-status.ts',
  },

  // Error Recovery Tools - IMPLEMENTED
  error_recovery: {
    name: 'error_recovery',
    status: ToolStatus.IMPLEMENTED,
    category: 'utility',
    description: 'Attempts to recover from workflow errors',
    requiredServices: ['session', 'ai'],
    implementationPath: 'error-recovery.ts',
  },

  fix_dockerfile: {
    name: 'fix_dockerfile',
    status: ToolStatus.IMPLEMENTED,
    category: 'utility',
    description: 'Fixes common Dockerfile issues',
    requiredServices: ['ai', 'filesystem'],
    implementationPath: 'fix-dockerfile/fix-dockerfile.ts',
  },

  // Utility Tools - IMPLEMENTED
  list_tools: {
    name: 'list_tools',
    status: ToolStatus.IMPLEMENTED,
    category: 'utility',
    description: 'Lists all available tools and their status',
    requiredServices: [],
    implementationPath: 'list-tools.ts',
  },

  server_status: {
    name: 'server_status',
    status: ToolStatus.IMPLEMENTED,
    category: 'utility',
    description: 'Gets MCP server status and health',
    requiredServices: [],
    implementationPath: 'server-status.ts',
  },
};

/**
 * Get list of fully implemented tools
 */
export function getImplementedTools(): string[] {
  return Object.entries(TOOL_MANIFEST)
    .filter(([_, entry]) => entry.status === ToolStatus.IMPLEMENTED)
    .map(([name]) => name);
}

/**
 * Get list of partially implemented tools
 */
export function getPartialTools(): string[] {
  return Object.entries(TOOL_MANIFEST)
    .filter(([_, entry]) => entry.status === ToolStatus.PARTIAL)
    .map(([name]) => name);
}

/**
 * Get list of stub tools
 */
export function getStubTools(): string[] {
  return Object.entries(TOOL_MANIFEST)
    .filter(([_, entry]) => entry.status === ToolStatus.STUB)
    .map(([name]) => name);
}

/**
 * Check if a tool is implemented
 */
export function isToolImplemented(toolName: string): boolean {
  const entry = TOOL_MANIFEST[toolName];
  return entry?.status === ToolStatus.IMPLEMENTED;
}

/**
 * Get tool information
 */
export function getToolInfo(toolName: string): ToolManifestEntry | undefined {
  return TOOL_MANIFEST[toolName];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): ToolManifestEntry[] {
  return Object.values(TOOL_MANIFEST).filter((entry) => entry.category === category);
}

/**
 * Get tools that require a specific service
 */
export function getToolsByService(service: string): ToolManifestEntry[] {
  return Object.values(TOOL_MANIFEST).filter(
    (entry) => entry.requiredServices?.includes(service) ?? false,
  );
}

/**
 * Get tool dependencies
 */
export function getToolDependencies(toolName: string): string[] {
  const entry = TOOL_MANIFEST[toolName];
  return entry?.dependencies ?? [];
}

/**
 * Validate tool availability based on available services
 */
export function validateToolAvailability(
  toolName: string,
  availableServices: string[],
): { available: boolean; missingServices?: string[] } {
  const entry = TOOL_MANIFEST[toolName];

  if (!entry) {
    return { available: false };
  }

  if (entry.status !== ToolStatus.IMPLEMENTED) {
    return { available: false };
  }

  const requiredServices = entry.requiredServices ?? [];
  const missingServices = requiredServices.filter(
    (service) => !availableServices.includes(service),
  );

  const result: { available: boolean; missingServices?: string[] } = {
    available: missingServices.length === 0,
  };

  if (missingServices.length > 0) {
    result.missingServices = missingServices;
  }

  return result;
}
