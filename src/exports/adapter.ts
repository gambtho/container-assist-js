/**
 * Tool adapter for converting internal tools to MCPTool interface
 */

import type { Tool, Result } from '../domain/types.js';
import type { MCPTool, MCPToolResult } from './types.js';
import { pino } from 'pino';
import { createStandaloneContext } from './standalone-context.js';

const logger = pino({ name: 'tool-adapter' });

/**
 * Format internal Result type to MCPToolResult
 */
function formatResult(result: Result<any> | any, toolName?: string): MCPToolResult {
  // Handle Result<T> pattern
  if (result && typeof result === 'object' && 'ok' in result) {
    if (result.ok) {
      const value = result.value;

      // Special handling for generate_dockerfile - don't include full content
      if (toolName === 'generate_dockerfile' && value.path && value.content) {
        logger.debug(
          { toolName, hasPath: !!value.path, hasContent: !!value.content },
          'Formatting generate_dockerfile result',
        );
        return {
          content: [
            {
              type: 'text',
              text:
                `✅ Dockerfile generated successfully at ${value.path}\n` +
                `Base image: ${value.baseImage || 'default'}\n` +
                `Optimization: ${value.optimization ? 'enabled' : 'disabled'}\n` +
                `Multi-stage: ${value.multistage ? 'yes' : 'no'}${
                  value.warnings && value.warnings.length > 0
                    ? `\n⚠️ Warnings:\n${value.warnings.map((w: string) => `  - ${w}`).join('\n')}`
                    : ''
                }${value.sessionId ? `\nSession: ${value.sessionId}` : ''}`,
            },
          ],
        };
      }

      // Special handling for analyze_repo - provide summary
      if (toolName === 'analyze_repo' && value.language) {
        return {
          content: [
            {
              type: 'text',
              text:
                `✅ Repository analyzed successfully\n` +
                `Language: ${value.language}\n` +
                `Framework: ${value.framework || 'none detected'}\n` +
                `Build system: ${value.buildSystem?.type || 'none detected'}\n` +
                `Dependencies: ${value.dependencies?.length || 0} found\n` +
                `Ports: ${value.ports?.join(', ') || 'none detected'}${
                  value.sessionId ? `\nSession: ${value.sessionId}` : ''
                }`,
            },
          ],
        };
      }

      // Special handling for build_image
      if (toolName === 'build_image' && value.imageId) {
        return {
          content: [
            {
              type: 'text',
              text:
                `✅ Image built successfully\n` +
                `Image ID: ${value.imageId}\n` +
                `Size: ${value.size || 'unknown'}\n` +
                `Layers: ${value.layers || 'unknown'}${
                  value.buildTime ? `\nBuild time: ${value.buildTime}` : ''
                }${value.sessionId ? `\nSession: ${value.sessionId}` : ''}`,
            },
          ],
        };
      }

      // Default: return value as string or JSON
      return {
        content: [
          {
            type: 'text',
            text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${result.error}`,
          },
        ],
      };
    }
  }

  // Handle direct response
  return {
    content: [
      {
        type: 'text',
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Adapt internal Tool to MCPTool interface for external consumption
 */
export function adaptTool(tool: Tool): MCPTool {
  return {
    name: tool.name,
    metadata: {
      title: tool.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      description: tool.description || `${tool.name} tool`,
      inputSchema: tool.schema || { type: 'object', properties: {} },
    },
    handler: async (params: any) => {
      try {
        // Create a standalone context that uses the configured server
        const toolContext = createStandaloneContext(
          params, // Pass params to extract sessionId if present
          logger.child({ tool: tool.name }),
        );
        const result = await tool.execute(
          params || {},
          logger.child({ tool: tool.name }),
          toolContext,
        );
        const formatted = formatResult(result, tool.name);
        logger.debug(
          {
            tool: tool.name,
            resultOk: result?.ok,
            formattedContent: formatted.content?.[0]?.text?.substring(0, 100),
          },
          'Tool execution complete',
        );
        return formatted;
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${tool.name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  };
}
