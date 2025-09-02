/**
 * Domain Types
 * Core type definitions and patterns used throughout the application
 */

// Result monad pattern for error handling
export * from './result';

// Session and workflow types  
export * from './session';

// Error handling types
export * from './errors';

// Re-export existing contract types
export * from '../../contracts/types/docker';
export * from '../../contracts/types/kubernetes';
export * from '../../contracts/types/scanning';
export * from '../../contracts/types/dotnet';
