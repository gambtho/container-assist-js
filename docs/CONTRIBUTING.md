# Contributing to Container Kit MCP

## Development Setup

1. **Prerequisites**
   ```bash
   node --version  # v18+ required
   npm --version   # v9+ required
   ```

2. **Installation**
   ```bash
   git clone <repository>
   cd js-mcp
   npm install
   ```

3. **Running Tests**
   ```bash
   npm test              # Full test suite
   npm run test:unit     # Unit tests only
   npm run test:integration # Integration tests
   npm run test:performance # Performance benchmarks
   ```

4. **Development Server**
   ```bash
   npm run dev           # Development with hot reload
   npm start             # Production mode
   ```

## Code Quality Standards

### Before Submitting PRs
```bash
npm run typecheck     # TypeScript validation
npm run lint         # ESLint validation
npm run format       # Prettier formatting
npm test             # All tests must pass
```

### Code Style
- **JavaScript ES Modules**: No TypeScript compilation step
- **Zod Validation**: All external inputs validated at runtime
- **JSDoc Comments**: Type hints for IDE support
- **Result Pattern**: Use `Result<T>` for error handling
- **Structured Logging**: Use `logger.info/error/debug` with context

## Architecture Guidelines

### Adding New Tools
1. **Schema Definition** (`src/service/tools/schemas.js`)
   ```javascript
   export const myToolInput = z.object({
     param: z.string(),
   });

   export const myToolOutput = z.object({
     result: z.string(),
   });
   ```

2. **Tool Configuration** (`src/service/tools/config.js`)
   ```javascript
   myTool: {
     name: 'my_tool',
     description: 'Tool description',
     inputSchema: myToolInput,
     outputSchema: myToolOutput,
     handler: 'myTool',
   }
   ```

3. **Handler Implementation**
   ```javascript
   export async function myTool(params, context) {
     const { logger, sessionService } = context;
     
     try {
       // Implementation
       return { success: true, data: result };
     } catch (error) {
       logger.error({ error, params }, 'My tool failed');
       return { 
         success: false, 
         error: { code: 'MY_TOOL_ERROR', message: error.message }
       };
     }
   }
   ```

### Session Management
- Use `sessionService.get/set/update` for session operations
- All session data is typed and validated
- Sessions auto-expire based on configuration
- Use atomic operations for concurrent safety

### Error Handling
- Return `{ success: false, error }` for business logic errors
- Throw exceptions only for unexpected system errors
- Use domain-specific error codes
- Log errors with full context

### Testing
- **Unit Tests**: Test individual functions in isolation
- **Integration Tests**: Test complete workflows end-to-end
- **Performance Tests**: Validate performance regressions
- **Mocking**: Mock external dependencies (Docker, K8s, AI)

## Development Workflow

### Feature Development
1. Create feature branch: `feature/my-feature`
2. Implement changes with tests
3. Run quality checks locally
4. Submit PR with description

### Bug Fixes
1. Create bug branch: `fix/issue-description`
2. Add reproduction test (if not exists)
3. Implement fix
4. Verify fix with tests

### Performance Improvements
1. Add benchmark test for the performance issue
2. Implement optimization
3. Validate improvement with before/after metrics
4. Ensure no functionality regression

## Testing Guidelines

### Unit Tests
```javascript
describe('myTool', () => {
  test('should handle valid input', async () => {
    const result = await myTool({ param: 'value' }, mockContext);
    expect(result.success).toBe(true);
  });

  test('should handle invalid input', async () => {
    const result = await myTool({ param: null }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
```

### Integration Tests
```javascript
describe('workflow integration', () => {
  test('should complete full containerization workflow', async () => {
    // Test complete workflow from repository analysis to deployment
  });
});
```

### Performance Tests
```javascript
describe('performance benchmarks', () => {
  test('session operations should handle >1000 ops/sec', async () => {
    // Benchmark test with performance assertions
  });
});
```

## Documentation

### Code Documentation
- Use JSDoc for all public functions
- Include parameter types and return types
- Provide usage examples for complex functions

### README Updates
- Update tool lists when adding new tools
- Update configuration examples
- Update performance metrics after optimizations

### Architecture Documentation
- Update `docs/ARCHITECTURE.md` for structural changes
- Document design decisions and trade-offs
- Include migration guides for breaking changes

## Release Process

### Version Bumping
1. Update `package.json` version
2. Update `CHANGELOG.md` with changes
3. Tag release with `git tag v<version>`
4. Push tags: `git push origin --tags`

### Changelog Format
```markdown
## [1.2.0] - 2024-12-01

### Added
- New feature descriptions

### Changed
- Modified behavior descriptions

### Fixed
- Bug fix descriptions

### Performance
- Performance improvement descriptions
```

## Getting Help

- **Architecture Questions**: See `docs/ARCHITECTURE.md`
- **Development Setup**: See `docs/DEVELOPMENT.md`
- **Deployment**: See `docs/DEPLOYMENT_GUIDE.md`
- **Issues**: Create GitHub issue with reproduction steps

## Code Review Checklist

### For Reviewers
- [ ] Code follows style guidelines
- [ ] Tests cover new functionality
- [ ] Performance impact is acceptable
- [ ] Documentation is updated
- [ ] No security vulnerabilities introduced

### For Contributors
- [ ] All tests pass locally
- [ ] Code is formatted and linted
- [ ] Commit messages are descriptive
- [ ] PR description explains changes
- [ ] Related issues are referenced