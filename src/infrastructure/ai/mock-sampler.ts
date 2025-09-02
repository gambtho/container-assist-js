/**
 * Mock MCP Sampler for testing
 */

import { readFile } from 'fs/promises'
import { readdir } from 'fs/promises'
import { join } from 'path'
import type { Logger } from '../../domain/types/index.js'
import {
  SamplingRequest,
  SamplingResponse,
  MCPSamplingError,
  AIRequest,
  AIResponse,
  MCPSampler,
  SamplingRequestType,
  SamplingResponseType
} from './ai-types.js'
import { ok, fail, type Result } from '../../domain/types/result.js'

interface MockConfig {
  responsesDir?: string
  deterministicMode?: boolean
  simulateLatency?: boolean
  latencyMs?: { min: number; max?: number }
  errorRate?: number
}

/**
 * Mock sampler implementation for testing
 */
export class MockMCPSampler implements MCPSampler {
  private readonly logger: Logger
  private readonly config: Required<MockConfig>
  private readonly responses: Map<string, string> = new Map()
  private callCount: number = 0

  constructor(logger: Logger, config: MockConfig = {}) {
    this.logger = logger.child({ component: 'MockMCPSampler' })
    this.config = {
      responsesDir: config.responsesDir || '',
      deterministicMode: config.deterministicMode !== false,
      simulateLatency: config.simulateLatency || false,
      latencyMs: config.latencyMs || { min: 100, max: 500 },
      errorRate: config.errorRate || 0,
      ...config
    } as Required<MockConfig>

    this.initializeResponses()
  }

  /**
   * Sample with mock response (new interface)
   */
  async sample<T = any>(request: AIRequest): Promise<AIResponse<T>> {
    this.callCount++

    const requestId = `mock-${Date.now()}-${this.callCount}`

    this.logger.info({
      requestId,
      templateId: request.templateId,
      callCount: this.callCount,
      deterministicMode: this.config.deterministicMode
    }, 'Mock sampling request')

    // Simulate latency if configured
    if (this.config.simulateLatency) {
      const delay = this.randomBetween(
        this.config.latencyMs.min,
        this.config.latencyMs.max
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Simulate errors if configured
    if (this.config.errorRate > 0 && Math.random() < this.config.errorRate) {
      this.logger.warn({ requestId }, 'Mock sampler simulated error')
      return {
        success: false,
        content: null as any,
        error: new MCPSamplingError(
          'Mock sampler simulated error',
          null,
          request.templateId,
          true
        )
      }
    }

    try {
      // Get mock response
      let content = this.responses.get(request.templateId)

      if (!content) {
        // Generate generic response if not found
        content = this.generateGenericResponse(request)
      }

      // Apply variations if not in deterministic mode
      if (!this.config.deterministicMode) {
        content = this.applyVariations(content, request.variables)
      }

      // Convert to requested format if needed
      if (request.format === 'json' && !this.isJson(content)) {
        content = JSON.stringify({
          generated: true,
          content: content,
          templateId: request.templateId
        }, null, 2)
      }

      this.logger.info({
        requestId,
        contentLength: content.length
      }, 'Mock sampling completed')

      return {
        success: true,
        content: content as T,
        metadata: {
          tokensUsed: 100 + Math.floor(Math.random() * 50),
          duration: this.config.simulateLatency ? this.randomBetween(100, 500) : 10,
          retryCount: 0
        }
      }

    } catch (error) {
      this.logger.error({
        requestId,
        error: (error as Error).message
      }, 'Mock sampling failed')

      return {
        success: false,
        content: null as any,
        error: new MCPSamplingError(
          `Mock sampling failed: ${(error as Error).message}`,
          error as Error,
          request.templateId,
          false
        )
      }
    }
  }

  /**
   * Sample with mock response (legacy interface)
   */
  async sampleLegacy(request: SamplingRequestType): Promise<Result<SamplingResponseType>> {
    const validated = SamplingRequest.parse(request)
    this.callCount++

    const requestId = `mock-${Date.now()}-${this.callCount}`

    this.logger.info({
      requestId,
      templateId: validated.templateId,
      callCount: this.callCount,
      deterministicMode: this.config.deterministicMode
    }, 'Mock sampling request')

    // Simulate latency if configured
    if (this.config.simulateLatency) {
      const delay = this.randomBetween(
        this.config.latencyMs.min,
        this.config.latencyMs.max
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Simulate errors if configured
    if (this.config.errorRate > 0 && Math.random() < this.config.errorRate) {
      this.logger.warn({ requestId }, 'Mock sampler simulated error')
      return fail(
        new MCPSamplingError(
          'Mock sampler simulated error',
          null,
          validated.templateId,
          true
        )
      )
    }

    try {
      // Get mock response
      let content = this.responses.get(validated.templateId)

      if (!content) {
        // Generate generic response if not found
        content = this.generateGenericResponseLegacy(validated)
      }

      // Apply variations if not in deterministic mode
      if (!this.config.deterministicMode) {
        content = this.applyVariations(content, validated.variables)
      }

      // Convert to requested format if needed
      if (validated.format === 'json' && !this.isJson(content)) {
        content = JSON.stringify({
          generated: true,
          content: content,
          templateId: validated.templateId
        }, null, 2)
      }

      const response = SamplingResponse.parse({
        content,
        format: validated.format,
        tokenUsage: {
          prompt: 100 + Math.floor(Math.random() * 50),
          completion: 200 + Math.floor(Math.random() * 100),
          total: 300 + Math.floor(Math.random() * 150)
        },
        model: 'mock-model-v1',
        metadata: {
          mock: true,
          callCount: this.callCount,
          requestId
        }
      })

      this.logger.info({
        requestId,
        contentLength: content.length
      }, 'Mock sampling completed')

      return ok(response, {
        requestId,
        mock: true
      })

    } catch (error) {
      this.logger.error({
        requestId,
        error: (error as Error).message
      }, 'Mock sampling failed')

      return fail(
        new MCPSamplingError(
          `Mock sampling failed: ${(error as Error).message}`,
          error as Error,
          validated.templateId,
          false
        )
      )
    }
  }

  /**
   * Initialize mock responses
   */
  private async initializeResponses(): Promise<void> {
    // Load default responses
    this.loadDefaultResponses()

    // Load from directory if configured
    if (this.config.responsesDir) {
      try {
        await this.loadResponsesFromDir(this.config.responsesDir)
      } catch (error) {
        this.logger.warn({
          error: (error as Error).message,
          dir: this.config.responsesDir
        }, 'Failed to load mock responses from directory')
      }
    }
  }

  /**
   * Load default mock responses
   */
  private loadDefaultResponses(): void {
    // Repository analysis response
    this.responses.set('repository-analysis', `{
      "language": "javascript",
      "languageVersion": "18.0.0",
      "framework": "express",
      "frameworkVersion": "4.18.2",
      "buildSystem": {
        "type": "npm",
        "buildFile": "package.json",
        "buildCommand": "npm run build",
        "testCommand": "npm test"
      },
      "dependencies": ["express", "cors", "helmet"],
      "devDependencies": ["jest", "nodemon", "@types/node"],
      "entryPoint": "server.js",
      "suggestedPorts": [3000, 8000],
      "dockerConfig": {
        "baseImage": "node:18-slim",
        "multistage": true,
        "nonRootUser": true
      }
    }`)

    // Dockerfile generation response
    this.responses.set('dockerfile-generation', `FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-slim
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .
EXPOSE 3000
USER appuser
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["node", "server.js"]`)

    // Dockerfile fix response
    this.responses.set('dockerfile-fix', `FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-slim
WORKDIR /app
RUN apt-get update && \\
    apt-get install -y --no-install-recommends curl && \\
    rm -rf /var/lib/apt/lists/* && \\
    groupadd -r appuser && \\
    useradd -r -g appuser appuser

COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .

EXPOSE 3000
USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "server.js"]`)

    // K8s generation response
    this.responses.set('k8s-generation', `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  labels:
    app: app
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
        version: v1
    spec:
      containers:
      - name: app
        image: app:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: app
  labels:
    app: app
spec:
  type: ClusterIP
  selector:
    app: app
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http`)

    // Error analysis response
    this.responses.set('error-analysis', `The error appears to be caused by missing dependencies in the build process.

Root Cause:
- The package registry is not accessible or the dependency versions are incorrect
- The build cache may be corrupted

Recommended Fix:
1. Clear the build cache: npm cache clean --force
2. Update the package.json with correct dependency versions
3. Use npm ci for consistent installs
4. Add proper error handling in the Dockerfile`)

    // Optimization suggestion response
    this.responses.set('optimization-suggestion', `Optimization Recommendations:

1. Image Size Reduction:
   - Use Alpine or distroless base images
   - Remove unnecessary build dependencies
   - Combine RUN commands to reduce layers

2. Build Performance:
   - Use Docker BuildKit for parallel builds
   - Implement proper layer caching
   - Use .dockerignore to exclude unnecessary files

3. Security Improvements:
   - Scan for vulnerabilities with npm audit
   - Use specific version tags instead of 'latest'
   - Implement least-privilege principles`)
  }

  /**
   * Load responses from directory
   */
  private async loadResponsesFromDir(dir: string): Promise<void> {
    const files = await readdir(dir)

    for (const file of files) {
      if (!file.endsWith('.txt') && !file.endsWith('.yaml')) continue

      const templateId = file.replace(/\.(txt|yaml)$/, '')
      const content = await readFile(join(dir, file), 'utf8')

      this.responses.set(templateId, content)
      this.logger.debug({ templateId, file }, 'Loaded response file')
    }

    this.logger.info({
      count: this.responses.size
    }, 'Mock responses loaded')
  }

  /**
   * Generate generic response
   */
  private generateGenericResponse(request: AIRequest): string {
    const responses: Record<string, string> = {
      'error-analysis': `Error Analysis for ${request.variables.error || 'unknown error'}:
The issue appears to be configuration-related.
Please check your environment variables and dependencies.`,

      'optimization-suggestion': `Optimization Suggestions:
1. Reduce image size by using multi-stage builds
2. Implement proper caching strategies
3. Use health checks for better reliability`,

      'repository-analysis': `{
        "language": "unknown",
        "framework": null,
        "buildSystem": {
          "type": "unknown",
          "buildFile": "unknown"
        },
        "dependencies": [],
        "suggestedPorts": [8080],
        "dockerConfig": {
          "baseImage": "ubuntu:22.04",
          "multistage": false,
          "nonRootUser": true
        }
      }`
    }

    return responses[request.templateId] ||
           `Mock response for template: ${request.templateId}
Variables: ${JSON.stringify(request.variables, null, 2)}`
  }

  /**
   * Generate generic response (legacy)
   */
  private generateGenericResponseLegacy(request: SamplingRequestType): string {
    const responses: Record<string, string> = {
      'error-analysis': `Error Analysis for ${request.variables.error || 'unknown error'}:
The issue appears to be configuration-related.
Please check your environment variables and dependencies.`,

      'optimization-suggestion': `Optimization Suggestions:
1. Reduce image size by using multi-stage builds
2. Implement proper caching strategies
3. Use health checks for better reliability`
    }

    return responses[request.templateId] ||
           `Mock response for template: ${request.templateId}
Variables: ${JSON.stringify(request.variables, null, 2)}`
  }

  /**
   * Apply variations based on variables
   */
  private applyVariations(content: string, variables: Record<string, any>): string {
    let result = content

    // Language-specific variations
    if (variables.language) {
      const langMap: Record<string, { base: string; ext?: string; cmd?: string }> = {
        'python': {
          base: 'python:3.11',
          ext: '.py',
          cmd: 'python'
        },
        'node': {
          base: 'node:18',
          ext: '.js',
          cmd: 'node'
        },
        'go': {
          base: 'golang:1.21',
          ext: '.go',
          cmd: 'go run'
        }
      }

      const lang = langMap[variables.language.toLowerCase()]
      if (lang) {
        result = result.replace(/node:\d+[-\w]*/g, lang.base)
        result = result.replace(/\.js/g, lang.ext)
        result = result.replace(/node /g, lang.cmd + ' ')
      }
    }

    // Framework-specific variations
    if (variables.framework) {
      const frameworkPorts: Record<string, string> = {
        'express': '3000',
        'fastapi': '8000',
        'django': '8000',
        'flask': '5000',
        'gin': '8080'
      }

      const port = frameworkPorts[variables.framework.toLowerCase()]
      if (port) {
        result = result.replace(/3000/g, port)
      }
    }

    // Build system variations
    if (variables.buildSystem) {
      const buildMap: Record<string, { tool: string; file?: string; cmd?: string }> = {
        'npm': { tool: 'npm', file: 'package.json', cmd: 'npm install' },
        'yarn': { tool: 'yarn', file: 'package.json', cmd: 'yarn install' },
        'pip': { tool: 'pip', file: 'requirements.txt', cmd: 'pip install -r requirements.txt' },
        'gradle': { tool: 'gradle', file: 'build.gradle', cmd: 'gradle build' }
      }

      const build = buildMap[variables.buildSystem.toLowerCase()]
      if (build) {
        result = result.replace(/npm/g, build.tool)
        result = result.replace(/package\.json/g, build.file)
        result = result.replace(/npm ci/g, build.cmd)
      }
    }

    // Apply custom variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`
      if (result.includes(placeholder)) {
        result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value))
      }
    }

    return result
  }

  /**
   * Check if string is valid JSON
   */
  private isJson(str: string): boolean {
    try {
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }

  /**
   * Random number between min and max
   */
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  /**
   * Check availability (always true for mock)
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Get capabilities
   */
  getCapabilities() {
    return {
      maxTokens: 4000,
      supportsStreaming: false,
      supportsSystemPrompt: true,
      models: ['mock-model-v1']
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      callCount: this.callCount,
      responsesLoaded: this.responses.size,
      errorRate: this.config.errorRate,
      deterministicMode: this.config.deterministicMode,
      simulateLatency: this.config.simulateLatency
    }
  }

  /**
   * Set error rate for testing
   */
  setErrorRate(rate: number): void {
    this.config.errorRate = Math.min(1, Math.max(0, rate))
    this.logger.info({errorRate: this.config.errorRate }, 'Error rate updated')
  }

  /**
   * Add custom response
   */
  addResponse(templateId: string, content: string): void {
    this.responses.set(templateId, content)
    this.logger.info({templateId }, 'Custom response added')
  }

  /**
   * Sample with structured output using Zod schema
   * This wraps the regular sample method and validates the output
   */
  async sampleStructured<T>(request: SamplingRequestType, schema: any): Promise<AIResponse<T>> {
    // Request JSON format for structured output
    const structuredRequest = {
      ...request,
      format: 'json' as const
    }

    // Sample the response
    const response = await this.sample(structuredRequest)

    if (!response.success) {
      return response as AIResponse<T>
    }

    try {
      // Parse and validate with the schema
      const parsed = schema.parse(response.content)
      return {
        ...response,
        content: parsed as T
      }
    } catch (error) {
      return {
        success: false,
        content: null as any,
        error: error instanceof Error ? error : new Error('Schema validation failed'),
        metadata: response.metadata
      }
    }
  }
}


