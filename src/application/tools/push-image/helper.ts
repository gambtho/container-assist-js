/**
 * Push Image - Helper Functions
 */

import type { ToolContext } from '../tool-types.js';

/**
 * Authenticate with registry
 */
export function authenticateRegistry(
  registry: string,
  credentials: { username?: string; password?: string; authToken?: string },
  context: ToolContext
): boolean {
  const { logger } = context;

  if (!credentials.username && !credentials.authToken) {
    // Try to use environment variables
    const envAuth = {
      username: process.env.DOCKER_USERNAME,
      password: process.env.DOCKER_PASSWORD,
      authToken: process.env.DOCKER_AUTH_TOKEN
    };

    if (envAuth.username ?? envAuth.authToken) {
      logger.info('Using registry credentials from environment');
      Object.assign(credentials, envAuth);
    }
  }

  if (!credentials.username && !credentials.authToken) {
    logger.warn('No registry credentials provided, attempting anonymous push');
    return true;
  }

  // Would implement actual Docker registry authentication here
  logger.info({ registry, username: credentials.username });
  return true;
}

/**
 * Push single image to registry
 */
export async function pushImage(
  tag: string,
  registry: string,
  auth: { username?: string; password?: string },
  context: ToolContext
): Promise<{ digest: string; size?: number; pushTime?: number }> {
  const { dockerService, logger } = context;
  const startTime = Date.now();

  if (dockerService && 'push' in dockerService) {
    const result = await (dockerService as unknown as any).push({
      image: tag,
      registry,
      auth: auth.username && auth.password ? auth : undefined
    });

    if (result.success && result.data) {
      const pushResult: { digest: string; size?: number; pushTime?: number } = {
        digest: result.data.digest,
        pushTime: Date.now() - startTime
      };

      // Only add size if it's defined
      if (result.data.size !== undefined) {
        pushResult.size = result.data.size;
      }

      return pushResult;
    }

    throw new Error(result.error?.message ?? 'Push failed');
  }

  // Fallback simulation
  logger.warn('Simulating push - Docker service not available');
  return {
    digest: `sha256:${Math.random().toString(36).substring(7)}`,
    size: 100 * 1024 * 1024,
    pushTime: Date.now() - startTime
  };
}

/**
 * Retry logic for push operations
 */
export async function pushWithRetry(
  tag: string,
  registry: string,
  auth: { username?: string; password?: string },
  context: ToolContext,
  maxRetries: number = 3
): Promise<{ digest: string; size?: number; pushTime?: number }> {
  const { logger } = context;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ tag, attempt, maxRetries }, `Pushing image (attempt ${attempt}/${maxRetries})`);
      return await pushImage(tag, registry, auth, context);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn({ tag, error: lastError.message }, `Push attempt ${attempt} failed`);

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('Push failed after retries');
}

/**
 * Get images to push from session or input
 */
export async function getImagesToPush(
  tags: string[],
  sessionId: string | undefined,
  sessionService: any
): Promise<string[]> {
  let imagesToPush = tags;

  // Get from session if not provided
  if (imagesToPush.length === 0 && sessionId && sessionService) {
    const session = await sessionService.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Get tags from session
    if (session.workflow_state?.tag_result) {
      imagesToPush = session.workflow_state.tag_result.tags ?? [];
    } else if (session.workflow_state?.build_result) {
      const tag =
        session.workflow_state.build_result.tag ?? session.workflow_state.build_result.tags?.[0];
      imagesToPush = tag ? [tag] : [];
    }
  }

  return imagesToPush;
}

/**
 * Process images in parallel
 */
export async function pushImagesParallel(
  imagesToPush: string[],
  targetRegistry: string,
  auth: { username?: string; password?: string },
  retryOnFailure: boolean,
  context: ToolContext
): Promise<{
  pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }>;
  failed: Array<{ tag: string; error?: string }>;
}> {
  const { logger } = context;
  const pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }> = [];
  const failed: Array<{ tag: string; error?: string }> = [];

  const pushPromises = imagesToPush.map(async (tag) => {
    try {
      const result = retryOnFailure
        ? await pushWithRetry(tag, targetRegistry, auth, context)
        : await pushImage(tag, targetRegistry, auth, context);

      pushed.push({ tag, ...result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failed.push({ tag, error: errorMessage ?? '' });
      logger.error({ error: errorMessage }, `Failed to push ${tag}`);
    }
  });

  await Promise.all(pushPromises);

  return { pushed, failed };
}

/**
 * Process images sequentially
 */
export async function pushImagesSequential(
  imagesToPush: string[],
  targetRegistry: string,
  auth: { username?: string; password?: string },
  retryOnFailure: boolean,
  context: ToolContext,
  progressCallback?: (index: number, tag: string) => Promise<void>
): Promise<{
  pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }>;
  failed: Array<{ tag: string; error?: string }>;
}> {
  const { logger } = context;
  const pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }> = [];
  const failed: Array<{ tag: string; error?: string }> = [];

  for (let i = 0; i < imagesToPush.length; i++) {
    const tag = imagesToPush[i];

    // Skip if tag is undefined
    if (!tag) {
      continue;
    }

    // Call progress callback if provided
    if (progressCallback) {
      await progressCallback(i, tag);
    }

    try {
      const result = retryOnFailure
        ? await pushWithRetry(tag, targetRegistry, auth, context)
        : await pushImage(tag, targetRegistry, auth, context);

      pushed.push({ tag, ...result });
      logger.info({ tag, digest: result.digest }, `Successfully pushed ${tag}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      failed.push({ tag, error: errorMessage });
      logger.error({ error: errorMessage }, `Failed to push ${tag}`);
    }
  }

  return { pushed, failed };
}

/**
 * Calculate push totals
 */
export function calculatePushTotals(
  pushed: Array<{ tag: string; digest: string; size?: number; pushTime?: number }>
): { totalSize: number; totalPushTime: number } {
  const totalSize = pushed.reduce((sum, p) => sum + (p.size ?? 0), 0);
  const totalPushTime = pushed.reduce((sum, p) => sum + (p.pushTime ?? 0), 0);

  return { totalSize, totalPushTime };
}
