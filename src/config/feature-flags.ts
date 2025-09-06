/**
 * Feature flags for MCP implementation
 * These allow teams to work independently and enable progressive rollout
 */
export const FEATURES = {
  // Core MCP features
  mcpServer: process.env.ENABLE_MCP_SERVER === 'true',
  mcpResources: process.env.ENABLE_MCP_RESOURCES === 'true',
  mcpProgressNotifications: process.env.ENABLE_MCP_PROGRESS === 'true',

  // Sampling features (Team Beta)
  mcpSampling: process.env.ENABLE_MCP_SAMPLING === 'true',
  dockerfileSampling: process.env.ENABLE_DOCKERFILE_SAMPLING === 'true',
  k8sSampling: process.env.ENABLE_K8S_SAMPLING === 'true',
  candidateScoring: process.env.ENABLE_CANDIDATE_SCORING === 'true',

  // Tool enhancements (Team Delta)
  dynamicToolEnablement: process.env.ENABLE_DYNAMIC_TOOLS === 'true',
  toolResourceLinks: process.env.ENABLE_TOOL_RESOURCES === 'true',
  enhancedProgressEvents: process.env.ENABLE_ENHANCED_PROGRESS === 'true',

  // Testing features (Team Gamma)
  mcpInspector: process.env.ENABLE_MCP_INSPECTOR === 'true',
  performanceBenchmarks: process.env.ENABLE_PERFORMANCE_BENCHMARKS === 'true',
  regressionDetection: process.env.ENABLE_REGRESSION_DETECTION === 'true',

  // Integration features (Team Epsilon)
  workflowOrchestration: process.env.ENABLE_WORKFLOW_ORCHESTRATION === 'true',
  deploymentVerification: process.env.ENABLE_DEPLOYMENT_VERIFICATION === 'true',

  // Development and debugging
  debugMode: process.env.DEBUG_MCP === 'true',
  useMocks: process.env.USE_MOCKS === 'true',
  verboseLogging: process.env.VERBOSE_MCP_LOGGING === 'true',
} as const;

export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = (flag: FeatureFlag): boolean => FEATURES[flag];

/**
 * Get all enabled features
 */
export const getEnabledFeatures = (): FeatureFlag[] => {
  return Object.entries(FEATURES)
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag as FeatureFlag);
};

/**
 * Feature flag groups for easier management
 */
export const FEATURE_GROUPS = {
  core: ['mcpServer', 'mcpResources', 'mcpProgressNotifications'] as FeatureFlag[],
  sampling: [
    'mcpSampling',
    'dockerfileSampling',
    'k8sSampling',
    'candidateScoring',
  ] as FeatureFlag[],
  tools: ['dynamicToolEnablement', 'toolResourceLinks', 'enhancedProgressEvents'] as FeatureFlag[],
  testing: ['mcpInspector', 'performanceBenchmarks', 'regressionDetection'] as FeatureFlag[],
  integration: ['workflowOrchestration', 'deploymentVerification'] as FeatureFlag[],
  development: ['debugMode', 'useMocks', 'verboseLogging'] as FeatureFlag[],
} as const;

export type FeatureGroup = keyof typeof FEATURE_GROUPS;

/**
 * Check if all features in a group are enabled
 */
export const isFeatureGroupEnabled = (group: FeatureGroup): boolean => {
  return FEATURE_GROUPS[group].every((flag) => isFeatureEnabled(flag));
};

/**
 * Get feature flag status for debugging
 */
export const getFeatureFlagStatus = (): Record<
  FeatureGroup,
  { enabled: FeatureFlag[]; disabled: FeatureFlag[] }
> => {
  const status: Record<FeatureGroup, { enabled: FeatureFlag[]; disabled: FeatureFlag[] }> =
    {} as any;

  for (const [groupName, flags] of Object.entries(FEATURE_GROUPS)) {
    const group = groupName as FeatureGroup;
    status[group] = {
      enabled: flags.filter((flag) => isFeatureEnabled(flag)),
      disabled: flags.filter((flag) => !isFeatureEnabled(flag)),
    };
  }

  return status;
};
