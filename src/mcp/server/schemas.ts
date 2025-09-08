/**
 * Zod Schemas for MCP Tools
 *
 * Centralized schema definitions using Zod for type-safe validation
 * and automatic SDK integration
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Common schemas
export const sessionIdSchema = z.string().describe('Session identifier for tracking operations');

export const repoPathSchema = z.string().describe('Path to the repository to analyze');

export const environmentSchema = z
  .enum(['development', 'staging', 'production'])
  .optional()
  .describe('Target deployment environment');

export const optimizationSchema = z
  .enum(['size', 'security', 'performance', 'balanced'])
  .optional()
  .describe('Optimization strategy for containerization');

export const securityLevelSchema = z
  .enum(['basic', 'standard', 'strict'])
  .optional()
  .describe('Security level for container configuration');

// Tool schemas
export const analyzeRepoSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  repoPath: repoPathSchema.optional(),
  depth: z.number().optional().describe('Analysis depth (1-5)'),
  includeTests: z.boolean().optional().describe('Include test files in analysis'),
  securityFocus: z.boolean().optional().describe('Focus on security aspects'),
  performanceFocus: z.boolean().optional().describe('Focus on performance aspects'),
});

export const generateDockerfileSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  baseImage: z.string().optional().describe('Base Docker image to use'),
  environment: environmentSchema,
  optimization: z.union([optimizationSchema, z.boolean()]).optional(),
  securityLevel: securityLevelSchema,
  customCommands: z.array(z.string()).optional().describe('Custom Dockerfile commands'),
});

export const buildImageSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  context: z.string().optional().describe('Build context path'),
  dockerfile: z.string().optional().describe('Dockerfile name'),
  dockerfilePath: z.string().optional().describe('Path to Dockerfile'),
  imageName: z.string().optional().describe('Name for the built image'),
  tags: z.array(z.string()).optional().describe('Tags to apply to the image'),
  buildArgs: z.record(z.string()).optional().describe('Build arguments'),
  platform: z.string().optional().describe('Target platform (e.g., linux/amd64)'),
});

export const scanImageSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  imageId: z.string().optional().describe('Docker image ID or name to scan'),
  image: z.string().optional().describe('Docker image ID or name to scan'),
  severity: z
    .union([
      z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      z.enum(['low', 'medium', 'high', 'critical']),
    ])
    .optional()
    .describe('Minimum severity to report'),
  scanType: z
    .enum(['vulnerability', 'config', 'all'])
    .optional()
    .describe('Type of scan to perform'),
});

export const pushImageSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  imageId: z.string().optional().describe('Docker image ID to push'),
  image: z.string().optional().describe('Docker image to push'),
  registry: z.string().optional().describe('Target registry URL'),
  credentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional()
    .describe('Registry credentials'),
});

export const tagImageSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  imageId: z.string().optional().describe('Docker image ID to tag'),
  image: z.string().optional().describe('Docker image to tag'),
  newTag: z.string().optional().describe('New tag to apply'),
  tag: z.string().optional().describe('New tag to apply'),
});

export const workflowSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  workflowType: z
    .enum(['containerization', 'deployment', 'full'])
    .optional()
    .describe('Type of workflow to execute'),
  config: z.record(z.any()).optional().describe('Workflow configuration'),
});

export const fixDockerfileSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  issues: z
    .array(
      z.object({
        type: z.string(),
        severity: z.string(),
        message: z.string(),
        line: z.number().optional(),
      }),
    )
    .optional()
    .describe('Issues to fix in the Dockerfile'),
  dockerfilePath: z.string().optional().describe('Path to Dockerfile to fix'),
});

export const resolveBaseImagesSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  language: z.string().optional().describe('Programming language'),
  targetEnvironment: environmentSchema,
  securityLevel: z.enum(['basic', 'medium', 'strict']).optional(),
  framework: z.string().optional().describe('Framework being used'),
  requirements: z
    .object({
      security: securityLevelSchema,
      size: z.enum(['minimal', 'standard', 'full']).optional(),
      performance: z.enum(['standard', 'optimized']).optional(),
    })
    .optional()
    .describe('Image requirements'),
});

export const prepareClusterSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  clusterType: z
    .enum(['minikube', 'kind', 'k3s', 'eks', 'gke', 'aks'])
    .optional()
    .describe('Type of Kubernetes cluster'),
  namespace: z.string().optional().describe('Target namespace'),
  createNamespace: z.boolean().optional().describe("Create namespace if it doesn't exist"),
});

export const opsToolSchema = z.object({
  operation: z.enum(['ping', 'status']).describe('Operation to perform'),
  message: z.string().optional().describe('Message for ping operation'),
  details: z.boolean().optional().describe('Include detailed information in status'),
});

export const deployApplicationSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  imageId: z.string().optional().describe('Docker image to deploy'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  replicas: z.number().optional().describe('Number of replicas'),
  port: z.number().optional().describe('Application port'),
  environment: environmentSchema,
});

export const generateK8sManifestsSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  appName: z.string().optional().describe('Application name'),
  imageId: z.string().optional().describe('Docker image for deployment'),
  replicas: z.number().optional().describe('Number of replicas'),
  port: z.number().optional().describe('Application port'),
  environment: environmentSchema,
  resources: z
    .object({
      cpu: z
        .object({
          request: z.string().optional(),
          limit: z.string().optional(),
        })
        .optional(),
      memory: z
        .object({
          request: z.string().optional(),
          limit: z.string().optional(),
        })
        .optional(),
    })
    .optional()
    .describe('Resource limits and requests'),
  ingress: z
    .object({
      enabled: z.boolean(),
      host: z.string().optional(),
      path: z.string().optional(),
      tls: z.boolean().optional(),
    })
    .optional()
    .describe('Ingress configuration'),
});

export const verifyDeploymentSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  deploymentName: z.string().optional().describe('Name of the deployment to verify'),
  namespace: z.string().optional().describe('Kubernetes namespace'),
  checks: z
    .array(z.enum(['pods', 'service', 'ingress', 'health', 'logs']))
    .optional()
    .describe('Specific checks to perform'),
  timeout: z.number().optional().describe('Timeout in seconds'),
});

// Sampling tool schemas
export const dockerfileSamplingSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  repoPath: repoPathSchema.optional(),
  variantCount: z.number().min(1).max(10).optional().describe('Number of variants to generate'),
  strategies: z
    .array(z.enum(['security', 'performance', 'size', 'balanced']))
    .optional()
    .describe('Sampling strategies to use'),
  environment: environmentSchema,
  optimization: z.union([optimizationSchema, z.boolean()]).optional(),
  criteria: z.record(z.any()).optional().describe('Custom evaluation criteria'),
});

export const dockerfileCompareSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  dockerfiles: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
        strategy: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      }),
    )
    .min(2)
    .optional()
    .describe('Dockerfiles to compare'),
  criteria: z.record(z.any()).optional().describe('Comparison criteria'),
});

export const dockerfileValidateSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  content: z.string().optional().describe('Dockerfile content to validate'),
  criteria: z.record(z.any()).optional().describe('Validation criteria'),
  strictMode: z.boolean().optional().describe('Enable strict validation'),
});

export const dockerfileBestSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  repoPath: repoPathSchema.optional(),
  environment: environmentSchema,
  optimization: z.union([optimizationSchema, z.boolean()]).optional(),
  autoSelect: z.boolean().optional().describe('Automatically select best variant'),
});

export const samplingStrategiesSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  includeDescription: z.boolean().optional().describe('Include strategy descriptions'),
});

// Analysis sampling schemas
export const analysisSamplingSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  repoPath: repoPathSchema.optional(),
  language: z.string().optional().describe('Programming language'),
  framework: z.string().optional().describe('Framework being used'),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        type: z.enum(['runtime', 'development', 'peer']),
      }),
    )
    .optional()
    .describe('Project dependencies'),
  ports: z.array(z.number()).optional().describe('Application ports'),
  depth: z.number().min(1).max(5).optional().describe('Analysis depth'),
  includeTests: z.boolean().optional(),
  securityFocus: z.boolean().optional(),
  performanceFocus: z.boolean().optional(),
  strategies: z.array(z.string()).optional().describe('Analysis strategies'),
  criteria: z.record(z.any()).optional(),
});

export const analysisCompareSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  variants: z
    .array(
      z.object({
        strategy: z.string(),
        analysis: z.object({
          language: z.string(),
          framework: z.string().optional(),
          dependencies: z.array(
            z.object({
              name: z.string(),
              version: z.string().optional(),
              type: z.string(),
            }),
          ),
          recommendations: z.array(z.string()),
          securityIssues: z.array(z.string()).optional(),
          performanceIssues: z.array(z.string()).optional(),
        }),
        metadata: z.object({
          confidence: z.number().min(0).max(1),
          executionTime: z.number(),
          timestamp: z.string(),
        }),
      }),
    )
    .min(2)
    .optional()
    .describe('Analysis variants to compare'),
  criteria: z.record(z.any()).optional(),
});

export const analysisValidateSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  variant: z
    .object({
      strategy: z.string(),
      analysis: z.object({
        language: z.string(),
        framework: z.string().optional(),
        dependencies: z.array(
          z.object({
            name: z.string(),
            version: z.string().optional(),
            type: z.string(),
          }),
        ),
        recommendations: z.array(z.string()),
        securityIssues: z.array(z.string()).optional(),
        performanceIssues: z.array(z.string()).optional(),
      }),
      metadata: z.object({
        confidence: z.number(),
        executionTime: z.number(),
        timestamp: z.string(),
      }),
    })
    .optional()
    .describe('Analysis variant to validate'),
  criteria: z.record(z.any()).optional(),
});

export const analysisStrategiesSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  includeDescription: z.boolean().optional(),
});

// Workflow schemas
export const containerizationWorkflowSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  repoPath: repoPathSchema.optional(),
  skipAnalysis: z.boolean().optional(),
  skipBuild: z.boolean().optional(),
  skipScan: z.boolean().optional(),
  pushToRegistry: z.boolean().optional(),
  registry: z.string().optional(),
  environment: environmentSchema,
  optimization: z.union([optimizationSchema, z.boolean()]).optional(),
});

export const deploymentWorkflowSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  imageId: z.string().optional(),
  namespace: z.string().optional(),
  clusterType: z.string().optional(),
  environment: environmentSchema,
  autoScale: z.boolean().optional(),
  monitoring: z.boolean().optional(),
});

// Export a map of all schemas for easy access
export const toolSchemas = {
  'analyze-repo': analyzeRepoSchema,
  'generate-dockerfile': generateDockerfileSchema,
  'build-image': buildImageSchema,
  scan: scanImageSchema,
  push: pushImageSchema,
  tag: tagImageSchema,
  workflow: workflowSchema,
  'fix-dockerfile': fixDockerfileSchema,
  'resolve-base-images': resolveBaseImagesSchema,
  'prepare-cluster': prepareClusterSchema,
  ops: opsToolSchema,
  deploy: deployApplicationSchema,
  'generate-k8s-manifests': generateK8sManifestsSchema,
  'verify-deployment': verifyDeploymentSchema,
  'dockerfile-sampling': dockerfileSamplingSchema,
  'dockerfile-compare': dockerfileCompareSchema,
  'dockerfile-validate': dockerfileValidateSchema,
  'dockerfile-best': dockerfileBestSchema,
  'sampling-strategies': samplingStrategiesSchema,
  'analysis-sampling': analysisSamplingSchema,
  'analysis-compare': analysisCompareSchema,
  'analysis-validate': analysisValidateSchema,
  'analysis-strategies': analysisStrategiesSchema,
  containerization: containerizationWorkflowSchema,
  deployment: deploymentWorkflowSchema,
} as const;

// Type exports for tool parameters
export type DeployApplicationParams = z.infer<typeof deployApplicationSchema>;
export type ContainerizationWorkflowParams = z.infer<typeof containerizationWorkflowSchema>;
export type DeploymentWorkflowParams = z.infer<typeof deploymentWorkflowSchema>;

// Export JSON Schemas for tools
// This provides pre-converted JSON schemas to avoid conversion at runtime
export const toolJsonSchemas = Object.fromEntries(
  Object.entries(toolSchemas).map(([name, zodSchema]) => {
    const jsonSchema = zodToJsonSchema(zodSchema, {
      $refStrategy: 'none', // Inline all definitions
      errorMessages: false,
      markdownDescription: false,
    });

    // Remove $schema property if present
    if (jsonSchema && typeof jsonSchema === 'object' && '$schema' in jsonSchema) {
      const { $schema: _$schema, ...cleanSchema } = jsonSchema as any;
      return [name, cleanSchema];
    }

    return [name, jsonSchema];
  }),
) as Record<keyof typeof toolSchemas, any>;
