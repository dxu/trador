#!/bin/bash

echo "🔄 Running database migrations..."
bunx drizzle-kit migrate

echo "🚀 Starting server..."
exec bun run src/index.ts
