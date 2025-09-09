/**
 * Simple Template System - Public Exports
 *
 * Simplified template system replacing the over-engineered PromptRegistry
 */

export { SimpleTemplateEngine } from './simple-template-engine';
export { createTemplateEngine } from './factory';
export { PromptRegistryCompatAdapter } from './compatibility-adapter';

export type { SimpleTemplate } from './simple-template-engine';
export type { TemplateEngineConfig } from './factory';
export type { TemplateContext } from './compatibility-adapter';
