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

# Copy package files
COPY packages/api/package.json ./packages/api/
WORKDIR /app/packages/api

# Install dependencies
RUN bun install --production

# Copy backend source
COPY packages/api/ ./

# Copy built frontend
COPY --from=frontend-builder /app/packages/web/dist ../web/dist

# Create drizzle directory
RUN mkdir -p drizzle

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run the server
CMD ["bun", "run", "src/index.ts"]
