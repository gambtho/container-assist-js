/**
 * Deploy Application Tool
 *
 * Exports the tool implementation and schema for co-located access
 */

export { deployApplication, deployApplicationTool } from './tool';
export { deployApplicationSchema, type DeployApplicationParams } from './schema';
export type { DeployApplicationConfig, DeployApplicationResult } from './tool';
