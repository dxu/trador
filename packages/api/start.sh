#!/bin/bash

echo "🔄 Running database migrations..."
bunx drizzle-kit push || echo "⚠️ Migration warning (may be okay if tables exist)"

echo "🚀 Starting server..."
exec bun run src/index.ts
