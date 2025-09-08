/**
 * Functional composition utilities for TypeScript
 *
 * Provides pipe function for tool enhancement composition.
 */

/**
 * Pipe functions left-to-right
 * @example
 * const enhance = pipe(
 *   addLogging,
 *   addMetrics,
 *   addRetry
 * );
 * const enhancedTool = enhance(baseTool);
 */
export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}
