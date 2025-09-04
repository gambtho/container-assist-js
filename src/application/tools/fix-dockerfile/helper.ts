/**
 * Fix Dockerfile - Helper Functions
 */

import { buildAIRequest } from '../../../infrastructure/ai/index';
import type { ToolContext } from '../tool-types';
import { AIServiceResponse, isAIServiceResponse } from '../../../domain/types/workflow-state';

export interface DockerfileIssue {
  type: string;
  message: string;
  line?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface DockerfileAnalysisResult {
  issues: DockerfileIssue[];
  fixedIssues: DockerfileIssue[];
  recommendations: string[];
  securityImprovements: string[];
}

export interface DockerfileValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Analyze Dockerfile for issues and generate fix recommendations
 */
export function analyzeDockerfile(
  dockerfileContent: string,
  knownIssues: DockerfileIssue[] = [],
  context: ToolContext,
): DockerfileAnalysisResult {
  const { logger } = context;

  logger.info('Analyzing Dockerfile for issues');

  // Common Dockerfile issues to check
  const detectedIssues: DockerfileIssue[] = [];
  const lines = dockerfileContent.split('\n');

  // Check for common issues
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    // Check for running as root
    if (
      trimmedLine.startsWith('USER root') ||
      (!dockerfileContent.includes('USER ') && !trimmedLine.startsWith('#'))
    ) {
      detectedIssues.push({
        type: 'security',
        message: 'Running as root user - consider using a non-root user',
        line: lineNumber,
        severity: 'warning',
      });
    }

    // Check for latest tag usage
    if (trimmedLine.includes(':latest')) {
      detectedIssues.push({
        type: 'best_practice',
        message: 'Using "latest" tag - consider pinning to specific version',
        line: lineNumber,
        severity: 'warning',
      });
    }

    // Check for ADD instead of COPY
    if (trimmedLine.startsWith('ADD ') && !trimmedLine.includes('http')) {
      detectedIssues.push({
        type: 'best_practice',
        message: 'Consider using COPY instead of ADD for local files',
        line: lineNumber,
        severity: 'info',
      });
    }

    // Check for apt-get without --no-install-recommends
    if (
      trimmedLine.includes('apt-get install') &&
      !trimmedLine.includes('--no-install-recommends')
    ) {
      detectedIssues.push({
        type: 'optimization',
        message: 'Consider using --no-install-recommends with apt-get to reduce image size',
        line: lineNumber,
        severity: 'info',
      });
    }

    // Check for missing apt-get clean
    if (trimmedLine.includes('apt-get install') && !dockerfileContent.includes('apt-get clean')) {
      detectedIssues.push({
        type: 'optimization',
        message: 'Consider adding apt-get clean to reduce image size',
        line: lineNumber,
        severity: 'info',
      });
    }
  });

  // Combine known issues with detected issues
  const allIssues = [...knownIssues, ...detectedIssues];

  // Generate recommendations
  const recommendations = [
    'Use specific version tags instead of "latest"',
    'Create a non-root user for running the application',
    'Use multi-stage builds to reduce final image size',
    'Group RUN commands to reduce layers',
    'Clean up package manager cache after installation',
  ];

  const securityImprovements = [
    'Run application as non-root user',
    'Scan for known vulnerabilities',
    'Use minimal base images',
    'Avoid installing unnecessary packages',
  ];

  return {
    issues: allIssues,
    fixedIssues: [],
    recommendations,
    securityImprovements,
  };
}

/**
 * Generate fixed Dockerfile content using AI assistance
 */
export async function generateFixedDockerfile(
  originalContent: string,
  analysisResult: DockerfileAnalysisResult,
  context: ToolContext,
): Promise<string> {
  const { logger } = context;

  logger.info('Generating fixed Dockerfile content');

  try {
    // Use the AI service from context if available
    if (context.aiService) {
      // Build the AI request for Dockerfile fixing
      const requestBuilder = buildAIRequest({
        template: 'dockerfile-fix',
        variables: {
          dockerfile: originalContent,
          error_message: JSON.stringify(analysisResult.issues),
        },
        sampling: {
          temperature: 0.3,
          maxTokens: 3000,
        },
      });

      type AIService = { generate: (request: unknown) => Promise<AIServiceResponse> };
      const aiResponse = await (context.aiService as AIService).generate(requestBuilder);

      if (isAIServiceResponse(aiResponse) && aiResponse.success && aiResponse.data != null) {
        let fixedContent: string;

        if (typeof aiResponse.data === 'string') {
          fixedContent = aiResponse.data;
        } else if (typeof aiResponse.data === 'object' && 'content' in aiResponse.data) {
          fixedContent = String((aiResponse.data as { content: unknown }).content);
        } else {
          throw new Error('Invalid AI response data format');
        }

        // If response includes markdown, extract the dockerfile content
        const dockerfileMatch = fixedContent.match(/```dockerfile\n([\s\S]*?)\n```/);
        if (dockerfileMatch?.[1]) {
          fixedContent = dockerfileMatch[1];
        }

        // Update analysis result with fixed issues
        analysisResult.fixedIssues = analysisResult.issues.filter(
          (issue) => issue.severity === 'error' || issue.severity === 'warning',
        );

        // Log AI generation with metadata
        logger.info(
          {
            hasMetadata: typeof aiResponse.data === 'object' && aiResponse.data != null,
          },
          'AI-fixed Dockerfile successfully',
        );

        return fixedContent;
      }
    }

    // Fallback to basic fix approach if AI service not available
    logger.info('Using basic fix approach (AI service not available)');
    return generateBasicDockerfileFix(originalContent, analysisResult);
  } catch (error) {
    logger.error({ error }, 'AI-enhanced fixing failed, using basic fix approach');
    // Fall back to basic fixing
    return generateBasicDockerfileFix(originalContent, analysisResult);
  }
}

/**
 * Generate basic Dockerfile fixes without AI
 */
function generateBasicDockerfileFix(
  originalContent: string,
  analysisResult: DockerfileAnalysisResult,
): string {
  let fixedContent = originalContent;

  // Apply basic fixes for common issues
  analysisResult.issues.forEach((issue) => {
    switch (issue.type) {
      case 'security':
        if (issue.message.includes('root user')) {
          // Add non-root user if not present
          if (!fixedContent.includes('USER ') && !fixedContent.includes('adduser')) {
            const userSetup = `
# Create non-root user for security
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser`;
            fixedContent = fixedContent.replace(/EXPOSE/g, `${userSetup}\nEXPOSE`);
            fixedContent = fixedContent.replace(/CMD \[/, 'USER appuser\nCMD [');
          }
        }
        break;

      case 'best_practice':
        if (issue.message.includes('latest')) {
          // Replace :latest with specific versions (basic replacement)
          fixedContent = fixedContent.replace(/:latest/g, ':stable');
        }
        if (issue.message.includes('ADD')) {
          // Replace ADD with COPY for local files
          fixedContent = fixedContent.replace(/^ADD (?!http)/gm, 'COPY ');
        }
        break;

      case 'optimization':
        if (issue.message.includes('--no-install-recommends')) {
          fixedContent = fixedContent.replace(
            /apt-get install/g,
            'apt-get install --no-install-recommends',
          );
        }
        if (issue.message.includes('apt-get clean')) {
          fixedContent = fixedContent.replace(
            /(apt-get install[^\n]*)/g,
            '$1 && apt-get clean && rm -rf /var/lib/apt/lists/*',
          );
        }
        break;
    }
  });

  // Mark issues as fixed
  analysisResult.fixedIssues = analysisResult.issues.filter(
    (issue) => issue.severity === 'error' || issue.severity === 'warning',
  );

  return fixedContent;
}

/**
 * Validate the fixed Dockerfile
 */
export function validateDockerfileFix(
  fixedContent: string,
  _analysisResult: DockerfileAnalysisResult,
): DockerfileValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Basic validation
  if (!fixedContent.trim()) {
    errors.push('Fixed Dockerfile is empty');
    return { isValid: false, warnings, errors };
  }

  // Check if it starts with FROM
  if (!fixedContent.trim().startsWith('FROM')) {
    errors.push('Dockerfile must start with FROM instruction');
  }

  // Check for basic structure
  const lines = fixedContent
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'));

  if (lines.length < 2) {
    warnings.push('Dockerfile seems very simple - ensure all necessary instructions are included');
  }

  // Check if common issues were addressed
  const hasUserInstruction = fixedContent.includes('USER ') && !fixedContent.includes('USER root');
  if (!hasUserInstruction) {
    warnings.push('Consider adding a non-root USER instruction for security');
  }

  // Check for latest tag usage
  if (fixedContent.includes(':latest')) {
    warnings.push('Still using "latest" tag - consider pinning to specific versions');
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    warnings,
    errors,
  };
}
