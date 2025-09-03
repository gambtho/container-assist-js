/**
 * Repository Analyzer
 * AI-powered repository analysis and containerization recommendations
 */

import type { Logger } from 'pino';
import type { MCPSampler } from './mcp-sampler';
import type { StructuredSampler } from './structured-sampler';
import { z } from 'zod';

/**
 * Repository analysis result
 */
export const RepositoryAnalysisSchema = z.object({
  language: z.string(),
  framework: z.string().optional(),
  buildTool: z.string().optional(),
  packageManager: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  devDependencies: z.array(z.string()).optional(),
  hasDockerfile: z.boolean(),
  hasDockerCompose: z.boolean(),
  hasTests: z.boolean(),
  hasCi: z.boolean(),
  port: z.number().optional(),
  entryPoint: z.string().optional(),
  recommendations: z.array(z.string()),
  containerization: z
    .object({
      baseImage: z.string(),
      buildSteps: z.array(z.string()),
      runCommand: z.string(),
      exposePorts: z.array(z.number()),
      environmentVars: z.array(z.string()).optional(),
      volumes: z.array(z.string()).optional(),
      securityConsiderations: z.array(z.string()).optional()
    })
    .optional(),
  confidence: z.number().min(0).max(1)
});

export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;

/**
 * Analysis options
 */
export interface AnalysisOptions {
  includeContainerization?: boolean;
  includeSecurityAnalysis?: boolean;
  includeBestPractices?: boolean;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Repository Analyzer implementation
 */
export class RepositoryAnalyzer {
  private structuredSampler: StructuredSampler;
  private logger: Logger;

  constructor(_sampler: MCPSampler, structuredSampler: StructuredSampler, logger: Logger) {
    this.structuredSampler = structuredSampler;
    this.logger = logger.child({ component: 'repository-analyzer' });
  }

  /**
   * Analyze a repository structure
   */
  async analyzeRepository(
    repositoryData: string,
    options: AnalysisOptions = {}
  ): Promise<RepositoryAnalysis | null> {
    const {
      includeContainerization = true,
      includeSecurityAnalysis = false,
      includeBestPractices = true,
      maxTokens = 3000,
      temperature = 0.2
    } = options;

    try {
      const prompt = this.buildAnalysisPrompt(
        repositoryData,
        includeContainerization,
        includeSecurityAnalysis,
        includeBestPractices
      );

      this.logger.debug(
        {
          dataSize: repositoryData.length,
          includeContainerization,
          includeSecurityAnalysis
        },
        'Starting repository analysis'
      );

      const result = await this.structuredSampler.generateStructured<RepositoryAnalysis>(prompt, {
        schema: RepositoryAnalysisSchema,
        format: 'json',
        temperature,
        maxTokens,
        validateSecurity: includeSecurityAnalysis
      });

      if (!result.success ?? !result.data) {
        this.logger.error(
          {
            error: result.error,
            attempts: result.metadata?.attempts
          },
          'Analysis failed'
        );
        return null;
      }

      this.logger.info(
        {
          language: result.data.language,
          framework: result.data.framework,
          confidence: result.data.confidence,
          tokensUsed: result.metadata?.tokensUsed
        },
        'Repository analysis completed'
      );

      return result.data;
    } catch (error) {
      this.logger.error({ error }, 'Repository analysis error');
      return null;
    }
  }

  /**
   * Analyze package.json for Node.js projects
   */
  async analyzePackageJson(
    packageJsonContent: string
  ): Promise<Partial<RepositoryAnalysis> | null> {
    try {
      const packageData = JSON.parse(packageJsonContent);

      const prompt = `Analyze this package.json file and provide containerization recommendations:

${JSON.stringify(packageData, null, 2)}

Please provide:
1. Identified framework (if any)
2. Build tool and package manager
3. Entry point
4. Port (if specified)
5. Containerization recommendations including base image, build steps, and run command
6. Security considerations for the dependencies`;

      const result = await this.structuredSampler.generateStructured<Partial<RepositoryAnalysis>>(
        prompt,
        {
          format: 'json',
          temperature: 0.1,
          maxTokens: 2000
        }
      );

      return result.success && result.data ? result.data : null;
    } catch (error) {
      this.logger.error({ error }, 'Package.json analysis error');
      return null;
    }
  }

  /**
   * Analyze Dockerfile for optimization recommendations
   */
  async analyzeDockerfile(dockerfileContent: string): Promise<{
    optimizations: string[];
    securityIssues: string[];
    bestPractices: string[];
  } | null> {
    const prompt = `Analyze this Dockerfile and provide optimization recommendations:

${dockerfileContent}

Please provide:
1. Optimization opportunities (layer caching, size reduction, build speed)
2. Security issues and concerns
3. Best practices that could be applied

Format as JSON with arrays for each category.`;

    try {
      const result = await this.structuredSampler.generateStructured<{
        optimizations: string[];
        securityIssues: string[];
        bestPractices: string[];
      }>(prompt, {
        format: 'json',
        temperature: 0.2,
        maxTokens: 2000,
        validateSecurity: true
      });

      return result.success && result.data ? result.data : null;
    } catch (error) {
      this.logger.error({ error }, 'Dockerfile analysis error');
      return null;
    }
  }

  /**
   * Generate containerization recommendations
   */
  async generateContainerizationPlan(
    analysis: RepositoryAnalysis,
    requirements?: {
      production?: boolean;
      multiStage?: boolean;
      healthCheck?: boolean;
      nonRootUser?: boolean;
    }
  ): Promise<{
    dockerfile: string;
    dockerIgnore: string;
    dockerCompose?: string;
    buildInstructions: string[];
  } | null> {
    const req = {
      production: true,
      multiStage: true,
      healthCheck: true,
      nonRootUser: true,
      ...requirements
    };

    const prompt = `Based on this repository analysis, generate complete containerization files:

${JSON.stringify(analysis, null, 2)}

Requirements:
- Production ready: ${req.production}
- Multi-stage build: ${req.multiStage}
- Health check: ${req.healthCheck}
- Non-root user: ${req.nonRootUser}

Please provide:
1. Complete Dockerfile
2. .dockerignore file
3. Optional docker-compose.yml if beneficial
4. Build instructions

Format as JSON with each file as a string property.`;

    try {
      const result = await this.structuredSampler.generateStructured<{
        dockerfile: string;
        dockerIgnore: string;
        dockerCompose?: string;
        buildInstructions: string[];
      }>(prompt, {
        format: 'json',
        temperature: 0.1,
        maxTokens: 4000,
        validateSecurity: true
      });

      return result.success && result.data ? result.data : null;
    } catch (error) {
      this.logger.error({ error }, 'Containerization plan generation error');
      return null;
    }
  }

  /**
   * Build analysis prompt
   */
  private buildAnalysisPrompt(
    repositoryData: string,
    includeContainerization: boolean,
    includeSecurityAnalysis: boolean,
    includeBestPractices: boolean
  ): string {
    let prompt = `Analyze this repository structure and provide detailed insights:

${repositoryData}

Please analyze and provide:

1. **Language and Framework Detection**:
   - Primary programming language
   - Framework (if applicable)
   - Build tool and package manager

2. **Project Structure Analysis**:
   - Entry point identification
   - Dependencies analysis
   - Test configuration
   - CI/CD setup detection

3. **Current Container Status**:
   - Existing Dockerfile presence
   - Docker Compose configuration
   - Container-related files`;

    if (includeContainerization) {
      prompt += `

4. **Containerization Recommendations**:
   - Optimal base image
   - Build steps and optimization
   - Runtime configuration
   - Port exposure
   - Environment variables
   - Volume mounts
   - Health checks`;
    }

    if (includeSecurityAnalysis) {
      prompt += `

5. **Security Analysis**:
   - Dependency vulnerabilities
   - Configuration security
   - Runtime security considerations
   - Access control recommendations`;
    }

    if (includeBestPractices) {
      prompt += `

6. **Best Practices**:
   - Development workflow improvements
   - Performance optimizations
   - Maintenance recommendations
   - Documentation suggestions`;
    }

    prompt += `

Please provide a confidence score (0-1) for the analysis accuracy.
Format the response as valid JSON matching the expected schema.`;

    return prompt;
  }
}
