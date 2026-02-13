/**
 * Multi-Stage Dockerfile for ContentCraft
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

# Stage 1: Build Client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm ci

# Copy client source
COPY client/ ./

# Build client for production
RUN npm run build

# Stage 2: Build Server
FROM node:20-alpine AS server-builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install server dependencies
RUN npm ci --only=production

# Copy server source
COPY src/ ./src/
COPY tsconfig.server.json ./

# Build server
RUN npm run build:server

# Stage 3: Production Image
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy server dependencies from builder
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/package*.json ./

# Copy built server
COPY --from=server-builder /app/dist ./dist

# Copy client build to server's static directory
COPY --from=client-builder /app/client/dist ./dist/client

# Copy schemas (needed at runtime)
COPY src/server/schemas ./dist/server/schemas

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server/index.js"]
