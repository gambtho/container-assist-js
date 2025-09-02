/**
 * MCP Sampling client for AI integration
 */

import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import type { ZodSchema } from 'zod'
import type { Logger } from '../../domain/types/index.js'
import type { AIRequest, AIResponse } from './ai-types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface PromptTemplate {
  id: string
  name: string
  description?: string
  version?: string
  system: string
  user: string
  outputFormat?: string
  examples?: Array<{
    input: string
    output: string
  }>
}


export interface MCPServer {
  request(request: {
    method: string
    params: Record<string, unknown>
  }): Promise<unknown>
}

/**
 * Simple, focused interface for AI sampling
 */
export interface MCPSampler {
  sample<T = unknown>(request: AIRequest): Promise<AIResponse<T>>
}

/**
 * MCP Sampler implementation for AI-powered generation
 */
export class MCPSamplerImpl implements MCPSampler {
  private readonly server: MCPServer
  private readonly logger: Logger
  private readonly promptCache = new Map<string, PromptTemplate>()

  constructor(server: MCPServer, logger: Logger) {
    this.server = server
    this.logger = logger.child({ component: 'MCPSampler' })
  }

  async sample<T = unknown>(request: AIRequest): Promise<AIResponse<T>> {
    const startTime = Date.now()

    try {
      this.logger.info({
        templateId: request.templateId,
        variables: Object.keys(request.variables),
        format: request.format
      }, 'Requesting AI generation')

      const template = await this.loadTemplate(request.templateId)
      const rendered = this.renderTemplate(template, request.variables)

      // Build the sampling request
      const samplingRequest = {
        messages: [
          {
            role: 'system',
            content: rendered.system
          },
          {
            role: 'user',
            content: rendered.user
          }
        ],
        modelPreferences: {
          maxTokens: request.maxTokens || 2000,
          temperature: request.temperature || 0.2,
          topP: 0.95
        }
      }

      // Add examples if provided
      if (rendered.examples) {
        for (const example of rendered.examples) {
          samplingRequest.messages.push(
            { role: 'user', content: example.input },
            { role: 'assistant', content: example.output }
          )
        }
      }

      this.logger.debug({
        messageCount: samplingRequest.messages.length,
        maxTokens: samplingRequest.modelPreferences.maxTokens
      }, 'Sending sampling request')

      // Request generation from the host AI via MCP
      const response = await this.server.request({
        method: 'sampling/createMessage',
        params: samplingRequest
      }) as { content?: unknown; tokensUsed?: number }

      if (!response?.content) {
        throw new Error('Invalid sampling response from MCP host')
      }

      // Extract and process the response
      const content = this.extractContent(response, request.format || 'text')
      const duration = Date.now() - startTime

      this.logger.info({
        templateId: request.templateId,
        responseLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
        duration
      }, 'AI generation completed')

      return {
        success: true,
        content: content as T,
        metadata: {
          ...(response.tokensUsed !== undefined && { tokensUsed: response.tokensUsed }),
          duration
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : String(error)

      this.logger.error({
        error: errorMessage,
        templateId: request.templateId,
        duration
      }, 'AI sampling failed')

      return {
        success: false,
        content: null as T,
        error: error instanceof Error ? error : new Error(errorMessage),
        metadata: { duration }
      }
    }
  }

  private async loadTemplate(templateId: string): Promise<PromptTemplate> {
    // Check cache first
    if (this.promptCache.has(templateId)) {
      return this.promptCache.get(templateId)!
    }

    try {
      // Load from YAML file
      const templatePath = join(__dirname, 'prompts', 'templates', `${templateId}.yaml`)
      const content = await readFile(templatePath, 'utf8')
      const template = yaml.load(content) as PromptTemplate

      if (!template.system || !template.user) {
        throw new Error(`Invalid template structure for ${templateId}`)
      }

      // Ensure ID is set
      template.id = templateId

      this.promptCache.set(templateId, template)

      return template

    } catch (error) {
      const builtIn = this.getBuiltInTemplate(templateId)
      if (builtIn) {
        this.promptCache.set(templateId, builtIn)
        return builtIn
      }

      throw new Error(`Prompt template not found: ${templateId}`)
    }
  }

  private renderTemplate(template: PromptTemplate, variables: Record<string, any>): {
    system: string
    user: string
    examples?: Array<{ input: string; output: string }>
  } {
    const rendered = {
      system: this.interpolate(template.system, variables),
      user: this.interpolate(template.user, variables)
    }

    // Render examples if present
    if (template.examples) {
      return {
        ...rendered,
        examples: template.examples.map(example => ({
          input: this.interpolate(example.input, variables),
          output: this.interpolate(example.output, variables)
        }))
      }
    }

    return rendered
  }

  private interpolate(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in variables) {
        const value = variables[key]
        return value !== null && value !== undefined ? String(value) : ''
      }
      return match
    })
  }

  private extractContent(response: unknown, format: string): unknown {
    const responseObj = response as { content?: unknown }
    let content = responseObj.content

    // Handle different response formats
    if (typeof content === 'object' && content !== null) {
      const contentObj = content as { text?: unknown; content?: unknown }
      if (contentObj.text) {
        content = contentObj.text
      } else if (contentObj.content) {
        content = contentObj.content
      } else {
        content = JSON.stringify(content)
      }
    }

    // Clean up the content based on format
    if (format === 'dockerfile' || format === 'yaml' || format === 'kubernetes') {
      // Remove markdown code blocks if present
      if (typeof content === 'string') {
        content = (content).replace(/^```[a-z]*\n/gm, '')
        content = (content as string).replace(/\n```$/gm, '')
      }
    }

    if (format === 'json') {
      try {
        if (typeof content === 'string') {
          return JSON.parse(content)
        }
        return content
      } catch {
        // Return as-is if parsing fails
        return content
      }
    }

    return typeof content === 'string' ? content.trim() : content
  }

  private getBuiltInTemplate(templateId: string): PromptTemplate | null {
    const templates: Record<string, PromptTemplate> = {
      'repository-analysis': {
        id: 'repository-analysis',
        name: 'Universal Repository Analysis',
        description: 'AI-powered language and framework detection',
        system: `You are an expert software architect with deep knowledge of ALL programming languages,
frameworks, and build systems. Analyze repositories without bias toward any specific language.

Languages you support include but are not limited to:
- Backend: Java, Python, Node.js/TypeScript, Go, Rust, C#, Ruby, PHP, Scala, Kotlin
- Frontend: React, Vue, Angular, Svelte, Next.js, Nuxt.js
- Mobile: Swift, Kotlin, React Native, Flutter
- Data/ML: Python, R, Julia, Jupyter
- Systems: C, C++, Rust, Zig

Provide accurate, unbiased analysis focusing on the most likely language and framework.`,
        user: `Analyze this repository to identify the technology stack:

**File listing:**
{{fileList}}

**Configuration files:**
{{configFiles}}

**Directory structure:**
{{directoryTree}}

Determine:
1. Primary programming language and version
2. Framework and version (if applicable)
3. Build system and package manager
4. Dependencies and dev dependencies
5. Application entry points
6. Default ports based on framework
7. Recommended Docker base images
8. Containerization recommendations

Return ONLY valid JSON matching this structure:
{
  "language": "string",
  "languageVersion": "string or null",
  "framework": "string or null",
  "frameworkVersion": "string or null",
  "buildSystem": {
    "type": "string",
    "buildFile": "string",
    "buildCommand": "string or null",
    "testCommand": "string or null"
  },
  "dependencies": ["array of strings"],
  "devDependencies": ["array of strings"],
  "entryPoint": "string or null",
  "suggestedPorts": [array of numbers],
  "dockerConfig": {
    "baseImage": "recommended base image",
    "multistage": true/false,
    "nonRootUser": true/false
  }
}`,
        outputFormat: 'json'
      },

      'dockerfile-generation': {
        id: 'dockerfile-generation',
        name: 'Universal Dockerfile Generation',
        description: 'Generate optimized Dockerfiles for any technology stack',
        system: `You are a Docker expert specializing in containerizing applications in ANY programming language.
Generate production-ready, secure, and optimized Dockerfiles following these principles:

1. Use official base images with specific version tags (never 'latest')
2. Implement multi-stage builds when beneficial
3. Run as non-root user for security
4. Optimize layer caching for the specific build system
5. Minimize final image size
6. Include health checks where supported
7. Handle signals properly for graceful shutdown`,
        user: `Generate a production-ready Dockerfile for:

**Technology Stack:**
- Language: {{language}} {{languageVersion}}
- Framework: {{framework}} {{frameworkVersion}}
- Build System: {{buildSystem.type}}
- Entry Point: {{entryPoint}}
- Port: {{port}}

**Dependencies:**
- Production: {{dependencies}}
- Development: {{devDependencies}}

**Requirements:**
1. Optimize for {{language}} best practices
2. Use multi-stage build if it reduces image size
3. Configure for port {{port}}
4. Add health check if supported by {{framework}}
5. Include security scanning labels

Generate ONLY the Dockerfile content without explanation.`,
        outputFormat: 'dockerfile'
      }
    }

    return templates[templateId] || null
  }

  /**
   * Sample with structured output using Zod schema
   * This wraps the regular sample method and validates the output
   */
  async sampleStructured<T>(request: AIRequest, schema: ZodSchema<T>): Promise<AIResponse<T>> {
    // Request JSON format for structured output
    const structuredRequest = {
      ...request,
      format: 'json' as const
    }

    // Sample the response
    const response = await this.sample<unknown>(structuredRequest)

    if (!response.success) {
      return response as AIResponse<T>
    }

    try {
      // Parse and validate with the schema
      const parsed = schema.parse(response.content)
      return {
        ...response,
        content: parsed
      }
    } catch (error) {
      return {
        success: false,
        content: null as any,
        error: error instanceof Error ? error : new Error('Schema validation failed')
      }
    }
  }
}

// Re-export types for backward compatibility
export type { AIRequest, AIResponse } from './ai-types.js'

