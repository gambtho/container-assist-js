/**
 * @fileoverview Barrel file for the `fix_dockerfile` tool.
 * This file serves as the public interface for the fix dockerfile tool module,
 * primarily exporting the handler. This handler is responsible for analyzing
 * and fixing issues in existing Dockerfiles.
 *
 * Consuming modules should import from this barrel file to access
 * the fix dockerfile tool's capabilities.
 * @module src/application/tools/fix-dockerfile/index
 */

export { default } from './fix-dockerfile.js';
