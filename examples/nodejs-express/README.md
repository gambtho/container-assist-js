# Node.js Express API Example

A complete example demonstrating containerization of a Node.js Express API with TypeScript, database integration, and health checks.

## Overview

This example shows how to use Container Kit MCP Server to:
- Analyze a TypeScript Express application
- Generate optimized multi-stage Dockerfile
- Build and scan container images
- Generate Kubernetes manifests
- Deploy to Kubernetes with monitoring

## Application Features

- **Express.js** with TypeScript
- **PostgreSQL** database integration
- **Health check** endpoints
- **API documentation** with OpenAPI/Swagger
- **Error handling** middleware
- **Request logging** with structured logs
- **Environment-based** configuration

## Quick Start

### 1. Install Dependencies

```bash
cd examples/nodejs-express
npm install
```

### 2. Start Development Server

```bash
# Copy environment configuration
cp .env.example .env

# Start local database (optional)
docker-compose up -d postgres

# Start development server
npm run dev
```

### 3. Test the Application

```bash
# Health check
curl http://localhost:3000/health

# API endpoints  
curl http://localhost:3000/api/users
curl http://localhost:3000/api/users/1
```

### 4. Containerize with MCP Server

```bash
# Start MCP server (in another terminal)
cd ../..
npm run start:dev

# Analyze the application
echo '{
  "jsonrpc": "2.0",
  "method": "tools/analyze_repository",
  "params": {
    "repo_path": "'$(pwd)'/examples/nodejs-express"
  },
  "id": 1
}' | dist/bin/cli.js
```

### 5. Run Complete Workflow

```bash
# Full containerization workflow
echo '{
  "jsonrpc": "2.0", 
  "method": "tools/start_workflow",
  "params": {
    "repo_path": "'$(pwd)'/examples/nodejs-express",
    "workflow_type": "full",
    "options": {
      "scan": true,
      "deploy": true,
      "namespace": "express-demo"
    }
  },
  "id": 1
}' | dist/bin/cli.js
```

## Expected Results

### Repository Analysis
```json
{
  "success": true,
  "language": "typescript",
  "framework": "express", 
  "frameworkVersion": "^4.18.2",
  "buildSystem": {
    "type": "npm",
    "buildFile": "package.json",
    "buildCommand": "npm run build",
    "testCommand": "npm test"
  },
  "dependencies": [
    {
      "name": "express",
      "version": "^4.18.2",
      "type": "runtime"
    },
    {
      "name": "pg",
      "version": "^8.8.0", 
      "type": "runtime"
    }
  ],
  "ports": [3000],
  "hasDockerfile": false,
  "recommendations": {
    "baseImage": "node:18-alpine",
    "buildStrategy": "multi-stage"
  }
}
```

### Generated Dockerfile
```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Build application
RUN npm run build

# Runtime stage
FROM node:18-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S express -u 1001 -G nodejs

# Install tini for proper signal handling
RUN apk add --no-cache tini

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy any static files
COPY public ./public

# Set ownership to non-root user
RUN chown -R express:nodejs /app
USER express

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["npm", "start"]
```

### Kubernetes Manifests

Generated manifests in `k8s/` directory:

#### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: express-api
  namespace: express-demo
spec:
  replicas: 3
  selector:
    matchLabels:
      app: express-api
  template:
    metadata:
      labels:
        app: express-api
    spec:
      containers:
      - name: express-api
        image: express-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: express-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: express-api-service
  namespace: express-demo
spec:
  selector:
    app: express-api
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

## Application Structure

```
nodejs-express/
├── src/
│   ├── controllers/       # Route controllers
│   │   ├── health.ts     # Health check endpoints
│   │   └── users.ts      # User API endpoints
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts       # Authentication
│   │   ├── cors.ts       # CORS configuration
│   │   ├── error.ts      # Error handling
│   │   └── logging.ts    # Request logging
│   ├── models/           # Data models
│   │   └── user.ts       # User model
│   ├── routes/           # Route definitions
│   │   ├── api.ts        # API routes
│   │   └── health.ts     # Health routes
│   ├── services/         # Business logic services
│   │   ├── database.ts   # Database connection
│   │   └── users.ts      # User service
│   ├── utils/            # Utilities
│   │   ├── config.ts     # Configuration management
│   │   └── logger.ts     # Structured logging
│   └── app.ts            # Express application setup
├── test/                 # Test files
│   ├── integration/      # Integration tests
│   └── unit/             # Unit tests
├── public/               # Static files
├── k8s/                  # Generated Kubernetes manifests
├── docker-compose.yml    # Local development stack
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .env.example          # Environment template
└── README.md             # This file
```

## Workflow Customization

### Build-Only Workflow
```bash
echo '{
  "jsonrpc": "2.0",
  "method": "tools/start_workflow", 
  "params": {
    "repo_path": "'$(pwd)'/examples/nodejs-express",
    "workflow_type": "build-only",
    "options": {
      "optimization": "size",
      "skip_tests": false,
      "scan": true
    }
  },
  "id": 1
}' | ../../dist/bin/cli.js
```

### Custom Dockerfile Generation
```bash
echo '{
  "jsonrpc": "2.0",
  "method": "tools/generate_dockerfile",
  "params": {
    "session_id": "express-session-123",
    "optimization": "security",
    "custom_instructions": "Add nginx reverse proxy and enable gzip compression",
    "custom_commands": [
      "RUN apk add --no-cache nginx",
      "COPY nginx.conf /etc/nginx/nginx.conf"
    ]
  },
  "id": 1
}' | ../../dist/bin/cli.js
```

### Production Deployment
```bash
echo '{
  "jsonrpc": "2.0",
  "method": "tools/start_workflow",
  "params": {
    "repo_path": "'$(pwd)'/examples/nodejs-express", 
    "workflow_type": "full",
    "options": {
      "registry_url": "registry.example.com",
      "namespace": "production",
      "auto_rollback": true,
      "parallel_steps": true,
      "security_hardening": true
    }
  },
  "id": 1
}' | ../../dist/bin/cli.js
```

## Testing the Example

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Docker Build Test
```bash
npm run test:docker
```

### Kubernetes Deployment Test
```bash
npm run test:k8s
```

### Load Testing
```bash
npm run test:load
```

## Monitoring and Observability

### Health Check Endpoints
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check  
- `GET /metrics` - Prometheus metrics

### Logging
Structured JSON logging with:
- Request/response logging
- Error tracking with correlation IDs
- Performance metrics
- Database query logging

### Metrics
Prometheus metrics for:
- HTTP request duration and count
- Database connection pool status
- Memory and CPU usage
- Custom business metrics

## Security Features

### Security Hardening
- Non-root user execution
- Minimal Alpine Linux base
- Security scanner integration
- Dependency vulnerability checks
- Environment variable validation

### Authentication & Authorization
- JWT token validation
- Role-based access control
- Rate limiting
- CORS configuration
- Request validation

## Performance Optimization

### Docker Optimizations
- Multi-stage builds reduce image size by ~70%
- Layer caching for faster rebuilds
- Node.js production optimizations
- Health check tuning

### Application Optimizations
- Connection pooling for database
- Response compression
- Static file caching
- Graceful shutdown handling

## Next Steps

1. **Customize the Application**: Modify the Express app for your needs
2. **Try Different Workflows**: Test build-only, deploy-only workflows
3. **Production Deployment**: Deploy to your Kubernetes cluster
4. **Monitoring Setup**: Integrate with your monitoring stack
5. **CI/CD Integration**: Add to your continuous deployment pipeline

This example provides a solid foundation for containerizing Node.js Express applications with production-ready configurations and best practices.