/**
 * @fileoverview Barrel file for the `tag_image` tool.
 * This file serves as the public interface for the tag image tool module,
 * primarily exporting the handler. This handler is responsible for tagging
 * Docker images with appropriate version tags and metadata.
 *
 * Consuming modules should import from this barrel file to access
 * the tag image tool's capabilities.
 * @module src/application/tools/tag-image/index
 */

export { default } from './tag-image';
