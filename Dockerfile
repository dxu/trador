# Build frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app

# Install pnpm for faster installs
RUN npm install -g pnpm

# Copy package files
COPY package.json ./
COPY packages/web/package.json ./packages/web/

# Install frontend deps
WORKDIR /app/packages/web
RUN pnpm install

# Copy frontend source
COPY packages/web/ ./

# Build frontend
RUN pnpm run build

# Build and run backend with Bun
FROM oven/bun:1 AS backend
WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY packages/api/package.json ./packages/api/
WORKDIR /app/packages/api

# Install dependencies (including drizzle-kit for migrations)
RUN bun install

# Copy backend source
COPY packages/api/ ./

# Copy built frontend
COPY --from=frontend-builder /app/packages/web/dist ../web/dist

# Create drizzle directory and make start script executable
RUN mkdir -p drizzle && chmod +x start.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run migrations then start server
CMD ["./start.sh"]
