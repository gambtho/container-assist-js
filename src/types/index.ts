/**
 * Type System Entry Point
 *
 * Import types directly from their specific modules:
 * - ./core - Core types (Result, Success, Failure, etc.)
 * - ./docker - Docker-related types
 * - ./k8s - Kubernetes-related types
 * - ./session - Session and workflow types
 * - ./tools - Tool-related types
 * - ./workflow-state - Workflow state management
 *
 * This file intentionally does not re-export to avoid unused export warnings.
 */

// Empty export to satisfy build requirements
export {};
