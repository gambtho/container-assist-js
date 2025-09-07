/**
 * Configuration Types
 */

// Basic configuration types (kept minimal)
export interface ApplicationConfig {
  logLevel: string;
  workspaceDir: string;
  server?: {
    nodeEnv?: string;
    logLevel?: string;
    port?: number;
    host?: string;
  };
  session?: {
    store?: string;
    ttl?: number;
    maxSessions?: number;
    persistencePath?: string;
    persistenceInterval?: number;
    cleanupInterval?: number;
  };
}
