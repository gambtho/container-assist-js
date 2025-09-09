/**
 * Template Engine Factory
 *
 * Simple factory for creating and configuring template engines
 */

import { resolve } from 'node:path';
import type { Logger } from 'pino';
import { SimpleTemplateEngine } from './simple-template-engine';
import { Result, Success, Failure } from '../../domain/types';

/**
 * Template engine configuration
 */
export interface TemplateEngineConfig {
  /** Directory containing template files */
  templateDirectory?: string;
  /** Load external YAML templates */
  loadExternalTemplates?: boolean;
  /** Register built-in templates */
  loadBuiltinTemplates?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: TemplateEngineConfig = {
  templateDirectory: 'resources/ai-templates',
  loadExternalTemplates: true,
  loadBuiltinTemplates: true,
};

/**
 * Create configured template engine
 */
export async function createTemplateEngine(
  logger: Logger,
  config: TemplateEngineConfig = {},
): Promise<Result<SimpleTemplateEngine>> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const engine = new SimpleTemplateEngine(logger);

  try {
    // Load external YAML templates if enabled
    if (finalConfig.loadExternalTemplates && finalConfig.templateDirectory) {
      const templateDir = resolve(finalConfig.templateDirectory);
      const loadResult = await engine.loadFromDirectory(templateDir);

      if (loadResult.isFailure()) {
        logger.warn(
          { error: loadResult.error },
          'Failed to load external templates, continuing with builtins',
        );
      }
    }

    // Register built-in templates if enabled
    if (finalConfig.loadBuiltinTemplates) {
      registerBuiltinTemplates(engine);
    }

    logger.info(
      {
        templateCount: engine.templateCount,
        externalEnabled: finalConfig.loadExternalTemplates,
        builtinEnabled: finalConfig.loadBuiltinTemplates,
      },
      'Template engine created',
    );

    return Success(engine);
  } catch (error) {
    return Failure(
      `Failed to create template engine: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/**
 * Register essential built-in templates for backward compatibility
 */
function registerBuiltinTemplates(engine: SimpleTemplateEngine): void {
  // Essential templates that tools depend on
  const builtinTemplates = [
    {
      name: 'generate-dockerfile',
      description: 'Generate a Dockerfile for a project based on analysis',
      content: `Generate a production-ready Dockerfile for a {{language}} project.

Project Details:
- Language: {{language}}
{{#framework}}
- Framework: {{framework}}
{{/framework}}
{{#ports}}
- Ports: {{ports}}
{{/ports}}
{{#baseImage}}
- Suggested Base Image: {{baseImage}}
{{/baseImage}}
{{#requirements}}
- Dependencies: {{requirements}}
{{/requirements}}

Repository Summary:
{{repoSummary}}

Requirements:
1. Use multi-stage builds when appropriate
2. Include security best practices
3. Minimize image size
4. Include proper health checks
5. Set appropriate working directory and user
6. Copy files efficiently
7. Expose necessary ports

Return only the Dockerfile content without explanation or code fences.`,
    },
    {
      name: 'fix-dockerfile',
      description: 'Fix issues in an existing Dockerfile based on analysis and error context',
      content: `Fix the provided Dockerfile to resolve build issues and improve best practices.

Current Dockerfile:
{{dockerfileContent}}

{{#buildError}}
Build Error:
{{buildError}}
{{/buildError}}

{{#errors}}
Specific Issues to Fix:
{{#each errors}}
- {{this}}
{{/each}}
{{/errors}}

{{#language}}
Language: {{language}}
{{/language}}

{{#framework}}
Framework: {{framework}}
{{/framework}}

{{#analysis}}
Repository Context:
{{analysis}}
{{/analysis}}

Requirements:
1. Fix any syntax errors and build failures
2. Apply containerization best practices
3. Ensure proper build caching and layer optimization
4. Use security best practices (non-root user, minimal packages)
5. Optimize for image size where possible
6. Maintain the original functionality and intent

Return only the corrected Dockerfile content without explanation or code fences.`,
    },
    {
      name: 'generate-k8s-manifests',
      description: 'Generate Kubernetes manifests for containerized applications',
      content: `Generate production-ready Kubernetes manifests for containerized application.

Application Details:
- Name: {{appName}}
- Image: {{imageId}}
{{#namespace}}
- Namespace: {{namespace}}
{{/namespace}}
{{#replicas}}
- Replicas: {{replicas}}
{{/replicas}}
{{#ports}}
- Ports: {{ports}}
{{/ports}}
{{#environment}}
- Environment: {{environment}}
{{/environment}}

Required Manifests:
{{#manifestTypes}}
{{#each manifestTypes}}
- {{this}}
{{/each}}
{{/manifestTypes}}
{{^manifestTypes}}
- Deployment
- Service
{{/manifestTypes}}

{{#resources}}
Resource Requirements:
{{resources}}
{{/resources}}

{{#repoAnalysis}}
Repository Context:
{{repoAnalysis}}
{{/repoAnalysis}}

Configuration:
{{#securityLevel}}
- Security Level: {{securityLevel}}
{{/securityLevel}}
{{#highAvailability}}
- High Availability: enabled
{{/highAvailability}}

Generate complete YAML manifests with the following requirements:

1. **Deployment Manifest:**
   - Use appropriate resource limits and requests
   - Include health checks (readiness/liveness probes)
   - Set security contexts (non-root user when possible)
   - Use proper labeling and selectors
   - Include restart policies

2. **Service Manifest:**
   - Appropriate service type for the environment
   - Proper port configuration
   - Correct selectors matching deployment labels

3. **Additional Manifests (if requested):**
   - ConfigMap for configuration (if needed)
   - Ingress for external access (if production environment)
   - HorizontalPodAutoscaler for scaling (if production)
   - PodDisruptionBudget for high availability
   - NetworkPolicy for security (if strict security level)

Best Practices:
- Use specific image tags (avoid :latest in production)
- Set resource limits to prevent resource starvation
- Include proper labels for monitoring and management
- Use namespaces for environment isolation
- Enable security contexts for better security posture
- Include annotations for better observability

Return only the YAML manifests separated by "---" without explanation or code fences.`,
    },
  ];

  builtinTemplates.forEach((template) => {
    engine.registerTemplate(template);
  });
}
