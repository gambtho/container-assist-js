/**
 * Application Entry Point
 *
 * Process-level wiring and server startup logic.
 * This is the composition root for the entire application.
 */

import type { Deps } from './container';
import type { Logger } from 'pino';

/**
 * Application instance
 */
export interface App {
  deps: Deps;
  logger: Logger;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Entry point exports
 */
export { createMCPContainer, shutdownContainer } from './container';
export type { Deps, ContainerConfigOverrides, DepsOverrides, ContainerStatus } from './container';
export type { App as ApplicationInstance };
