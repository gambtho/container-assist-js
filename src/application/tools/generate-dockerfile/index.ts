/**
 * @fileoverview Barrel file for the `generate_dockerfile` tool.
 * This file serves as the public interface for the generate dockerfile tool module,
 * primarily exporting the handler. This handler is responsible for generating
 * Dockerfiles based on repository analysis and project configuration.
 *
 * Consuming modules should import from this barrel file to access
 * the generate dockerfile tool's capabilities.
 * @module src/application/tools/generate-dockerfile/index
 */

export { default } from './generate-dockerfile';
