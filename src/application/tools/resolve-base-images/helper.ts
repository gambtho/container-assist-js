/**
 * Resolve Base Images - Helper Functions
 */

import {
  BaseImageRecommendation,
  ValidationResult,
  SuggestedImage,
} from '../../../domain/types/index';

/**
 * Provide reference images as context, NOT hardcoded decisions
 */
export function getSuggestedImagesForReference(
  language: string,
  _framework?: string,
): SuggestedImage[] {
  const currentYear = new Date().getFullYear();
  const references: Record<string, SuggestedImage[]> = {
    nodejs: [
      {
        category: 'minimal',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`,
        notes: 'Smallest size, good for simple apps',
      },
      {
        category: 'standard',
        image: `node:${currentYear >= 2024 ? '20' : '18'}`,
        notes: 'Full featured, easier debugging',
      },
      {
        category: 'secure',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`,
        notes: 'Balanced size and security',
      },
    ],
    javascript: [
      {
        category: 'minimal',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`,
        notes: 'Smallest size, good for simple apps',
      },
      {
        category: 'standard',
        image: `node:${currentYear >= 2024 ? '20' : '18'}`,
        notes: 'Full featured, easier debugging',
      },
      {
        category: 'secure',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`,
        notes: 'Balanced size and security',
      },
    ],
    typescript: [
      {
        category: 'minimal',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-alpine`,
        notes: 'Smallest size, good for simple apps',
      },
      {
        category: 'standard',
        image: `node:${currentYear >= 2024 ? '20' : '18'}`,
        notes: 'Full featured, easier debugging',
      },
      {
        category: 'secure',
        image: `node:${currentYear >= 2024 ? '20' : '18'}-slim`,
        notes: 'Balanced size and security',
      },
    ],
    python: [
      {
        category: 'minimal',
        image: 'python:3.11-alpine',
        notes: 'Smallest size, may need build tools',
      },
      { category: 'standard', image: 'python:3.11', notes: 'Full Python environment' },
      { category: 'secure', image: 'python:3.11-slim', notes: 'Reduced attack surface' },
    ],
    java: [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      {
        category: 'secure',
        image: 'eclipse-temurin:21-jre',
        notes: 'Enterprise-grade security updates',
      },
    ],
    kotlin: [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      {
        category: 'secure',
        image: 'eclipse-temurin:21-jre',
        notes: 'Enterprise-grade security updates',
      },
    ],
    scala: [
      { category: 'minimal', image: 'openjdk:21-jre-alpine', notes: 'JRE only, smallest size' },
      { category: 'standard', image: 'openjdk:21', notes: 'Full JDK for development builds' },
      {
        category: 'secure',
        image: 'eclipse-temurin:21-jre',
        notes: 'Enterprise-grade security updates',
      },
    ],
    go: [
      {
        category: 'minimal',
        image: 'alpine:3.19',
        notes: 'Smallest possible size for static binaries',
      },
      {
        category: 'standard',
        image: 'golang:1.21-alpine',
        notes: 'Full Go environment for builds',
      },
      { category: 'secure', image: 'distroless/static', notes: 'Ultra-minimal distroless image' },
    ],
    rust: [
      {
        category: 'minimal',
        image: 'alpine:3.19',
        notes: 'Smallest possible size for static binaries',
      },
      {
        category: 'standard',
        image: 'rust:1.70-alpine',
        notes: 'Full Rust environment for builds',
      },
      { category: 'secure', image: 'distroless/cc', notes: 'Minimal with C runtime' },
    ],
    php: [
      { category: 'minimal', image: 'php:8.2-fpm-alpine', notes: 'PHP-FPM with minimal footprint' },
      { category: 'standard', image: 'php:8.2-apache', notes: 'Full Apache + PHP stack' },
      { category: 'secure', image: 'php:8.2-fpm', notes: 'FPM without Alpine vulnerabilities' },
    ],
    ruby: [
      { category: 'minimal', image: 'ruby:3.2-alpine', notes: 'Minimal Ruby environment' },
      { category: 'standard', image: 'ruby:3.2', notes: 'Full Ruby development environment' },
      { category: 'secure', image: 'ruby:3.2-slim', notes: 'Balanced security and functionality' },
    ],
  };

  return (
    references[language.toLowerCase()] ?? [
      { category: 'minimal', image: 'alpine:3.19', notes: 'Generic minimal base' },
      { category: 'standard', image: 'ubuntu:22.04', notes: 'Full-featured Linux base' },
    ]
  );
}

/**
 * AI recommendation validation
 */
export function validateBaseImageRecommendation(
  recommendation: BaseImageRecommendation,
): ValidationResult {
  const issues: string[] = [];

  // Basic format validation
  if (!recommendation.primary_recommendation?.image) {
    issues.push('Missing primary recommendation image');
  }

  // Check for security anti-patterns
  if (recommendation.primary_recommendation?.image?.includes(':latest')) {
    issues.push('AI recommended :latest tag, which is discouraged for production');
  }

  // Validate reasoning is provided
  if (!recommendation.primary_recommendation?.reasoning) {
    issues.push('Missing reasoning for recommendation');
  }

  // Check for empty alternatives array
  if (!recommendation.alternatives || recommendation.alternatives.length === 0) {
    issues.push('Missing alternative recommendations');
  }

  // Validate security considerations
  if (!recommendation.security_considerations?.vulnerability_status) {
    issues.push('Missing security vulnerability assessment');
  }

  // Validate health check recommendations
  if (
    !recommendation.health_check_recommendation?.command &&
    !recommendation.health_check_recommendation?.endpoint
  ) {
    issues.push('Missing health check recommendations');
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Generate AI request for base image resolution
 */
export function buildBaseImageAIRequest(
  analysis: { language?: string; framework?: string; dependencies?: string[] },
  input: {
    session_id: string;
    target_environment?: string;
    security_level?: string;
    performance_priority?: string;
    architectures?: string[];
    compliance_requirements?: string;
  },
  suggestedImages: SuggestedImage[],
): {
  purpose: string;
  format: string;
  context: any;
  sessionId: any;
  sampling: { temperature: number; maxTokens: number };
  variables: {
    targetEnvironment: any;
    securityLevel: any;
    performancePriority: any;
    architectures: any;
    complianceRequirements: any;
    suggestedImages: string;
  };
} {
  return {
    purpose: 'dockerfile-generation',
    format: 'json',
    context: analysis,
    sessionId: input.session_id,
    sampling: { temperature: 0.7, maxTokens: 2000 },
    variables: {
      targetEnvironment: input.target_environment ?? 'cloud',
      securityLevel: input.security_level ?? 'standard',
      performancePriority: input.performance_priority ?? 'size',
      architectures: input.architectures ? input.architectures.join(', ') : 'amd64',
      complianceRequirements: input.compliance_requirements ?? 'none',
      suggestedImages: JSON.stringify(suggestedImages),
    },
  };
}
