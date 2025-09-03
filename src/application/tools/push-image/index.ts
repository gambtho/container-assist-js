/**
 * @fileoverview Barrel file for the `push_image` tool.
 * This file serves as the public interface for the push image tool module,
 * primarily exporting the handler. This handler is responsible for pushing
 * Docker images to container registries with authentication and retry logic.
 *
 * Consuming modules should import from this barrel file to access
 * the push image tool's capabilities.
 * @module src/application/tools/push-image/index
 */

export { default } from './push-image.js';
