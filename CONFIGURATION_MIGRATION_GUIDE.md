# Configuration Migration Guide

## Overview

The js-mcp project has successfully migrated from a fragmented configuration system (17+ different interfaces) to a unified configuration system. This guide explains the migration path and how to use the new system.

## New Unified Configuration System

### Location
- **Main Module**: `src/config/`
- **Primary Import**: `import { config, ApplicationConfig } from './config/index.js'`

### Structure
```typescript
ApplicationConfig
├── server (NodeEnv, LogLevel, port, host)
├── mcp (storePath, sessionTTL, maxSessions)
├── workspace (workspaceDir, tempDir, cleanupOnExit)
├── session (store, ttl, maxSessions, persistence)
├── logging (level, format, destination, file options)
├── infrastructure
│   ├── docker (socketPath, registry, timeout)
│   ├── kubernetes (kubeconfig, namespace, context)
│   ├── scanning (enabled, scanner, severityThreshold)
│   ├── build (enableCache, parallel, buildArgs)
│   └── java (defaultVersion, JVM settings)
├── aiServices
│   ├── ai (apiKey, model, baseUrl, timeout)
│   ├── sampler (mode, templateDir, cacheEnabled)
│   └── mock (enabled, deterministicMode, errorRate)
├── workflow (mode, autoRetry, maxRetries)
└── features (aiEnabled, mockMode, enableMetrics)
```

## Migration Status

### ✅ Completed
1. **Unified Configuration Module** (`src/config/`)
   - Complete type definitions
   - Environment variable mapping
   - Validation with Zod schemas
   - Profile support (dev, prod, test, CI)

2. **Backward Compatibility Bridges**
   - `src/service/config/config.ts` - Now wraps unified config
   - `src/service/config/unified-config.ts` - Legacy DependenciesConfig support
   - `src/service/interfaces.ts` - Exports both old and new types

3. **Service Updates**
   - `Dependencies` class accepts both ApplicationConfig and UnifiedConfig
   - `ContainerKitMCPServer` uses ApplicationConfig internally
   - Legacy Config class maintained for compatibility

### 🔄 Retained for Compatibility
These files provide backward compatibility and should NOT be removed yet:
- `src/service/config/config.ts` - Legacy Config class (bridge)
- `src/service/config/unified-config.ts` - UnifiedConfig type
- `src/service/tools/config.ts` - Tool configurations

### ❌ Can Be Removed (Obsolete)
- `src/config/defaults-old.ts` - Old version of defaults file
- Any `*.backup` files
- Temporary migration files

## Usage Examples

### New Code (Recommended)
```typescript
import { config, ApplicationConfig, ConfigHelpers } from '../config/index.js';

class MyService {
  constructor(private config: ApplicationConfig) {
    // Use typed configuration
    const logLevel = this.config.server.logLevel;
    const dockerSocket = this.config.infrastructure.docker.socketPath;
  }
}

// Use the singleton
const isProduction = ConfigHelpers.isProduction(config);
```

### Legacy Code (Still Supported)
```typescript
import { Config } from './service/config/config.js';

const config = new Config();
const workspaceDir = config.workspaceDir;  // Still works
```

### Environment Variables

#### Standard Prefix
All new environment variables should use the `CONTAINERKIT_` prefix:
- `CONTAINERKIT_PORT=3000`
- `CONTAINERKIT_LOG_LEVEL=debug`
- `CONTAINERKIT_DOCKER_SOCKET=/var/run/docker.sock`

#### Legacy Support
Old environment variables are still supported:
- `NODE_ENV` → Maps to `server.nodeEnv`
- `LOG_LEVEL` → Maps to `server.logLevel`
- `WORKSPACE_DIR` → Maps to `workspace.workspaceDir`
- `DOCKER_SOCKET` → Maps to `infrastructure.docker.socketPath`

## Migration Checklist for New Services

When creating new services or updating existing ones:

1. **Import the new configuration**:
   ```typescript
   import { ApplicationConfig } from '../config/index.js';
   ```

2. **Accept ApplicationConfig in constructor**:
   ```typescript
   constructor(private config: ApplicationConfig) {}
   ```

3. **Use typed configuration paths**:
   ```typescript
   // Old
   const dockerSocket = config.dockerSocket;
   
   // New
   const dockerSocket = config.infrastructure.docker.socketPath;
   ```

4. **Use ConfigHelpers for utilities**:
   ```typescript
   import { ConfigHelpers } from '../config/index.js';
   
   const ttlMs = ConfigHelpers.parseTTL('24h');
   const isProd = ConfigHelpers.isProduction(config);
   ```

## Testing

### Unit Tests
```typescript
import { createTestConfig } from '../config/index.js';

const testConfig = createTestConfig({
  features: { mockMode: true }
});
```

### Integration Tests
```typescript
import { ConfigurationFactory } from '../config/index.js';

const config = ConfigurationFactory.createWithProfile('test', {
  // Test-specific overrides
});
```

## Configuration Profiles

Available profiles:
- **development** - Debug logging, no cleanup, performance monitoring
- **production** - Optimized settings, file persistence, strict scanning
- **test** - Mock mode, minimal logging, fast execution
- **ci** - Continuous integration, deterministic mocks

Use via `NODE_ENV`:
```bash
NODE_ENV=production npm start
```

## Validation

Configuration is automatically validated on startup. To manually validate:
```typescript
import { validateConfig } from '../config/index.js';

const result = validateConfig(myConfig);
if (!result.isValid) {
  console.error('Config errors:', result.errors);
}
```

## Future Deprecation Plan

### Phase 1 (Current)
- ✅ Unified configuration system in place
- ✅ Backward compatibility maintained
- ✅ Services can use either system

### Phase 2 (Next Quarter)
- Mark legacy Config class as `@deprecated`
- Update all internal services to use ApplicationConfig
- Update documentation to use new system only

### Phase 3 (Future)
- Remove legacy Config class
- Remove DependenciesConfig type
- Consolidate all configuration in `src/config/`

## Support

For questions or issues with configuration migration:
1. Check this guide
2. Review `src/config/defaults.ts` for examples
3. Use `ConfigurationFactory.getEnvironmentDocumentation()` for env var docs