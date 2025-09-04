/**
 * @fileoverview Barrel file for the `generate_k8s_manifests` tool.
 * This file serves as the public interface for the generate Kubernetes manifests tool module,
 * primarily exporting the handler. This handler is responsible for generating
 * Kubernetes manifests based on repository analysis and project configuration.
 *
 * Consuming modules should import from this barrel file to access
 * the generate K8s manifests tool's capabilities.
 * @module src/application/tools/generate-k8s-manifests/index
 */

export { default } from './generate-k8s-manifests.js';
