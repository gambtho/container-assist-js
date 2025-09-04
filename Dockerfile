# Optimized Multi-stage Dockerfile
# Container Kit MCP Server

# Base stage with common dependencies
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini

# Dependencies stage - install all dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci && \
    npm cache clean --force

# Build stage - compile TypeScript
FROM deps AS builder
COPY . .
RUN npm run build

# Production dependencies only
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Runtime stage - minimal production image
FROM base AS runtime
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001 -G appuser

# Copy production dependencies and built application
COPY --from=prod-deps --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/dist ./dist
COPY --chown=appuser:appuser package*.json ./

# Add metadata labels
LABEL org.opencontainers.image.title="Container Kit MCP Server" \
      org.opencontainers.image.description="AI-powered containerization workflow server" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/your-org/containerization-assist-js"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

USER appuser
EXPOSE 3000
CMD ["node", "dist/platform/bin/cli.js", "serve"]