#!/bin/bash
set -e

echo "🔄 Running database migrations..."
bunx drizzle-kit push

echo "🚀 Starting server..."
exec bun run src/index.ts
