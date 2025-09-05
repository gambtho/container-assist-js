/**
 * External System Integrations - Minimal Exports
 * Reduced from wildcard exports to prevent unused export proliferation
 * Note: This file had no direct imports - most exports were unused
 */

// Essential client exports only (matching main infrastructure/index.ts pattern)
export { DockerClient } from '../docker-client';
export { KubernetesClient } from '../kubernetes-client';
export { AIClient } from '../ai-client';

// Note: Removed all wildcard exports and type re-exports
// If specific exports are needed, they should be imported directly from their source files
