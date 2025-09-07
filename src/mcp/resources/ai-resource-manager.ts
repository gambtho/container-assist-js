import type { Result } from '../../types/core/index.js';
import { Success, Failure } from '../../types/core/index.js';
import type { McpResourceManager as ResourceManager } from './manager.js';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

// AI context for resource enhancement
type AIContext = {
  sessionId?: string;
  repositoryPath?: string;
  analysisResult?: any;
};

// Enhanced resource with AI insights
type EnhancedResource = Resource & {
  aiAnnotations?: {
    insights?: string[];
    optimizations?: string[];
    warnings?: string[];
  };
};

// Functional resource enhancement with composition
const shouldEnhanceWithAI = (uri: string): boolean =>
  /\.(dockerfile|yaml|yml|json|xml|gradle|pom\.xml)$/i.test(uri) ||
  uri.toLowerCase().includes('dockerfile') ||
  uri.includes('k8s') ||
  uri.includes('kubernetes') ||
  uri.includes('docker-compose') ||
  uri.includes('manifest');

const enhanceResourceContent = async (
  resource: Resource,
  context: AIContext | undefined,
  aiService: any,
): Promise<EnhancedResource> => {
  if (!shouldEnhanceWithAI(resource.uri) || !context) {
    return resource;
  }

  const aiResult = await aiService.enhanceResourceContent({
    uri: resource.uri,
    content: resource.contents,
    context,
    schema: resource.mimeType,
  });

  if (!aiResult.ok) {
    // Return original resource if AI enhancement fails
    return resource;
  }

  // Add AI annotations to resource
  const enhanced: EnhancedResource = {
    ...resource,
    aiAnnotations: {
      insights: aiResult.value.insights,
      optimizations: aiResult.value.optimizations,
      warnings: aiResult.value.warnings,
    },
  };

  // If content has text, add inline comments with insights
  if (
    resource.contents?.[0] &&
    'text' in resource.contents[0] &&
    aiResult.value.insights?.length > 0
  ) {
    const firstContent = resource.contents[0];
    const originalText = firstContent.text;
    const insightComments = aiResult.value.insights
      .map((insight: string) => `# AI Insight: ${insight}`)
      .join('\n');

    enhanced.contents = [
      {
        ...firstContent,
        text: `${insightComments}\n\n${originalText}`,
      },
    ];
  }

  return enhanced;
};

// Enhanced URI schemes for intelligent resources
export const EnhancedUriSchemes = {
  repository: 'repository://', // repository://sessionId/analysis
  dockerfile: 'dockerfile://', // dockerfile://sessionId/generated
  manifest: 'manifest://', // manifest://sessionId/k8s-deployment
  scan: 'scan://', // scan://sessionId/vulnerability-report
  workflow: 'workflow://', // workflow://sessionId/execution-state
  ai: 'ai://', // ai://sessionId/context-analysis
  build: 'build://', // build://sessionId/build-log
  deployment: 'deployment://', // deployment://sessionId/status
} as const;

// Parse enhanced URI to extract metadata
const parseEnhancedUri = (
  uri: string,
): { scheme: string; sessionId?: string; resourceType?: string } => {
  for (const [key, scheme] of Object.entries(EnhancedUriSchemes)) {
    if (uri.startsWith(scheme)) {
      const path = uri.substring(scheme.length);
      const parts = path.split('/');
      return {
        scheme: key,
        sessionId: parts[0] || undefined,
        resourceType: parts[1] || undefined,
      } as { scheme: string; sessionId?: string; resourceType?: string };
    }
  }

  return { scheme: 'file' };
};

// Generate resource from session state
const generateSessionResource = async (
  uri: string,
  sessionManager: any,
  aiService: any,
): Promise<Result<EnhancedResource | null>> => {
  const { scheme, sessionId, resourceType } = parseEnhancedUri(uri);

  if (!sessionId) {
    return Failure(`Invalid session URI: ${uri}`);
  }

  const sessionState = await sessionManager.getState(sessionId);
  if (!sessionState) {
    return Success(null);
  }

  let content: any;
  let mimeType = 'application/json';

  switch (scheme) {
    case 'repository':
      content = sessionState.analysis_result || { message: 'No analysis available' };
      break;

    case 'dockerfile':
      content = sessionState.generated_dockerfile || { message: 'No Dockerfile generated' };
      mimeType = 'text/plain';
      break;

    case 'manifest':
      content = sessionState.k8s_manifests || { message: 'No manifests generated' };
      mimeType = 'application/yaml';
      break;

    case 'scan':
      content = sessionState.scan_results || { message: 'No scan results available' };
      break;

    case 'workflow':
      content = sessionState.workflow_state || { message: 'No workflow active' };
      break;

    case 'ai':
      content = sessionState.ai_context || { message: 'No AI context available' };
      break;

    case 'build':
      content = sessionState.build_log || { message: 'No build log available' };
      mimeType = 'text/plain';
      break;

    case 'deployment':
      content = sessionState.deployment_status || { message: 'No deployment status' };
      break;

    default:
      return Success(null);
  }

  const resource: EnhancedResource = {
    uri,
    name: `${scheme}/${resourceType || 'default'}`,
    description: `Session resource: ${scheme}`,
    mimeType,
    contents: [
      {
        uri,
        mimeType,
        text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
      },
    ],
  };

  // Enhance with AI insights
  return Success(await enhanceResourceContent(resource, { sessionId }, aiService));
};

export class EnhancedResourceManager {
  constructor(
    private baseManager: ResourceManager,
    private aiService: any,
    private sessionManager: any,
  ) {}

  async readWithAI(uri: string, context?: AIContext): Promise<Result<EnhancedResource | null>> {
    // Check if this is a session-based resource
    if (Object.values(EnhancedUriSchemes).some((scheme) => uri.startsWith(scheme))) {
      return generateSessionResource(uri, this.sessionManager, this.aiService);
    }

    // Read from base manager
    const readResult = await this.baseManager.read(uri);
    if (!readResult.ok) {
      return readResult as Result<EnhancedResource | null>;
    }

    if (!readResult.value) {
      return Success(null);
    }

    // Enhance with AI if context is provided
    const enhancedResource = context
      ? await enhanceResourceContent(readResult.value, context, this.aiService)
      : readResult.value;

    return Success(enhancedResource);
  }

  async listWithAI(context?: AIContext): Promise<Result<EnhancedResource[]>> {
    const listResult = await this.baseManager.list();
    if (!listResult.ok) {
      return listResult as Result<EnhancedResource[]>;
    }

    // Add session-based resources if context is provided
    const resources: EnhancedResource[] = [...listResult.value];

    if (context?.sessionId) {
      const sessionState = await this.sessionManager.getState(context.sessionId);

      if (sessionState) {
        // Add available session resources
        if (sessionState.analysis_result) {
          resources.push({
            uri: `${EnhancedUriSchemes.repository}${context.sessionId}/analysis`,
            name: 'Repository Analysis',
            description: 'AI-enhanced repository analysis results',
            mimeType: 'application/json',
          });
        }

        if (sessionState.generated_dockerfile) {
          resources.push({
            uri: `${EnhancedUriSchemes.dockerfile}${context.sessionId}/generated`,
            name: 'Generated Dockerfile',
            description: 'AI-optimized Dockerfile',
            mimeType: 'text/plain',
          });
        }

        if (sessionState.scan_results) {
          resources.push({
            uri: `${EnhancedUriSchemes.scan}${context.sessionId}/report`,
            name: 'Security Scan Report',
            description: 'Vulnerability analysis with AI insights',
            mimeType: 'application/json',
          });
        }

        if (sessionState.workflow_state) {
          resources.push({
            uri: `${EnhancedUriSchemes.workflow}${context.sessionId}/state`,
            name: 'Workflow State',
            description: 'Current workflow execution state',
            mimeType: 'application/json',
          });
        }
      }
    }

    // Enhance resources with AI insights if requested
    if (context && resources.length > 0) {
      const enhancedResources = await Promise.all(
        resources.map((resource) =>
          shouldEnhanceWithAI(resource.uri)
            ? enhanceResourceContent(resource, context, this.aiService)
            : resource,
        ),
      );

      return Success(enhancedResources);
    }

    return Success(resources);
  }

  async subscribeWithAI(uri: string, context?: AIContext): Promise<Result<void>> {
    // Enhanced subscription with AI monitoring
    const subscribeResult = await this.baseManager.subscribe(uri);

    if (subscribeResult.ok && context?.sessionId) {
      // Track subscription in session for intelligent updates
      await this.sessionManager.addSubscription(context.sessionId, {
        uri,
        timestamp: new Date().toISOString(),
        aiMonitored: shouldEnhanceWithAI(uri),
      });
    }

    return subscribeResult;
  }

  async unsubscribeWithAI(uri: string, context?: AIContext): Promise<Result<void>> {
    const unsubscribeResult = await this.baseManager.unsubscribe(uri);

    if (unsubscribeResult.ok && context?.sessionId) {
      // Remove subscription from session tracking
      await this.sessionManager.removeSubscription(context.sessionId, uri);
    }

    return unsubscribeResult;
  }

  // Delegate basic operations to base manager
  async read(uri: string): Promise<Result<Resource | null>> {
    return this.baseManager.read(uri);
  }

  async list(): Promise<Result<Resource[]>> {
    return this.baseManager.list();
  }

  async subscribe(uri: string): Promise<Result<void>> {
    return this.baseManager.subscribe(uri);
  }

  async unsubscribe(uri: string): Promise<Result<void>> {
    return this.baseManager.unsubscribe(uri);
  }
}

// Factory function for creating enhanced resource manager
export const createEnhancedResourceManager = (
  baseManager: ResourceManager,
  aiService: any,
  sessionManager: any,
): EnhancedResourceManager => {
  return new EnhancedResourceManager(baseManager, aiService, sessionManager);
};

// Export types
export type { EnhancedResource, AIContext };
