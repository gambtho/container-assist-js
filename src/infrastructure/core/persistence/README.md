# Session Persistence

## Current Implementation: In-Memory Store

The session management currently uses an in-memory store (`memory-store.ts`) which provides:

- **Fast performance**: < 1ms operations
- **Atomic updates**: Mutex-based locking for concurrent safety
- **Auto-cleanup**: Expired sessions removed every 5 minutes
- **Optional persistence**: JSON export/import for development continuity
- **Type safety**: Full TypeScript with Zod validation

## Why In-Memory?

1. **MCP servers are single-process**: No need for multi-process coordination
2. **Sessions are transient**: Workflow sessions don't need long-term persistence
3. **Simplicity**: No database setup or migration complexity
4. **Development speed**: Faster iteration during development

## Future Persistence Options

When persistence becomes necessary (e.g., for production deployments), the `store-factory.ts` allows easy switching to:

### SQLite (Recommended for persistence)
```typescript
// Set environment variable
SESSION_STORE_TYPE=sqlite
SESSION_STORE_PATH=./data/sessions.db

// Will use SqliteSessionStore when implemented
```

### When to Add Persistence

Consider adding persistent storage when:
- Sessions need to survive server restarts
- Running multiple server instances (rare for MCP)
- Audit trail is required
- Session data exceeds memory limits (>100MB)

## Usage

The session store is created via the factory in `dependencies.ts`:

```typescript
const storeConfig = {
  type: 'memory', // or 'sqlite' in future
};

const sessionStore = await SessionStoreFactory.create(storeConfig, logger);
const sessionService = new SessionService(sessionStore, logger, {
  persistencePath: './sessions.backup.json', // Optional JSON backup
});
```

## Development Features

### JSON Backup
For development, sessions can be persisted to JSON:

```typescript
const service = new SessionService(store, logger, {
  persistencePath: './sessions.json',
  persistenceInterval: 60, // Save every minute
});
```

This provides continuity during development without database complexity.

### Export/Import
The in-memory store supports export/import for migration:

```typescript
// Export current sessions
const sessions = store.exportSessions();

// Import into new store
await newStore.importSessions(sessions);
```

## Adding SQLite Later

To add SQLite support:

1. Install dependency: `npm install better-sqlite3`
2. Create `sqlite-store.ts` implementing `SessionStore` interface
3. Update `store-factory.ts` to instantiate SQLite store
4. No changes needed in consuming code!

The `SessionStore` interface ensures drop-in compatibility.