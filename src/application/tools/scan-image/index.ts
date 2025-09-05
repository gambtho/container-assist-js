/**
 * @fileoverview Barrel file for the `scan_image` tool.
 * This file serves as the public interface for the scan image tool module,
 * primarily exporting the handler. This handler is responsible for scanning
 * Docker images for security vulnerabilities and generating recommendations.
 *
 * Consuming modules should import from this barrel file to access
 * the scan image tool's capabilities.
 * @module src/application/tools/scan-image/index
 */

export { default } from './scan-image';
