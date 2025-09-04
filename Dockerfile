# AI-Optimized Dockerfile for javascript
# Generated on 2025-09-04T03:04:17.921Z

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependency files first for better caching
COPY package*.json ./
RUN npm ci --only=production


# Runtime stage
FROM node:18-alpine
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser

# Copy built artifacts
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .



# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

USER appuser
CMD ["node", "index.js"]