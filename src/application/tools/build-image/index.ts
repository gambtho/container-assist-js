/**
 * @fileoverview Barrel file for the `build_image` tool.
 * This file serves as the public interface for the build image tool module,
 * primarily exporting the handler. This handler is responsible for building
 * Docker images from Dockerfiles with proper tagging and build arguments.
 *
 * Consuming modules should import from this barrel file to access
 * the build image tool's capabilities.
 * @module src/application/tools/build-image/index
 */

export { default } from './build-image';
