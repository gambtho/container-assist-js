/**
 * @fileoverview Barrel file for the `analyze_repository` tool.
 * This file serves as the public interface for the analyze repository tool module,
 * primarily exporting the handler. This handler is responsible for analyzing
 * repository structure and detecting language, framework, and build system.
 *
 * Consuming modules should import from this barrel file to access
 * the analyze repository tool's capabilities.
 * @module src/application/tools/analyze-repo/index
 */

export { default } from './analyze-repo';
