/**
 * Core Configuration Types
 * Essential configurations used throughout the application
 */

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type WorkflowMode = 'interactive' | 'auto' | 'batch';
export type StoreType = 'memory' | 'file' | 'redis';
