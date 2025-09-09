/**
 * MCP Tools Helper Index
 *
 * This module provides a clean public API for all tool standardization helpers.
 * These utilities implement the "Golden Path" pattern for consistent tool behavior.
 *
 * @example Basic tool implementation using helpers
 * ```typescript
 * import { wrapTool, resolveSession, aiGenerate, formatStandardResponse } from '@mcp/tools';
 *
 * export const myTool = wrapTool('my-tool', async (params, context, logger) => {
 *   // 1. Session resolution (optional sessionId)
 *   const sess = await resolveSession(logger, context, {
 *     sessionId: params.sessionId,
 *     defaultIdHint: computeHash(params)
 *   });
 *
 *   // 2. AI generation with registry
 *   const result = await aiGenerate(logger, context, {
 *     promptName: 'my-prompt',
 *     promptArgs: params,
 *     expectation: 'json'
 *   });
 *
 *   // 3. Session mutation
 *   if (result.ok) {
 *     await appendCompletedStep(sess.value.id, 'my-step');
 *   }
 *
 *   // 4. Return standardized response
 *   return formatStandardResponse(result, sess.value.id);
 * });
 * ```
 */

// =============================================================================
// SESSION MANAGEMENT HELPERS
// =============================================================================

/**
 * Session management utilities for consistent session handling across tools.
 *
 * @example Resolving a session with optional sessionId
 * ```typescript
 * const sess = await resolveSession(logger, context, {
 *   sessionId: params.sessionId,  // Always optional
 *   defaultIdHint: computeHash(params.repoPath)
 * });
 * ```
 */
export * from './session-helpers';

// =============================================================================
// AI INTEGRATION HELPERS
// =============================================================================

/**
 * AI invocation helpers with centralized prompt registry and fallback logic.
 *
 * @example AI generation with fallback
 * ```typescript
 * const result = await aiGenerate(logger, context, {
 *   promptName: 'dockerfile-generation',
 *   promptArgs: { framework: 'node', requirements: [] },
 *   expectation: 'dockerfile',
 *   fallbackBehavior: 'retry',
 *   maxRetries: 3
 * });
 * ```
 */
export * from './ai-helpers';

// =============================================================================
// TOOL EXECUTION WRAPPER
// =============================================================================

/**
 * Consistent tool execution wrapper with standardized error handling and progress reporting.
 *
 * @example Wrapping a tool implementation
 * ```typescript
 * export const myTool = wrapTool('my-tool', async (params, context, logger) => {
 *   // Implementation automatically gets:
 *   // - Standard progress reporting (4 stages)
 *   // - Consistent error handling
 *   // - Unified logging context
 *   // - Structured response formatting
 *   return await doMyToolLogic(params);
 * });
 * ```
 */
export { wrapTool } from './tool-wrapper';

// =============================================================================
// RESPONSE FORMATTING
// =============================================================================

/**
 * Response standardization utilities for consistent tool return shapes.
 *
 * @example Formatting a standard response
 * ```typescript
 * // Returns: { ok: true, sessionId: '123', data: result, message: 'Success' }
 * return formatStandardResponse(result, sessionId);
 *
 * // Tool-specific formatters also available:
 * return responseFormatters.dockerfile(content, sessionId);
 * return responseFormatters.manifest(yaml, sessionId);
 * ```
 */
export { formatStandardResponse, responseFormatters } from './response-formatter';

// =============================================================================
// PROGRESS REPORTING
// =============================================================================

/**
 * Standardized progress reporting with 4-stage pattern.
 *
 * @example Using standard progress stages
 * ```typescript
 * const progress = createStandardProgress(context.progressReporter);
 *
 * await progress('VALIDATING');   // 10%
 * await progress('EXECUTING');    // 50%
 * await progress('FINALIZING');   // 90%
 * await progress('COMPLETE');     // 100%
 * ```
 */
export { createStandardProgress, STANDARD_STAGES } from '../utils/progress-helper';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Re-export commonly used types for convenience
 */
export type { SessionResolutionOptions, ResolvedSession } from './session-helpers';

export type { AIGenerateOptions, AIResponse } from './ai-helpers';

export type { StandardToolResponse, ToolImplementation, ToolHandler } from './tool-wrapper';

export type {
  StandardToolResponse as ToolResponse,
  DockerfileResponse,
  ManifestResponse,
  AnalysisResponse,
} from './response-formatter';

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * SDK Tool Registry for tool management
 */
export type { SDKToolRegistry } from './registry';

/**
 * Validation utilities
 */
export type { ValidationContext, ValidationResult } from './validator';
