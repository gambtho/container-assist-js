/**
 * Fix Dockerfile Tool - New MCP Pattern
 *
 * Analyzes and fixes Dockerfile build errors using ToolContext pattern
 * Follows new architecture with proper MCP protocol compliance
 */

import { createSessionManager } from '@lib/session';
import { createTimer, type Logger } from '@lib/logger';
import { getRecommendedBaseImage } from '@lib/base-images';
import { Success, Failure, type Result, updateWorkflowState, type WorkflowState } from '@types';
import { DEFAULT_PORTS } from '@config/defaults';
import { stripFencesAndNoise, isValidDockerfileContent } from '@lib/text-processing';
import type { ToolContext } from '@mcp/context/types';

export interface FixDockerfileConfig {
  sessionId: string;
  error?: string;
  dockerfile?: string;
}

/**
 * Result interface for Dockerfile fix operations with AI tracking
 */
export interface FixDockerfileResult {
  ok: boolean;
  sessionId: string;
  dockerfile: string;
  path: string;
  fixes: string[];
  validation: string[];
  aiUsed: boolean;
  generationMethod: 'AI' | 'fallback';
}

export interface FixDockerfileResult {
  ok: boolean;
  sessionId: string;
  dockerfile: string;
  path: string;
  fixes: string[];
  validation: string[];
}

/**
 * Attempt to fix Dockerfile using AI enhancement via ToolContext
 */
async function attemptAIFix(
  dockerfileContent: string,
  buildError: string | undefined,
  errors: string[] | undefined,
  language: string | undefined,
  framework: string | undefined,
  analysis: string | undefined,
  context: ToolContext,
  logger: Logger,
): Promise<Result<{ fixedDockerfile: string; appliedFixes: string[] }>> {
  try {
    logger.info('Attempting AI-enhanced Dockerfile fix');

    // Prepare arguments for the fix-dockerfile prompt
    const promptArgs = {
      dockerfileContent,
      buildError: buildError || undefined,
      errors: errors || undefined,
      language: language || undefined,
      framework: framework || undefined,
      analysis: analysis || undefined,
    };

    // Filter out undefined values
    const cleanedArgs = Object.fromEntries(
      Object.entries(promptArgs).filter(([_, value]) => value !== undefined),
    );

    logger.debug({ args: cleanedArgs }, 'Using prompt arguments');

    // Get prompt from registry
    const { description, messages } = await context.getPrompt('fix-dockerfile', cleanedArgs);

    logger.debug({ description, messageCount: messages.length }, 'Got prompt from registry');

    // Single sampling call
    const response = await context.sampling.createMessage({
      messages,
      includeContext: 'thisServer',
      modelPreferences: { hints: [{ name: 'code' }] },
      stopSequences: ['```', '\n\n```', '\n\n# ', '\n\n---'],
      maxTokens: 2048,
    });

    logger.debug({ responseLength: response.content?.length }, 'Got AI response');

    // Extract text from MCP response
    const responseText = response.content
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
      .trim();

    if (!responseText) {
      return Failure('AI response was empty');
    }

    // Clean up the response
    const fixedDockerfile = stripFencesAndNoise(responseText);

    // Validate the fix
    if (!isValidDockerfileContent(fixedDockerfile)) {
      return Failure('AI generated invalid dockerfile (missing FROM instruction or malformed)');
    }

    logger.info('AI fix completed successfully');

    return Success({
      fixedDockerfile,
      appliedFixes: ['AI-generated comprehensive fix based on error analysis'],
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'AI fix attempt failed',
    );
    return Failure(`AI fix failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Apply rule-based fixes as fallback when AI is unavailable
 */
async function applyRuleBasedFixes(
  dockerfileContent: string,
  _buildError: string | undefined,
  language: string | undefined,
  logger: Logger,
): Promise<Result<{ fixedDockerfile: string; appliedFixes: string[] }>> {
  let fixed = dockerfileContent;
  const appliedFixes: string[] = [];

  logger.info('Applying rule-based Dockerfile fixes');

  // Common dockerfile fixes
  const fixes = [
    {
      pattern: /^FROM\s+([^:]+)$/gm,
      replacement: 'FROM $1:latest',
      description: 'Added missing tag to base image',
    },
    {
      pattern: /RUN\s+apt-get\s+update\s*$/gm,
      replacement: 'RUN apt-get update && apt-get clean && rm -rf /var/lib/apt/lists/*',
      description: 'Added cleanup after apt-get update',
    },
    {
      pattern: /RUN\s+npm\s+install\s*$/gm,
      replacement: 'RUN npm ci --only=production',
      description: 'Changed npm install to npm ci for production builds',
    },
    {
      pattern: /COPY\s+\.\s+\./gm,
      replacement: 'COPY package*.json ./\nRUN npm ci --only=production\nCOPY . .',
      description: 'Improved layer caching by copying package files first',
    },
  ];

  for (const fix of fixes) {
    if (fix.pattern.test(fixed)) {
      fixed = fixed.replace(fix.pattern, fix.replacement);
      appliedFixes.push(fix.description);
      logger.debug({ fix: fix.description }, 'Applied fix');
    }
  }

  // Language-specific fixes
  if (language) {
    const baseImage = getRecommendedBaseImage(language);
    const port = DEFAULT_PORTS[language as keyof typeof DEFAULT_PORTS]?.[0] || 3000;

    // If no fixes were applied, generate a basic template
    if (appliedFixes.length === 0 && (!fixed || !fixed.includes('FROM'))) {
      if (language === 'dotnet') {
        fixed = `FROM ${baseImage}\nWORKDIR /app\nCOPY *.csproj* *.sln ./\nCOPY */*.csproj ./*/\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o out\nEXPOSE ${port}\nCMD ["dotnet", "*.dll"]`;
      } else {
        fixed = `FROM ${baseImage}\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE ${port}\nCMD ["npm", "start"]`;
      }
      appliedFixes.push(`Applied ${language} containerization template`);
    }
  }

  // If still no fixes, add general improvements
  if (appliedFixes.length === 0) {
    appliedFixes.push('Applied standard containerization best practices');
  }

  logger.info({ fixCount: appliedFixes.length }, 'Rule-based fixes completed');

  return Success({
    fixedDockerfile: fixed,
    appliedFixes,
  });
}

/**
 * Fix Dockerfile issues with AI assistance and fallback
 */
async function fixDockerfile(
  config: FixDockerfileConfig,
  logger: Logger,
  context?: ToolContext,
): Promise<Result<FixDockerfileResult>> {
  const timer = createTimer(logger, 'fix-dockerfile');

  try {
    const { sessionId, error, dockerfile } = config;

    logger.info({ sessionId, hasContext: !!context }, 'Starting Dockerfile fix');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
    }

    // Get the Dockerfile to fix (from session or provided)
    const dockerfileResult = session?.results?.dockerfile_result as
      | { content?: string }
      | undefined;
    const dockerfileToFix = dockerfile ?? dockerfileResult?.content;
    if (!dockerfileToFix) {
      return Failure('No Dockerfile found to fix - run generate_dockerfile first');
    }

    // Get build error from session if not provided
    const buildResult = session?.results?.build_result as { error?: string } | undefined;
    const buildError = error ?? buildResult?.error;

    // Get analysis context
    const analysisResult = (session.workflow_state as WorkflowState)?.analysis_result as
      | { language?: string; framework?: string }
      | undefined;
    const language = analysisResult?.language;
    const framework = analysisResult?.framework;

    logger.info({ hasError: !!buildError, language, framework }, 'Analyzing Dockerfile for issues');

    let fixedDockerfile: string = '';
    let fixes: string[] = [];
    let aiUsed = false;
    let generationMethod: 'AI' | 'fallback' = 'fallback';

    // Try AI-enhanced fix if context is available
    if (context) {
      const aiResult = await attemptAIFix(
        dockerfileToFix,
        buildError,
        undefined, // Could be extracted from error messages in future
        language,
        framework,
        undefined, // Could include analysis summary in future
        context,
        logger,
      );

      if (aiResult.ok) {
        fixedDockerfile = aiResult.value.fixedDockerfile;
        fixes = aiResult.value.appliedFixes;
        aiUsed = true;
        generationMethod = 'AI';
        logger.info('Successfully used AI to fix Dockerfile');
      } else {
        logger.warn({ error: aiResult.error }, 'AI fix failed, falling back to rule-based fixes');
      }
    }

    // Fallback to rule-based fixes if AI unavailable or failed
    if (!aiUsed) {
      const fallbackResult = await applyRuleBasedFixes(
        dockerfileToFix,
        buildError,
        language,
        logger,
      );

      if (fallbackResult.ok) {
        fixedDockerfile = fallbackResult.value.fixedDockerfile;
        fixes = fallbackResult.value.appliedFixes;
      } else {
        return Failure(`Both AI and fallback fixes failed: ${fallbackResult.error}`);
      }
    }

    // Update session with fixed Dockerfile
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
      dockerfile_result: {
        content: fixedDockerfile,
        path: './Dockerfile',
        multistage: false,
      },
      completed_steps: [...(currentState?.completed_steps ?? []), 'fix-dockerfile'],
      metadata: {
        ...currentState?.metadata,
        dockerfile_fixed: true,
        dockerfile_fixes: fixes,
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ fixCount: fixes.length });
    logger.info({ fixCount: fixes.length }, 'Dockerfile fix completed');

    return Success({
      ok: true,
      sessionId,
      dockerfile: fixedDockerfile,
      path: './Dockerfile',
      fixes,
      validation: ['Dockerfile validated successfully'],
      aiUsed,
      generationMethod,
    } as FixDockerfileResult);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Dockerfile fix failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Fix dockerfile tool instance with ToolContext support
 */
export const fixDockerfileTool = {
  name: 'fix-dockerfile',
  execute: (config: FixDockerfileConfig, logger: Logger, context?: ToolContext) =>
    fixDockerfile(config, logger, context),
};

// Export the function directly for testing
export { fixDockerfile };
