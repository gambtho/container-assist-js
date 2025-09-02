/**
 * Environment Variable Parser
 * 
 * Handles parsing environment variables into typed configuration values
 * with proper validation and type coercion.
 */

import type { ApplicationConfig } from './types.js'
import { ENVIRONMENT_MAPPING, LEGACY_ENV_MAPPING } from './env-mapping.js'

export interface ParseResult {
  config: Partial<ApplicationConfig>
  warnings: string[]
  errors: string[]
}

export class EnvironmentParser {
  private warnings: string[] = []
  private errors: string[] = []

  /**
   * Parse environment variables into configuration object
   */
  parse(): ParseResult {
    this.warnings = []
    this.errors = []

    const config: any = {}

    // Process each environment variable mapping
    for (const [envVar, mapping] of Object.entries(ENVIRONMENT_MAPPING)) {
      const value = this.getEnvironmentValue(envVar)
      
      if (value === undefined) {
        if (mapping.required) {
          this.errors.push(`Required environment variable ${envVar} is not set`)
        }
        continue
      }

      try {
        const parsedValue = this.parseValue(value, mapping.type)
        this.setNestedValue(config, mapping.path, parsedValue)
      } catch (error) {
        this.errors.push(`Invalid value for ${envVar}: ${error.message}`)
      }
    }

    // Check for deprecated environment variables
    this.checkDeprecatedVariables()

    return {
      config: config as Partial<ApplicationConfig>,
      warnings: this.warnings,
      errors: this.errors
    }
  }

  /**
   * Get environment variable value, checking legacy mappings first
   */
  private getEnvironmentValue(envVar: string): string | undefined {
    // Check if there's a legacy mapping
    if (LEGACY_ENV_MAPPING[envVar]) {
      const newVar = LEGACY_ENV_MAPPING[envVar]
      if (process.env[newVar]) {
        this.warnings.push(
          `Using legacy environment variable ${envVar}. Please migrate to ${newVar}`
        )
        return process.env[newVar]
      }
    }

    return process.env[envVar]
  }

  /**
   * Parse string value to appropriate type
   */
  private parseValue(value: string, type: string): any {
    switch (type) {
      case 'string':
        return value
      
      case 'number':
        const num = Number(value)
        if (isNaN(num)) {
          throw new Error(`"${value}" is not a valid number`)
        }
        return num
      
      case 'boolean':
        const lower = value.toLowerCase()
        if (lower === 'true' || lower === '1') return true
        if (lower === 'false' || lower === '0') return false
        throw new Error(`"${value}" is not a valid boolean (use true/false or 1/0)`)
      
      default:
        throw new Error(`Unknown type: ${type}`)
    }
  }

  /**
   * Set nested object value using dot notation path
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    let current = obj

    // Navigate to the parent of the final key
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current)) {
        current[key] = {}
      }
      current = current[key]
    }

    // Set the final value
    const finalKey = keys[keys.length - 1]
    current[finalKey] = value
  }

  /**
   * Check for deprecated environment variables and warn
   */
  private checkDeprecatedVariables(): void {
    const deprecatedVars = [
      'MCP_SERVER_PORT',
      'CONTAINER_KIT_WORKSPACE',
      'DOCKER_API_URL'
    ]

    for (const varName of deprecatedVars) {
      if (process.env[varName]) {
        this.warnings.push(
          `Environment variable ${varName} is deprecated and will be ignored`
        )
      }
    }
  }

  /**
   * Validate configuration values
   */
  validateConfig(config: Partial<ApplicationConfig>): string[] {
    const errors: string[] = []

    // Validate NodeEnv
    if (config.server?.nodeEnv && 
        !['development', 'production', 'test'].includes(config.server.nodeEnv)) {
      errors.push('server.nodeEnv must be one of: development, production, test')
    }

    // Validate LogLevel
    if (config.server?.logLevel && 
        !['error', 'warn', 'info', 'debug', 'trace'].includes(config.server.logLevel)) {
      errors.push('server.logLevel must be one of: error, warn, info, debug, trace')
    }

    // Validate session TTL format
    if (config.mcp?.sessionTTL && !this.isValidTTL(config.mcp.sessionTTL)) {
      errors.push('session.ttl must be in format like "24h", "30m", or "3600s"')
    }

    // Validate port numbers
    if (config.server?.port && (config.server.port < 1 || config.server.port > 65535)) {
      errors.push('server.port must be between 1 and 65535')
    }

    // Validate percentage values
    if (config.infrastructure?.java?.defaultJvmHeapPercentage) {
      const pct = config.infrastructure.java.defaultJvmHeapPercentage
      if (pct < 10 || pct > 95) {
        errors.push('java.defaultJvmHeapPercentage must be between 10 and 95')
      }
    }

    // Validate timeout values
    if (config.aiServices?.ai?.timeout && config.aiServices.ai.timeout < 1000) {
      errors.push('ai.timeout must be at least 1000ms')
    }

    // Validate retry attempts
    if (config.workflow?.maxRetries && config.workflow.maxRetries < 0) {
      errors.push('workflow.maxRetries must be non-negative')
    }

    return errors
  }

  /**
   * Check if TTL string is valid (e.g., "24h", "30m", "3600s")
   */
  private isValidTTL(ttl: string): boolean {
    return /^\d+(h|m|s)$/.test(ttl)
  }

  /**
   * Get all environment variable names that would be parsed
   */
  static getEnvironmentVariableNames(): string[] {
    return Object.keys(ENVIRONMENT_MAPPING)
  }

  /**
   * Generate documentation for environment variables
   */
  static generateEnvDocumentation(): string {
    let doc = '# Environment Variables\n\n'
    
    const grouped = this.groupEnvironmentVariables()
    
    for (const [category, vars] of Object.entries(grouped)) {
      doc += `## ${category}\n\n`
      
      for (const [envVar, mapping] of vars) {
        doc += `### ${envVar}\n`
        if (mapping.description) {
          doc += `${mapping.description}\n\n`
        }
        doc += `- **Type**: ${mapping.type}\n`
        doc += `- **Required**: ${mapping.required ? 'Yes' : 'No'}\n`
        if (mapping.default !== undefined) {
          doc += `- **Default**: ${JSON.stringify(mapping.default)}\n`
        }
        doc += `- **Config Path**: \`${mapping.path}\`\n\n`
      }
    }
    
    return doc
  }

  /**
   * Group environment variables by category for documentation
   */
  private static groupEnvironmentVariables(): Record<string, Array<[string, any]>> {
    const groups: Record<string, Array<[string, any]>> = {
      'Server Configuration': [],
      'MCP Configuration': [],
      'Docker Configuration': [],
      'Kubernetes Configuration': [],
      'AI Services': [],
      'Workflow Configuration': [],
      'Feature Flags': [],
      'Development & Testing': []
    }

    for (const [envVar, mapping] of Object.entries(ENVIRONMENT_MAPPING)) {
      if (envVar.startsWith('NODE_ENV') || envVar.startsWith('CONTAINERKIT_')) {
        groups['Server Configuration'].push([envVar, mapping])
      } else if (envVar.startsWith('MCP_') || envVar.startsWith('SESSION_')) {
        groups['MCP Configuration'].push([envVar, mapping])
      } else if (envVar.startsWith('DOCKER_')) {
        groups['Docker Configuration'].push([envVar, mapping])
      } else if (envVar.startsWith('K8S_') || envVar.startsWith('KUBECONFIG')) {
        groups['Kubernetes Configuration'].push([envVar, mapping])
      } else if (envVar.startsWith('AI_')) {
        groups['AI Services'].push([envVar, mapping])
      } else if (envVar.startsWith('WORKFLOW_') || envVar.startsWith('AUTO_') || envVar.startsWith('MAX_')) {
        groups['Workflow Configuration'].push([envVar, mapping])
      } else if (envVar.startsWith('ENABLE_') || envVar.startsWith('NON_')) {
        groups['Feature Flags'].push([envVar, mapping])
      } else if (envVar.startsWith('MOCK_') || envVar.startsWith('DEBUG_')) {
        groups['Development & Testing'].push([envVar, mapping])
      }
    }

    return groups
  }
}