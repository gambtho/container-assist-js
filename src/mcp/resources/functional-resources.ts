/**
 * Functional Resource Management
 * Replaces complex manager hierarchies with simple functions using composition
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../types/core/index.js';
import { pipe } from '../../lib/composition.js';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';

/**
 * Resource context for enhancements
 */
export interface ResourceContext {
  sessionId?: string;
  repositoryPath?: string;
  aiEnabled?: boolean;
}

/**
 * Simple resource storage
 */
const resourceStore = new Map<string, any>();

/**
 * Basic resource operations using functional composition
 */

// Core operations
export const readResource = async (uri: string): Promise<Result<any>> => {
  try {
    const resource = resourceStore.get(uri);
    if (!resource) {
      return Success(null);
    }
    
    // Check expiration
    if (resource.expiresAt && new Date() > resource.expiresAt) {
      resourceStore.delete(uri);
      return Success(null);
    }
    
    return Success(resource);
  } catch (error) {
    return Failure(`Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const writeResource = async (
  uri: string, 
  content: any, 
  ttl?: number
): Promise<Result<string>> => {
  try {
    const now = new Date();
    const resource = {
      uri,
      content,
      createdAt: now,
      expiresAt: ttl ? new Date(now.getTime() + ttl) : undefined,
      metadata: {
        size: JSON.stringify(content).length,
      }
    };
    
    resourceStore.set(uri, resource);
    return Success(uri);
  } catch (error) {
    return Failure(`Failed to write resource: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const deleteResource = async (uri: string): Promise<Result<void>> => {
  try {
    resourceStore.delete(uri);
    return Success(undefined);
  } catch (error) {
    return Failure(`Failed to delete resource: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const listResources = async (pattern?: string): Promise<Result<string[]>> => {
  try {
    const uris = Array.from(resourceStore.keys());
    if (pattern) {
      const filtered = uris.filter(uri => uri.includes(pattern));
      return Success(filtered);
    }
    return Success(uris);
  } catch (error) {
    return Failure(`Failed to list resources: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Enhancement functions using composition
export const withAIInsights = (aiService: any) => 
  (resourceFn: typeof readResource) => 
  async (uri: string, context?: ResourceContext): Promise<Result<any>> => {
    const result = await resourceFn(uri);
    
    if (!result.ok || !result.value || !context?.aiEnabled || !aiService) {
      return result;
    }
    
    try {
      const aiResult = await aiService.enhanceResourceContent({
        uri,
        content: result.value.content,
        context,
      });
      
      if (aiResult.ok) {
        return Success({
          ...result.value,
          aiInsights: aiResult.value.insights,
          aiOptimizations: aiResult.value.optimizations,
        });
      }
    } catch (error) {
      // Log error but don't fail the resource read
      console.warn('AI enhancement failed:', error);
    }
    
    return result;
  };

export const withLogging = (logger: Logger) => 
  (resourceFn: typeof readResource) => 
  async (uri: string): Promise<Result<any>> => {
    logger.debug({ uri }, 'Reading resource');
    const result = await resourceFn(uri);
    
    if (result.ok) {
      logger.debug({ uri, found: !!result.value }, 'Resource read completed');
    } else {
      logger.warn({ uri, error: result.error }, 'Resource read failed');
    }
    
    return result;
  };

export const withCaching = (cacheService: any) => 
  (resourceFn: typeof readResource) => 
  async (uri: string): Promise<Result<any>> => {
    // Try cache first
    const cached = await cacheService.get(uri);
    if (cached) {
      return Success(cached);
    }
    
    // Get from storage
    const result = await resourceFn(uri);
    
    // Cache successful results
    if (result.ok && result.value) {
      await cacheService.set(uri, result.value);
    }
    
    return result;
  };

// Session-aware resource helpers
export const generateSessionUri = (scheme: string, sessionId: string, resourceType: string): string => {
  return `${scheme}://${sessionId}/${resourceType}`;
};

export const parseSessionUri = (uri: string): { scheme: string; sessionId?: string; resourceType?: string } => {
  const match = uri.match(/^([^:]+):\/\/([^\/]+)\/(.+)$/);
  if (match) {
    return {
      scheme: match[1] || '',
      sessionId: match[2],
      resourceType: match[3],
    };
  }
  return { scheme: 'unknown' };
};

// Session-based resource operations
export const readSessionResource = async (
  uri: string,
  sessionManager: any
): Promise<Result<any>> => {
  const { sessionId, resourceType } = parseSessionUri(uri);
  
  if (!sessionId || !sessionManager) {
    return Failure(`Invalid session URI: ${uri}`);
  }
  
  try {
    const sessionState = await sessionManager.getState(sessionId);
    if (!sessionState) {
      return Success(null);
    }
    
    // Map resource types to session state properties
    const resourceMap: Record<string, string> = {
      'analysis': 'analysis_result',
      'dockerfile': 'generated_dockerfile',
      'manifests': 'k8s_manifests',
      'scan': 'scan_results',
      'workflow': 'workflow_state',
      'build': 'build_log',
      'deployment': 'deployment_status',
    };
    
    const stateProperty = resourceMap[resourceType || ''];
    if (!stateProperty || !sessionState[stateProperty]) {
      return Success(null);
    }
    
    return Success({
      uri,
      content: sessionState[stateProperty],
      sessionId,
      resourceType,
    });
  } catch (error) {
    return Failure(`Failed to read session resource: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// Composed resource functions
export const createEnhancedResourceReader = (
  logger: Logger,
  aiService?: any,
  cacheService?: any
) => {
  return pipe(
    withLogging(logger),
    cacheService ? withCaching(cacheService) : (fn: any) => fn,
    aiService ? withAIInsights(aiService) : (fn: any) => fn
  )(readResource);
};

// Simple resource manager using functions
export const createResourceManager = (logger: Logger, config?: { aiService?: any; cacheService?: any }) => {
  const enhancedReader = createEnhancedResourceReader(logger, config?.aiService, config?.cacheService);
  
  return {
    read: enhancedReader,
    write: writeResource,
    delete: deleteResource,
    list: listResources,
    readSession: readSessionResource,
    
    // Utility functions
    generateUri: generateSessionUri,
    parseUri: parseSessionUri,
    
    // Stats
    getStats: () => ({
      totalResources: resourceStore.size,
      aiEnabled: !!config?.aiService,
      cacheEnabled: !!config?.cacheService,
    }),
  };
};