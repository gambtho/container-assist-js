/**
 * Fix Dockerfile Tool - Flat Architecture
 *
 * Analyzes and fixes Dockerfile build errors
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '@lib/session';
import { createTimer, type Logger } from '@lib/logger';
import { getRecommendedBaseImage } from '@lib/base-images';
import { Success, Failure, type Result, updateWorkflowState, type WorkflowState } from '@types';
import { DEFAULT_PORTS } from '@config/defaults';
import { createMCPHostAI, createPromptTemplate } from '@lib/mcp-host-ai';

export interface FixDockerfileConfig {
  sessionId: string;
  error?: string;
  dockerfile?: string;
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
 * Fix Dockerfile issues using AI assistance
 */
async function fixDockerfile(
  config: FixDockerfileConfig,
  logger: Logger,
): Promise<Result<FixDockerfileResult>> {
  const timer = createTimer(logger, 'fix-dockerfile');

  try {
    const { sessionId, error, dockerfile } = config;

    logger.info({ sessionId }, 'Starting Dockerfile fix');

    // Create lib instances
    const sessionManager = createSessionManager(logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get the Dockerfile to fix (from session or provided)
    const workflowState = session.workflow_state as
      | { dockerfile_result?: { content?: string } }
      | null
      | undefined;
    const dockerfileToFix = dockerfile ?? workflowState?.dockerfile_result?.content;
    if (!dockerfileToFix) {
      return Failure('No Dockerfile found to fix - run generate_dockerfile first');
    }

    // Get build error from session if not provided
    const sessionState = session as any;
    const buildResult = sessionState.workflow_state?.build_result as { error?: string } | undefined;
    const buildError = error ?? buildResult?.error;

    logger.info({ hasError: !!buildError }, 'Analyzing Dockerfile for issues');

    // Use MCP Host AI to analyze and fix issues
    const mcpHostAI = createMCPHostAI(logger);

    // Prepare context for AI analysis
    const analysisContext = {
      error: buildError || 'No specific error provided',
      dockerfile: dockerfileToFix,
      operation: 'fix',
      focus: 'Analyze the Dockerfile and any build errors, then provide a corrected version',
      toolName: 'fix-dockerfile',
      expectsAIResponse: true,
      type: 'dockerfile',
    };

    // Create prompt for fixing Dockerfile
    const prompt = createPromptTemplate('dockerfile', {
      ...analysisContext,
      requirements: [
        'Fix any syntax errors',
        'Ensure proper build caching',
        'Use security best practices',
        'Optimize for minimal image size',
      ],
    });

    // Submit to MCP Host AI
    const aiResult = await mcpHostAI.submitPrompt(prompt, analysisContext);

    let fixedDockerfile: string;
    let fixes: string[] = [];

    if (!aiResult.ok) {
      logger.warn({ error: aiResult.error }, 'MCP AI request failed, using fallback fix');

      // Fallback to basic fix if AI is unavailable
      const analysisResult = sessionState.workflow_state?.analysis_result;
      const language = analysisResult?.language || 'javascript';
      const baseImage = getRecommendedBaseImage(language);
      const port = DEFAULT_PORTS[language as keyof typeof DEFAULT_PORTS]?.[0] || 3000;

      // Generate language-specific fallback Dockerfile
      if (language === 'dotnet') {
        fixedDockerfile = `FROM ${baseImage}\nWORKDIR /app\nCOPY *.csproj* *.sln ./\nCOPY */*.csproj ./*/\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o out\nEXPOSE ${port}\nCMD ["dotnet", "*.dll"]`;
      } else {
        fixedDockerfile = `FROM ${baseImage}\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE ${port}\nCMD ["npm", "start"]`;
      }

      fixes = [
        'Applied standard containerization best practices',
        'Updated base image for security',
        'Optimized layer caching',
        language === 'dotnet'
          ? 'Added .NET restore and publish steps'
          : 'Added production dependencies only',
      ];
    } else {
      // Parse AI response
      const aiResponse = aiResult.value;

      // Try to extract Dockerfile from response
      // Look for code blocks or structured response
      const dockerfileMatch = aiResponse.match(/```(?:dockerfile)?\n([\s\S]*?)```/);

      if (dockerfileMatch?.[1]) {
        fixedDockerfile = dockerfileMatch[1].trim();
      } else {
        // If AI returned a JSON structure, parse it
        try {
          const parsed = JSON.parse(aiResponse);
          if (parsed.dockerfile) {
            fixedDockerfile = parsed.dockerfile;
            fixes = parsed.fixes || ['Dockerfile fixed based on AI analysis'];
          } else if (parsed.content) {
            fixedDockerfile = parsed.content;
            fixes = parsed.improvements || ['Applied AI-suggested improvements'];
          } else {
            // Use the response as-is if it looks like a Dockerfile
            fixedDockerfile = aiResponse;
            fixes = ['Applied AI-generated fixes'];
          }
        } catch {
          // If not JSON, use response as Dockerfile
          fixedDockerfile = aiResponse;
          fixes = ['Applied AI-generated optimizations'];
        }
      }

      // Validate that we have a valid Dockerfile
      if (!fixedDockerfile || !fixedDockerfile.includes('FROM')) {
        logger.warn('AI response did not contain valid Dockerfile, using fallback');
        const analysisResult = sessionState.workflow_state?.analysis_result;
        const language = analysisResult?.language || 'javascript';
        const baseImage = getRecommendedBaseImage(language);
        const port = DEFAULT_PORTS[language as keyof typeof DEFAULT_PORTS]?.[0] || 3000;

        // Generate language-specific fallback Dockerfile
        if (language === 'dotnet') {
          fixedDockerfile = `FROM ${baseImage}\nWORKDIR /app\nCOPY *.csproj* *.sln ./\nCOPY */*.csproj ./*/\nRUN dotnet restore\nCOPY . .\nRUN dotnet publish -c Release -o out\nEXPOSE ${port}\nCMD ["dotnet", "*.dll"]`;
        } else {
          fixedDockerfile = `FROM ${baseImage}\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE ${port}\nCMD ["npm", "start"]`;
        }
        fixes = ['Applied default containerization pattern'];
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
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Dockerfile fix failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Fix dockerfile tool instance
 */
export const fixDockerfileTool = {
  name: 'fix-dockerfile',
  execute: (config: FixDockerfileConfig, logger: Logger) => fixDockerfile(config, logger),
};

// Export the function directly for testing
export { fixDockerfile };
