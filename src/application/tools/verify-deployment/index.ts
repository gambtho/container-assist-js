/**
 * @fileoverview Barrel file for the `verify_deployment` tool.
 * This file serves as the public interface for the verify deployment tool module,
 * primarily exporting the handler. This handler is responsible for verifying
 * Kubernetes deployment health and retrieving service endpoints.
 *
 * Consuming modules should import from this barrel file to access
 * the verify deployment tool's capabilities.
 * @module src/application/tools/verify-deployment/index
 */

export { default } from './verify-deployment.js';
