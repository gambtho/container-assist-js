/**
 * Legacy Configuration Bridge
 * 
 * This file maintains backward compatibility with the old configuration system
 * while using the new unified configuration under the hood.
 * 
 * @deprecated Use the unified configuration from 'src/config' instead
 */

import { config as unifiedConfig, type ApplicationConfig, ConfigHelpers } from '../../config/index.js'

// Re-export legacy types for backward compatibility
export type NodeEnv = 'development' | 'production' | 'test'
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'
export type WorkflowMode = 'interactive' | 'auto' | 'batch'

export interface ConfigOptions {
  nodeEnv?: NodeEnv
  logLevel?: LogLevel
  workflowMode?: WorkflowMode
  [key: string]: any
}

/**
 * Legacy Config class that wraps the unified configuration
 * @deprecated Use ApplicationConfig from src/config instead
 */
export class Config {
  private _config: ApplicationConfig

  // Server settings
  public readonly nodeEnv: NodeEnv
  public readonly logLevel: LogLevel

  // MCP settings
  public readonly storePath: string
  public readonly sessionTTL: string
  public readonly maxSessions: number

  // Workspace settings
  public readonly workspaceDir: string

  // Docker settings
  public readonly dockerSocket: string
  public readonly dockerRegistry: string

  // Kubernetes settings
  public readonly kubeconfig: string
  public readonly k8sNamespace: string

  // Java-specific settings
  public readonly defaultJavaVersion: string
  public readonly defaultJvmHeapPercentage: number
  public readonly enableNativeImage: boolean

  // AI settings (optional)
  public readonly aiApiKey: string
  public readonly aiModel: string
  public readonly aiBaseUrl: string

  // Workflow settings
  public readonly workflowMode: WorkflowMode
  public readonly autoRetry: boolean
  public readonly maxRetries: number

  constructor(options: ConfigOptions = {}) {
    // Use the unified configuration
    this._config = unifiedConfig

    // Map unified config to legacy properties
    this.nodeEnv = this._config.server.nodeEnv
    this.logLevel = this._config.server.logLevel
    
    this.storePath = this._config.mcp.storePath
    this.sessionTTL = this._config.mcp.sessionTTL
    this.maxSessions = this._config.mcp.maxSessions
    
    this.workspaceDir = this._config.workspace.workspaceDir
    
    this.dockerSocket = this._config.infrastructure.docker.socketPath
    this.dockerRegistry = this._config.infrastructure.docker.registry
    
    this.kubeconfig = this._config.infrastructure.kubernetes.kubeconfig
    this.k8sNamespace = this._config.infrastructure.kubernetes.namespace
    
    this.defaultJavaVersion = this._config.infrastructure.java.defaultVersion
    this.defaultJvmHeapPercentage = this._config.infrastructure.java.defaultJvmHeapPercentage
    this.enableNativeImage = this._config.infrastructure.java.enableNativeImage
    
    this.aiApiKey = this._config.aiServices.ai.apiKey
    this.aiModel = this._config.aiServices.ai.model
    this.aiBaseUrl = this._config.aiServices.ai.baseUrl
    
    this.workflowMode = this._config.workflow.mode
    this.autoRetry = this._config.workflow.autoRetry
    this.maxRetries = this._config.workflow.maxRetries
  }

  isProduction(): boolean {
    return ConfigHelpers.isProduction(this._config)
  }

  isDevelopment(): boolean {
    return ConfigHelpers.isDevelopment(this._config)
  }

  isTest(): boolean {
    return ConfigHelpers.isTest(this._config)
  }

  hasAIEnabled(): boolean {
    return ConfigHelpers.hasAI(this._config)
  }

  getSessionTTLMs(): number {
    return ConfigHelpers.parseTTL(this.sessionTTL)
  }

  toJSON(): Record<string, any> {
    return {
      nodeEnv: this.nodeEnv,
      logLevel: this.logLevel,
      workflowMode: this.workflowMode,
      hasAI: this.hasAIEnabled(),
      maxSessions: this.maxSessions,
      maxRetries: this.maxRetries,
      // Don't expose sensitive values
      aiApiKey: this.aiApiKey ? '[REDACTED]' : ''
    }
  }
}

// Export singleton instance for backward compatibility
export const config = new Config()

// Also export the unified configuration for gradual migration
export { unifiedConfig as applicationConfig } from '../../config/index.js'
export type { ApplicationConfig } from '../../config/index.js'