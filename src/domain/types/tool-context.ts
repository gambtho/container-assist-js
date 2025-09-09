/**
 * Domain Types - Tool Context
 *
 * DEPRECATED: This file previously re-exported ToolContext types.
 *
 * ## Migration Guide
 *
 * All tools should now import ToolContext directly from MCP:
 *
 * ```typescript
 * import type { ToolContext } from '@mcp/context/types';
 * ```
 *
 * ## Key Changes from Previous Context Types
 *
 * 1. **Unified Interface**: Single ToolContext replaces multiple context interfaces
 * 2. **Required Logger**: Logger is now required, not optional
 * 3. **Simplified AI Access**: Direct sampling instead of complex AI service chains
 * 4. **MCP Protocol Compliance**: All AI interactions use proper MCP protocols
 *
 * @see {@link ../../mcp/context/types.ts} for implementation details
 * @since 2.0.0 - Part of the anti-pattern refactoring effort
 * @deprecated Import directly from '@mcp/context/types' instead
 */
