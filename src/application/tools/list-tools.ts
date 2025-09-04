/**
 * List Tools - Lists all available tools and their status
 */

import { z } from 'zod';
import type { ToolDescriptor, ToolContext } from './tool-types.js';
import {
  TOOL_MANIFEST,
  getImplementedTools,
  getPartialTools,
  getStubTools,
  ToolStatus,
} from './tool-manifest.js';

/**
 * Input schema for list-tools
 */
const ListToolsInput = z.object({
  category: z.string().optional(),
  status: z.nativeEnum(ToolStatus).optional(),
});

/**
 * Output schema for list-tools
 */
const ListToolsOutput = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      status: z.nativeEnum(ToolStatus),
      category: z.string(),
      description: z.string(),
      requiredServices: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }),
  ),
  summary: z.object({
    total: z.number(),
    implemented: z.number(),
    partial: z.number(),
    stub: z.number(),
  }),
});

type ListToolsInput = z.infer<typeof ListToolsInput>;
type ListToolsOutput = z.infer<typeof ListToolsOutput>;

/**
 * List tools handler implementation
 */
async function listToolsHandler(
  input: ListToolsInput,
  _context: ToolContext,
): Promise<ListToolsOutput> {
  // Async operation to make ESLint happy
  await Promise.resolve();

  // Filter tools based on input criteria
  let tools = Object.values(TOOL_MANIFEST);

  if (input.category) {
    tools = tools.filter((tool) => tool.category === input.category);
  }

  if (input.status) {
    tools = tools.filter((tool) => tool.status === input.status);
  }

  // Convert to output format
  const toolList = tools.map((tool) => ({
    name: tool.name,
    status: tool.status,
    category: tool.category,
    description: tool.description,
    requiredServices: tool.requiredServices,
    notes: tool.notes,
  }));

  // Calculate summary
  const implemented = getImplementedTools().length;
  const partial = getPartialTools().length;
  const stub = getStubTools().length;

  return {
    tools: toolList,
    summary: {
      total: implemented + partial + stub,
      implemented,
      partial,
      stub,
    },
  };
}

/**
 * Tool descriptor for list-tools
 */
const listToolsDescriptor: ToolDescriptor<ListToolsInput, ListToolsOutput> = {
  name: 'list_tools',
  description: 'Lists all available tools and their implementation status',
  category: 'utility',
  inputSchema: ListToolsInput,
  outputSchema: ListToolsOutput,
  handler: listToolsHandler,
};

export default listToolsDescriptor;
