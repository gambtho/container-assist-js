/**
 * @fileoverview Barrel file for the `resolve_base_images` tool.
 * This file serves as the public interface for the resolve base images tool module,
 * primarily exporting the handler. This handler is responsible for resolving
 * and recommending appropriate base images for containers.
 *
 * Consuming modules should import from this barrel file to access
 * the resolve base images tool's capabilities.
 * @module src/application/tools/resolve-base-images/index
 */

export { default } from './resolve-base-images';
