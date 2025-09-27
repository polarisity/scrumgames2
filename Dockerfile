# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY server/tsconfig.json ./server/

# Install dependencies
WORKDIR /app/server
RUN npm ci

# Copy source code
COPY server/src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy built server files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server/package*.json ./server/

# Copy client files
COPY client ./client

# Expose port
EXPOSE 3000

# Set environment variable
ENV NODE_ENV=production
ENV PORT=3000

# Start the server
CMD ["node", "server/dist/index.js"]
