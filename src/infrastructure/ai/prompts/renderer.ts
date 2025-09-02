/**
 * Template renderer with variable substitution
 */

import yaml from 'js-yaml'
import type { Logger } from '../../domain/types/index.js'
import type { PromptTemplateType } from '../types.js'

/**
 * Render result structure
 */
export interface RenderResult {
  system: string
  user: string
  metadata: {
    templateId: string
    version: string
    variables: Record<string, string>
    missingVariables: string[]
    defaultsUsed: string[]
  }
}

interface RendererOptions {
  strictMode?: boolean
  escapeHtml?: boolean
}

/**
 * Template renderer
 */
export class PromptRenderer {
  private readonly logger: Logger
  private readonly options: Required<RendererOptions>

  constructor(logger: Logger, options: RendererOptions = {}) {
    this.logger = logger.child({ component: 'PromptRenderer' })
    this.options = {
      strictMode: options.strictMode !== false,
      escapeHtml: options.escapeHtml || false
    }
  }

  /**
   * Render a template with variables
   */
  render(template: PromptTemplateType, variables: Record<string, any> = {}): RenderResult {

    const metadata = {
      templateId: template.id,
      version: template.version,
      variables: {} as Record<string, string>,
      missingVariables: [] as string[],
      defaultsUsed: [] as string[]
    }

    // Build variable map with defaults
    const varMap = this.buildVariableMap(template, variables, metadata)

    // Check for missing required variables in strict mode
    if (this.options.strictMode && metadata.missingVariables.length > 0) {
      const error = new Error(
        `Missing required variables: ${metadata.missingVariables.join(', ')}`
      ) as any
      error.templateId = template.id
      error.missingVariables = metadata.missingVariables
      throw error
    }

    // Render prompts
    const system = this.renderString(template.system, varMap)
    const user = this.renderString(template.user, varMap)

    // Add examples if present
    const userWithExamples = this.addExamples(user, template.examples, varMap)

    this.logger.debug({
      templateId: template.id,
      variableCount: Object.keys(varMap).length,
      defaultsUsed: metadata.defaultsUsed.length,
      missingVariables: metadata.missingVariables.length
    }, 'Rendered prompt template')

    return {
      system,
      user: userWithExamples,
      metadata
    }
  }

  /**
   * Build variable map with defaults
   */
  private buildVariableMap(
    template: PromptTemplateType,
    provided: Record<string, any>,
    metadata: RenderResult['metadata']
  ): Record<string, string> {
    const varMap: Record<string, string> = {}

    for (const varDef of template.variables || []) {
      if (provided[varDef.name] !== undefined && provided[varDef.name] !== null) {
        // Use provided value
        varMap[varDef.name] = String(provided[varDef.name])
        metadata.variables[varDef.name] = varMap[varDef.name]!

      } else if (varDef.default !== undefined) {
        // Use default value
        varMap[varDef.name] = varDef.default
        metadata.defaultsUsed.push(varDef.name)
        metadata.variables[varDef.name] = varMap[varDef.name]!

      } else if (varDef.required) {
        // Missing required variable
        metadata.missingVariables.push(varDef.name)
      }
    }

    // Add extra provided variables
    for (const [key, value] of Object.entries(provided)) {
      if (!varMap[key] && value !== undefined && value !== null) {
        varMap[key] = String(value)
      }
    }

    // Add system variables
    const now = new Date()
    varMap['timestamp'] = now.toISOString()
    varMap['date'] = now.toLocaleDateString()
    varMap['time'] = now.toLocaleTimeString()
    varMap['year'] = String(now.getFullYear())
    varMap['month'] = String(now.getMonth() + 1).padStart(2, '0')
    varMap['day'] = String(now.getDate()).padStart(2, '0')

    return varMap
  }

  /**
   * Render a string with variable substitution
   */
  private renderString(template: string, variables: Record<string, string>): string {
    if (!template) return ''

    let result = template

    // Replace {{variable}} syntax
    result = result.replace(
      /\{\{(\w+)\}\}/g,
      (match, varName) => {
        const value = variables[varName]
        if (value !== undefined) {
          return this.options.escapeHtml ? this.escapeHtml(value) : value
        }

        // In non-strict mode, leave unmatched variables as-is
        if (!this.options.strictMode) {
          return match
        }

        // In strict mode, replace with empty string
        this.logger.warn({ varName }); // Fixed logger call
        return ''
      }
    )

    // Replace ${variable} syntax (alternative)
    result = result.replace(
      /\$\{(\w+)\}/g,
      (match, varName) => {
        const value = variables[varName]
        if (value !== undefined) {
          return this.options.escapeHtml ? this.escapeHtml(value) : value
        }
        return this.options.strictMode ? '' : match
      }
    )

    // Handle conditionals
    result = this.renderConditionals(result, variables)

    // Handle loops
    result = this.renderLoops(result, variables)

    // Handle unless blocks
    result = this.renderUnless(result, variables)

    return result
  }

  /**
   * Render conditional blocks: {{#if variable}}...{{/if}}
   */
  private renderConditionals(template: string, variables: Record<string, string>): string {
    // Handle nested conditionals by processing from innermost
    const maxIterations = 10
    let iterations = 0

    while (template.includes('{{#if ') && iterations < maxIterations) {
      template = template.replace(
        /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_match, varName, content) => {
          const value = variables[varName]

          // Check for truthy value
          if (value && value !== 'false' && value !== '0' && value !== '') {
            return this.renderString(content, variables)
          }
          return ''
        }
      )
      iterations++
    }

    return template
  }

  /**
   * Render unless blocks: {{#unless variable}}...{{/unless}}
   */
  private renderUnless(template: string, variables: Record<string, string>): string {
    return template.replace(
      /\{\{#unless (\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
      (_match, varName, content) => {
        const value = variables[varName]

        // Check for falsy value
        if (!value || value === 'false' || value === '0' || value === '') {
          return this.renderString(content, variables)
        }
        return ''
      }
    )
  }

  /**
   * Render loop blocks: {{#each array}}...{{/each}}
   */
  private renderLoops(template: string, variables: Record<string, string>): string {
    return template.replace(
      /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
      (_match, varName, content) => {
        const value = variables[varName]
        if (!value) return ''

        try {
          // Parse array if it's a string
          const array = typeof value === 'string' ? JSON.parse(value) : value

          if (!Array.isArray(array)) {
            this.logger.warn({ varName, type: typeof array }); // Fixed logger call
            return ''
          }

          return array.map((item, index) => {
            const itemVars: Record<string, string> = {
              ...variables,
              item: typeof item === 'object' ? JSON.stringify(item) : String(item),
              index: String(index),
              first: index === 0 ? 'true' : '',
              last: index === array.length - 1 ? 'true' : ''
            }

            // If item is an object, add its properties as variables
            if (typeof item === 'object' && item !== null) {
              for (const [key, val] of Object.entries(item)) {
                itemVars[key] = val !== null && val !== undefined ? String(val) : ''
              }
            }

            return this.renderString(content, itemVars)
          }).join('')

        } catch (error) {
          this.logger.warn({
            varName,
            error: (error as Error).message
          }, 'Failed to process array in each loop')
          return ''
        }
      }
    )
  }

  /**
   * Add examples to the user prompt
   */
  private addExamples(
    userPrompt: string,
    examples: PromptTemplateType['examples'],
    variables: Record<string, string>
  ): string {
    if (!examples || examples.length === 0) {
      return userPrompt
    }

    const exampleTexts = examples.map((example, index) => {
      // Render input variables
      const inputStr = Object.entries(example.input)
        .map(([key, value]) => {
          const rendered = this.renderString(value, variables)
          return `${key}: ${rendered}`
        })
        .join('\n')

      // Render output
      const outputStr = this.renderString(example.output, variables)

      return `Example ${index + 1}:\n\nInput:\n${inputStr}\n\nExpected Output:\n${outputStr}`
    })

    const examplesSection = `\n\n## Examples\n\n${exampleTexts.join('\n\n---\n\n')}`

    return userPrompt + examplesSection
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    }

    return str.replace(/[&<>"'/]/g, char => escapeMap[char] || char)
  }

  /**
   * Validate rendered output
   */
  validateOutput(rendered: string, format: string): {
    valid: boolean
    warnings: string[]
  } {
    const validation = {
      valid: true,
      warnings: [] as string[]
    }

    // Check for unresolved variables
    const unresolvedPattern = /\{\{(\w+)\}\}/g
    const unresolved: string[] = []
    let match

    while ((match = unresolvedPattern.exec(rendered)) !== null) {
      unresolved.push(match[1]!)
    }

    if (unresolved.length > 0) {
      validation.warnings.push(`Unresolved variables: ${unresolved.join(', ')}`)
    }

    // Format-specific validation
    if (format === 'json') {
      try {
        JSON.parse(rendered)
      } catch (error) {
        validation.valid = false
        validation.warnings.push(`Invalid JSON output: ${(error as Error).message}`)
      }
    }

    if (format === 'yaml' || format === 'kubernetes') {
      try {
        yaml.load(rendered)
      } catch (error) {
        validation.valid = false
        validation.warnings.push(`Invalid YAML output: ${(error as Error).message}`)
      }
    }

    return validation
  }
}


