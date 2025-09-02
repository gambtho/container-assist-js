/**
 * List Tools Handler - TypeScript Implementation
 * Lists all available MCP tools
 */

import { z } from 'zod'
import { Result, ok } from '../../../domain/types/result.js'
import type { ToolHandler, ToolContext } from '../tool-types.js'

// Input schema
const ListToolsInput = z.object({
  category: z.enum(['workflow', 'orchestration', 'utility', 'all']).optional(),
  verbose: z.boolean().default(false)
}).transform(data => ({
  category: data.category || 'all',
  verbose: data.verbose
}))

// Output schema
const ListToolsOutput = z.object({
  success: z.boolean(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['workflow', 'orchestration', 'utility']),
    chainHint: z.object({
      nextTool: z.string(),
      reason: z.string(),
    }).optional()
  })),
  totalCount: z.number(),
  byCategory: z.object({
    workflow: z.number(),
    orchestration: z.number(),
    utility: z.number()
  })
})

// Type aliases
export type ListToolsInputType = z.infer<typeof ListToolsInput>
export type ListToolsOutputType = z.infer<typeof ListToolsOutput>

/**
 * Get all available tools
 */
function getAllTools(): Array<{
  name: string
  description: string
  category: 'workflow' | 'orchestration' | 'utility'
  chainHint?: { nextTool: string; reason?: string }
}> {
  return [
    // Workflow tools
    {
      name: 'analyze_repository',
      description: 'Analyze repository structure and detect language, framework, and build system',
      category: 'workflow',
      chainHint: {
        nextTool: 'generate_dockerfile',
        reason: 'Generate Dockerfile based on repository analysis'
      }
    },
    {
      name: 'generate_dockerfile',
      description: 'Generate optimized Dockerfile using AI with security best practices',
      category: 'workflow',
      chainHint: {
        nextTool: 'build_image',
        reason: 'Build Docker image from generated Dockerfile'
      }
    },
    {
      name: 'build_image',
      description: 'Build Docker image from Dockerfile with progress tracking',
      category: 'workflow',
      chainHint: {
        nextTool: 'scan_image',
        reason: 'Scan built image for vulnerabilities'
      }
    },
    {
      name: 'scan_image',
      description: 'Scan Docker image for security vulnerabilities',
      category: 'workflow',
      chainHint: {
        nextTool: 'tag_image',
        reason: 'Tag the scanned image for registry push'
      }
    },
    {
      name: 'tag_image',
      description: 'Tag Docker image with version and registry information',
      category: 'workflow',
      chainHint: {
        nextTool: 'push_image',
        reason: 'Push tagged images to registry'
      }
    },
    {
      name: 'push_image',
      description: 'Push Docker images to container registry',
      category: 'workflow',
      chainHint: {
        nextTool: 'generate_k8s_manifests',
        reason: 'Generate Kubernetes manifests for deployment'
      }
    },
    {
      name: 'generate_k8s_manifests',
      description: 'Generate Kubernetes deployment manifests with best practices',
      category: 'workflow',
      chainHint: {
        nextTool: 'deploy_application',
        reason: 'Deploy generated manifests to Kubernetes cluster'
      }
    },
    {
      name: 'deploy_application',
      description: 'Deploy application to Kubernetes cluster',
      category: 'workflow',
      chainHint: {
        nextTool: 'verify_deployment',
        reason: 'Verify deployment health and get endpoints'
      }
    },
    {
      name: 'verify_deployment',
      description: 'Verify Kubernetes deployment health and get endpoints',
      category: 'workflow'
    },
    // Orchestration tools
    {
      name: 'start_workflow',
      description: 'Start complete containerization workflow',
      category: 'orchestration',
      chainHint: {
        nextTool: 'workflow_status',
        reason: 'Check workflow progress and status'
      }
    },
    {
      name: 'workflow_status',
      description: 'Get current workflow status and progress',
      category: 'orchestration'
    },
    // Utility tools
    {
      name: 'list_tools',
      description: 'List all available MCP tools',
      category: 'utility'
    },
    {
      name: 'ping',
      description: 'Test MCP server connectivity',
      category: 'utility'
    },
    {
      name: 'server_status',
      description: 'Get MCP server status and information',
      category: 'utility'
    }
  ]
}

/**
 * Main handler implementation
 */
export const listToolsHandler: ToolHandler<ListToolsInputType, ListToolsOutputType> = {
  name: 'list_tools',
  description: 'List all available MCP tools',
  category: 'utility',
  inputSchema: ListToolsInput,
  outputSchema: ListToolsOutput,

  async execute(input: ListToolsInputType, context: ToolContext): Promise<Result<ListToolsOutputType>> {
    const { logger } = context
    const { category, verbose } = input

    logger.info({category, verbose }); // Fixed logger call

    // Get all tools
    let tools = getAllTools()

    // Filter by category if specified
    if (category !== 'all') {
      tools = tools.filter(t => t.category === category)
    }

    // Count by category
    const byCategory = {
      workflow: tools.filter(t => t.category === 'workflow').length,
      orchestration: tools.filter(t => t.category === 'orchestration').length,
      utility: tools.filter(t => t.category === 'utility').length
    }

    logger.info({
      total: tools.length,
      byCategory
    }, 'Tools listed')

    return ok({
      success: true,
      tools,
      totalCount: tools.length,
      byCategory
    })
  }
}

// Default export for registry
export default listToolsHandler

