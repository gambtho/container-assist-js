# JavaScript MCP Server Development Guide

## Language Choice

This project uses **JavaScript (ES Modules)** rather than TypeScript for the following reasons:

1. **Simplicity**: Direct JavaScript execution without build step
2. **MCP SDK Compatibility**: Works directly with @modelcontextprotocol/sdk
3. **Fast Iteration**: No compilation required during development
4. **Runtime Validation**: Zod provides runtime type safety where needed

## Project Structure

```
js-mcp/
├── src/
│   ├── domain/          # Business logic and types
│   ├── service/         # Service layer with tools
│   ├── infrastructure/  # External integrations
│   └── shared/          # Shared utilities
├── server.js            # Entry point
└── package.json         # Dependencies
```

## Type Safety

While using JavaScript, we maintain type safety through:

1. **Zod Schemas**: Runtime validation at all external boundaries
   - All tool inputs validated with Zod
   - All tool outputs validated with Zod
   - Session state validated with Zod

2. **JSDoc Comments**: Type hints for IDEs
   - Function parameters documented
   - Return types specified
   - Complex types defined with @typedef

3. **Result Pattern**: Consistent error handling
   - `Result<T>` type for success/failure
   - Explicit error codes
   - Structured error messages

## Development Workflow

### Running the Server
```bash
npm start              # Production mode
npm run dev           # Development with nodemon
```

### Testing
```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration # Integration tests
```

### Code Quality
```bash
npm run lint          # ESLint check
npm run format        # Prettier formatting
```

## Adding New Tools

1. Define Zod schemas in `src/service/tools/schemas.js`
2. Add tool configuration to `src/service/tools/config.js`
3. Implement handler in `src/service/tools/handlers/`
4. Schemas automatically enforce validation

## MCP Integration

The server uses MCP SDK v0.5.0+ with:
- Sampling capability for AI integration
- Tool registration with JSON schemas
- Stdio transport for communication

## Dependencies

### Core
- `@modelcontextprotocol/sdk` - MCP protocol
- `zod` - Runtime validation
- `pino` - Structured logging
- `better-sqlite3` - Session persistence

### Infrastructure
- `dockerode` - Docker operations
- `@kubernetes/client-node` - K8s operations
- `js-yaml` - YAML parsing
- `execa` - CLI tool execution

## Session Management

Sessions are persisted in SQLite with:
- Atomic updates with optimistic locking
- WAL mode for concurrent access
- Automatic expiry handling
- Migration support from Go BoltDB

## Error Handling

Consistent error handling with:
- Domain error codes
- Error context preservation
- Structured logging
- Graceful degradation

## Performance Considerations

- Lazy loading of prompt templates
- Connection pooling for SQLite
- Stream processing for large outputs
- Parallel tool execution where possible