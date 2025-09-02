/**
 * AI-Powered Base Image Resolution Handler
 * Intelligently recommends Docker base images based on comprehensive analysis
 */

import {
  BaseImageRecommendation,
  BaseImageRecommendationSchema,
  BaseImageResolutionInput,
  BaseImageResolutionInputSchema,
  ValidationResult,
  SuggestedImage,
  Result,
  ok,
  fail
} from '../../../domain/types/index.js'
import { ToolDescriptor, ToolContext } from '../tool-types.js'
import { executeWithRetry } from '../error-recovery.js'

const resolveBaseImagesHandler: ToolDescriptor = {
  name: 'resolve-base-images',
  description: 'AI-powered Docker base image resolution with security and performance optimization',
  category: 'workflow',
  inputSchema: BaseImageResolutionInputSchema,
  outputSchema: BaseImageRecommendationSchema,

  async execute(input: BaseImageResolutionInput, context: ToolContext): Promise<Result<BaseImageRecommendation>> {
    return executeWithRetry(async () => {
      // Get repository analysis from session
      if (!context.sessionService) {
        return fail('Session service not available')
      }

      const session = await context.sessionService.get(input.session_id)
      if (!session) {
        return fail('Session not found')
      }

      if (!session.workflow_state?.analysis_result) {
        return fail('Repository must be analyzed first. Run analyze-repository tool.')
      }

      const analysis = session.workflow_state.analysis_result

      // Prepare suggested images as reference (not hardcoded decision)
      const suggestedImages = getSuggestedImagesForReference(analysis.language, analysis.framework)

      // Use AI for intelligent decision making
      if (!context.structuredSampler) {
        return fail('AI structured sampler not available')
      }

      const recommendation = await context.structuredSampler.sample({
        prompt: `Recommend the best Docker base image for a ${analysis.language} application with the following requirements:

Language: ${analysis.language}
Language Version: ${analysis.language_version || 'latest'}
Framework: ${analysis.framework || 'none'}
Framework Version: ${analysis.framework_version || 'latest'}
Dependencies: ${JSON.stringify(analysis.dependencies || [])}
Build System: ${analysis.build_system?.type || 'unknown'}
Target Environment: ${input.target_environment}
Security Level: ${input.security_level}
Performance Priority: ${input.performance_priority}
Architectures: ${input.architectures}
Compliance Requirements: ${input.compliance_requirements || 'none'}
Suggested Images: ${JSON.stringify(suggestedImages)}

Please provide a comprehensive recommendation in the required JSON format.`,
        context: {
          sessionId: input.session_id,
          metadata: {
            language: analysis.language,
            languageVersion: analysis.language_version || 'latest',
            framework: analysis.framework || 'none',
            frameworkVersion: analysis.framework_version || 'latest',
            dependencies: JSON.stringify(analysis.dependencies || []),
            buildSystem: analysis.build_system?.type || 'unknown',
            targetEnvironment: input.target_environment,
            securityLevel: input.security_level,
            performancePriority: input.performance_priority,
            architectures: input.architectures,
            complianceRequirements: input.compliance_requirements || 'none',
            currentDate: new Date().toISOString().split('T')[0],
            deploymentType: input.target_environment,
            resourceConstraints: 'standard',
            suggestedImages
          }
        }
      }, BaseImageRecommendationSchema)

      if (!recommendation.success) {
        return fail(`AI base image resolution failed: ${recommendation.error?.message}`)
      }

      // Validate the AI's recommendation
      const validationResult = await validateBaseImageRecommendation(recommendation.data)
      if (!validationResult.isValid) {
        return fail(`AI recommendation validation failed: ${validationResult.issues.join(', ')}`)
      }

      // Store recommendation in session for dockerfile generation
      try {
        await context.sessionService.updateAtomic(input.session_id, (session: any) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            base_image_recommendation: recommendation.data
          }
        }))
      } catch (error) {
        context.logger.warn({
          sessionId: input.session_id,
          error
        }, 'Failed to store base image recommendation in session')
      }

      return ok(recommendation.data)

    }, 'AI-powered base image resolution')
  }
}

// Provide reference images as context, NOT hardcoded decisions
function getSuggestedImagesForReference(language: string, framework?: string): SuggestedImage[] {
  const currentYear = new Date().getFullYear()
  const references: Record<string, SuggestedImage[]> = {
    'nodejs': [
      { category: 'minimal', image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`, notes: 'Smallest size, good for simple apps' },
      { category: 'standard', image: `node:${currentYear >= 2024 ? '20' : '18'}`, notes: 'Full featured, easier debugging' },
      { category: 'secure', image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`, notes: 'Balanced size and security' }
    ],
    'javascript': [
      { category: 'minimal', image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`, notes: 'Smallest size, good for simple apps' },
      { category: 'standard', image: `node:${currentYear >= 2024 ? '20' : '18'}`, notes: 'Full featured, easier debugging' },
      { category: 'secure', image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`, notes: 'Balanced size and security' }
    ],
    'typescript': [
      { category: 'minimal', image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`, notes: 'Smallest size, good for simple apps' },
      { category: 'standard', image: `node:${currentYear >= 2024 ? '20' : '18'}`, notes: 'Full featured, easier debugging' },
      { category: 'secure', image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`, notes: 'Balanced size and security' }
    ],
    'python': [
      { category: 'minimal', image: 'python:3.11-alpine', notes: 'Smallest size, may need build tools' },
      { category: 'standard', image: 'python:3.11', notes: 'Full Python environment' },
      { category: 'secure', image: 'python:3.11-slim', notes: 'Reduced attack surface' }
    ],
    'java': [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      { category: 'secure', image: 'eclipse-temurin:21-jre', notes: 'Enterprise-grade security updates' }
    ],
    'kotlin': [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      { category: 'secure', image: 'eclipse-temurin:21-jre', notes: 'Enterprise-grade security updates' }
    ],
    'scala': [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      { category: 'secure', image: 'eclipse-temurin:21-jre', notes: 'Enterprise-grade security updates' }
    ],
    'go': [
      { category: 'minimal', image: 'alpine:latest', notes: 'Smallest possible size for static binaries' },
      { category: 'standard', image: 'golang:1.21-alpine', notes: 'Full Go environment for builds' },
      { category: 'secure', image: 'distroless/static', notes: 'Ultra-minimal distroless image' }
    ],
    'rust': [
      { category: 'minimal', image: 'alpine:latest', notes: 'Smallest possible size for static binaries' },
      { category: 'standard', image: 'rust:1.70-alpine', notes: 'Full Rust environment for builds' },
      { category: 'secure', image: 'distroless/cc', notes: 'Minimal with C runtime' }
    ],
    'php': [
      { category: 'minimal', image: 'php:8.2-fpm-alpine', notes: 'PHP-FPM with minimal footprint' },
      { category: 'standard', image: 'php:8.2-apache', notes: 'Full Apache + PHP stack' },
      { category: 'secure', image: 'php:8.2-fpm', notes: 'FPM without Alpine vulnerabilities' }
    ],
    'ruby': [
      { category: 'minimal', image: 'ruby:3.2-alpine', notes: 'Minimal Ruby environment' },
      { category: 'standard', image: 'ruby:3.2', notes: 'Full Ruby development environment' },
      { category: 'secure', image: 'ruby:3.2-slim', notes: 'Balanced security and functionality' }
    ]
  }

  return references[language.toLowerCase()] || [
    { category: 'minimal', image: 'alpine:latest', notes: 'Generic minimal base' },
    { category: 'standard', image: 'ubuntu:22.04', notes: 'Full-featured Linux base' }
  ]
}

// AI recommendation validation
async function validateBaseImageRecommendation(recommendation: BaseImageRecommendation): Promise<ValidationResult> {
  const issues: string[] = []

  // Basic format validation
  if (!recommendation.primary_recommendation?.image) {
    issues.push('Missing primary recommendation image')
  }

  // Check for security anti-patterns
  if (recommendation.primary_recommendation?.image?.includes(':latest')) {
    issues.push('AI recommended :latest tag, which is discouraged for production')
  }

  // Validate reasoning is provided
  if (!recommendation.primary_recommendation?.reasoning) {
    issues.push('Missing reasoning for recommendation')
  }

  // Check for empty alternatives array
  if (!recommendation.alternatives || recommendation.alternatives.length === 0) {
    issues.push('Missing alternative recommendations')
  }

  // Validate security considerations
  if (!recommendation.security_considerations?.vulnerability_status) {
    issues.push('Missing security vulnerability assessment')
  }

  // Validate health check recommendations
  if (!recommendation.health_check_recommendation?.command && !recommendation.health_check_recommendation?.endpoint) {
    issues.push('Missing health check recommendations')
  }

  return {
    isValid: issues.length === 0,
    issues
  }
}

export default resolveBaseImagesHandler


